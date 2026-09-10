"""Prepare private D1 replay files without executing backup rows or contacting D1."""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
from pathlib import Path
from typing import NamedTuple


MIB = 1024 * 1024
MAX_BACKUP_BYTES = 64 * MIB
MAX_STATEMENT_BYTES = 8 * MIB
MAX_STATEMENTS = 100_000
MAX_COMPOUND_PARTS = 256
MAX_VALIDATION_OPCODES = 250_000
PRIVATE_DIRECTORY_MODE = 0o700
PRIVATE_FILE_MODE = 0o600
DEFER_FOREIGN_KEYS = b"PRAGMA defer_foreign_keys=TRUE;\n"
EXPLAIN_PREFIX = "EXPLAIN "
OUTPUT_FILES = ("01-schema.sql", "02-data.sql", "03-indexes-and-triggers.sql")
MANIFEST_FILE = "manifest.json"


class PreparationError(ValueError):
    """A safe classification that contains no SQL or private row values."""


class Statement(NamedTuple):
    category: str
    text: str


def _sql_start(text: str) -> str:
    """Ignore leading trivia only for classification; output retains the original bytes."""
    remaining = text.lstrip()
    while remaining.startswith(("--", "/*")):
        if remaining.startswith("--"):
            end = remaining.find("\n")
            if end < 0:
                return ""
            remaining = remaining[end + 1 :].lstrip()
        else:
            end = remaining.find("*/", 2)
            if end < 0:
                raise PreparationError("Unclosed SQL comment.")
            remaining = remaining[end + 2 :].lstrip()
    return remaining


def _classify(text: str, position: int) -> str:
    normalized = _sql_start(text)
    patterns = (
        ("control", r"(?is)^PRAGMA\s+defer_foreign_keys\s*=\s*(?:TRUE|ON|1)\s*;\s*$"),
        ("table", r"(?is)^CREATE\s+TABLE\b"),
        ("index", r"(?is)^CREATE\s+(?:UNIQUE\s+)?INDEX\b"),
        ("trigger", r"(?is)^CREATE\s+TRIGGER\b"),
        ("data", r"(?is)^INSERT\s+INTO\b"),
        (
            "data",
            r'(?is)^DELETE\s+FROM\s+(?:sqlite_sequence|"sqlite_sequence"|`sqlite_sequence`|\[sqlite_sequence\])\s*;\s*$',
        ),
    )
    for category, pattern in patterns:
        if re.match(pattern, normalized):
            return category
    raise PreparationError(f"Unsupported export statement at position {position}.")


def _statements(source: bytes) -> tuple[list[Statement], bytes]:
    try:
        text = source.decode("utf-8")
    except UnicodeError:
        raise PreparationError("Backup must be valid UTF-8.") from None
    if "\x00" in text:
        raise PreparationError("Backup contains an unsupported NUL byte.")
    result: list[Statement] = []
    start = 0
    offset = 0
    quote: str | None = None
    comment: str | None = None
    compound_parts = 0
    while offset < len(text):
        character = text[offset]
        pair = text[offset : offset + 2]
        if comment == "line":
            if character == "\n":
                comment = None
        elif comment == "block":
            if pair == "*/":
                comment = None
                offset += 1
        elif quote is not None:
            if character == quote:
                if (
                    quote != "]"
                    and offset + 1 < len(text)
                    and text[offset + 1] == quote
                ):
                    offset += 1
                else:
                    quote = None
        elif pair == "--":
            comment = "line"
            offset += 1
        elif pair == "/*":
            comment = "block"
            offset += 1
        elif character in "'\"`[":
            quote = "]" if character == "[" else character
        elif character == ";":
            compound_parts += 1
            if compound_parts > MAX_COMPOUND_PARTS:
                raise PreparationError(
                    "A compound statement exceeds the preparation parsing limit."
                )
            candidate = text[start : offset + 1]
            if len(candidate.encode("utf-8")) > MAX_STATEMENT_BYTES:
                raise PreparationError(
                    "A statement exceeds the preparation byte limit."
                )
            if sqlite3.complete_statement(candidate):
                if len(result) >= MAX_STATEMENTS:
                    raise PreparationError(
                        "Backup exceeds the preparation statement limit."
                    )
                result.append(
                    Statement(_classify(candidate, len(result) + 1), candidate)
                )
                start = offset + 1
                compound_parts = 0
        offset += 1
    trailing = text[start:]
    if quote is not None or comment == "block" or _sql_start(trailing):
        raise PreparationError("Incomplete or malformed trailing SQL statement.")
    if not any(statement.category == "table" for statement in result):
        raise PreparationError("Backup contains no supported table schema.")
    return result, trailing.encode("utf-8")


def _authorize(
    action: int,
    first: str | None,
    second: str | None,
    database: str | None,
    _trigger: str | None,
) -> int:
    denied = (
        sqlite3.SQLITE_ATTACH,
        sqlite3.SQLITE_DETACH,
        sqlite3.SQLITE_PRAGMA,
        sqlite3.SQLITE_TRANSACTION,
        sqlite3.SQLITE_SAVEPOINT,
        sqlite3.SQLITE_SELECT,
    )
    if action in denied or database not in (None, "main"):
        return sqlite3.SQLITE_DENY
    function = (second or first or "").lower()
    if action == sqlite3.SQLITE_FUNCTION and function in (
        "load_extension",
        "readfile",
        "writefile",
    ):
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def _validate(statements: list[Statement]) -> None:
    """Create only empty in-memory schema; EXPLAIN compiles data without running it."""
    connection = sqlite3.connect(":memory:")
    try:
        connection.setlimit(
            sqlite3.SQLITE_LIMIT_SQL_LENGTH, MAX_STATEMENT_BYTES + len(EXPLAIN_PREFIX)
        )
        connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, MAX_STATEMENT_BYTES)
        connection.setlimit(sqlite3.SQLITE_LIMIT_VDBE_OP, MAX_VALIDATION_OPCODES)
        connection.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
        connection.set_authorizer(_authorize)
        for category in ("table", "data", "index", "trigger"):
            for position, statement in enumerate(statements, start=1):
                if statement.category != category:
                    continue
                command = (
                    EXPLAIN_PREFIX + statement.text
                    if category == "data"
                    else statement.text
                )
                try:
                    connection.execute(command).close()
                except (sqlite3.Error, MemoryError):
                    raise PreparationError(
                        f"SQL syntax or export policy failed at statement {position} ({category})."
                    ) from None
    finally:
        connection.close()


def _read_backup(filename: Path) -> bytes:
    try:
        if not stat.S_ISREG(filename.lstat().st_mode):
            raise PreparationError("Backup must be a regular nonsymlink file.")
        with filename.open("rb") as source:
            data = source.read(MAX_BACKUP_BYTES + 1)
    except OSError:
        raise PreparationError("Could not read the selected private backup.") from None
    if len(data) > MAX_BACKUP_BYTES:
        raise PreparationError("Backup exceeds the preparation byte limit.")
    return data


def _same_directory(directory: Path, identity: os.stat_result) -> None:
    current = directory.lstat()
    if not stat.S_ISDIR(current.st_mode) or not os.path.samestat(current, identity):
        raise PreparationError("Private output directory changed during preparation.")


def _outside_git_tree(directory: Path) -> None:
    """Plaintext replay files must not enter a normal, linked, or metadata Git tree."""
    for ancestor in (directory, *directory.parents):
        try:
            try:
                (ancestor / ".git").lstat()
                has_marker = True
            except FileNotFoundError:
                has_marker = False
            has_metadata = (
                (ancestor / "HEAD").is_file()
                and (ancestor / "objects").is_dir()
                and (ancestor / "refs").is_dir()
            )
        except OSError:
            raise PreparationError(
                "Could not establish that private output is outside Git."
            ) from None
        if has_marker or has_metadata:
            raise PreparationError(
                "Private output must be outside every Git worktree and metadata directory."
            )


def _write_private_file(
    filename: Path, chunks: list[bytes], owned: dict[Path, os.stat_result]
) -> str:
    descriptor = os.open(
        filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, PRIVATE_FILE_MODE
    )
    owned[filename] = os.fstat(descriptor)
    digest = hashlib.sha256()
    with os.fdopen(descriptor, "wb") as output:
        for chunk in chunks:
            output.write(chunk)
            digest.update(chunk)
        output.flush()
        os.fsync(output.fileno())
    return digest.hexdigest()


def prepare_replay(
    source: Path, output: Path, expected_sha256: str
) -> dict[str, object]:
    """Write a new private replay directory only after backup hash and syntax checks pass."""
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise PreparationError(
            "Expected backup SHA-256 must contain 64 hexadecimal characters."
        )
    original = _read_backup(source)
    digest = hashlib.sha256(original).hexdigest()
    if digest != expected_sha256.lower():
        raise PreparationError("Backup SHA-256 does not match the recorded value.")
    statements, trailing = _statements(original)
    _validate(statements)
    try:
        parent = output.parent.resolve(strict=True)
    except OSError:
        raise PreparationError("Private output parent must already exist.") from None
    _outside_git_tree(parent)
    destination = parent / output.name
    try:
        destination.mkdir(mode=PRIVATE_DIRECTORY_MODE, exist_ok=False)
    except FileExistsError:
        raise PreparationError(
            "Output already exists; no files were overwritten."
        ) from None
    identity = destination.lstat()
    owned: dict[Path, os.stat_result] = {}
    manifest: dict[str, object] = {
        "formatVersion": 1,
        "sourceSha256": digest,
        "sourceBytes": len(original),
        "syntaxValidated": True,
        "backupRowsExecuted": False,
        "phases": [],
    }
    try:
        controls = [
            statement.text.encode("utf-8")
            for statement in statements
            if statement.category == "control"
        ]
        prefix = controls + [b"\n"] if controls else [DEFER_FOREIGN_KEYS]
        categories = (("table",), ("data",), ("index", "trigger"))
        phases = []
        for filename, order in zip(OUTPUT_FILES, categories, strict=True):
            selected = [
                statement.text.encode("utf-8")
                for category in order
                for statement in statements
                if statement.category == category
            ]
            chunks = (
                prefix + selected + ([trailing] if filename == OUTPUT_FILES[-1] else [])
            )
            _same_directory(destination, identity)
            _outside_git_tree(destination)
            checksum = _write_private_file(destination / filename, chunks, owned)
            phases.append(
                {"file": filename, "statements": len(selected), "sha256": checksum}
            )
        manifest["phases"] = phases
        if hashlib.sha256(_read_backup(source)).hexdigest() != digest:
            raise PreparationError("Source backup changed during preparation.")
        _same_directory(destination, identity)
        _outside_git_tree(destination)
        _write_private_file(
            destination / MANIFEST_FILE,
            [(json.dumps(manifest, indent=2) + "\n").encode("utf-8")],
            owned,
        )
        return manifest
    except Exception:
        try:
            _same_directory(destination, identity)
            for filename, file_identity in owned.items():
                if not os.path.samestat(filename.lstat(), file_identity):
                    raise PreparationError(
                        "Private output ownership changed during cleanup."
                    )
                filename.unlink()
            destination.rmdir()
        except OSError:
            raise PreparationError(
                "Partial private output could not be cleaned; inspect it privately."
            ) from None
        raise


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, _message: str) -> None:
        raise PreparationError(
            "Invalid arguments; use --help for the required options."
        )


def main(argv: list[str] | None = None) -> int:
    parser = PrivateArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", required=True, type=Path, metavar="PRIVATE_SQL_EXPORT"
    )
    parser.add_argument(
        "--output", required=True, type=Path, metavar="NEW_PRIVATE_DIRECTORY"
    )
    parser.add_argument("--expected-sha256", required=True, metavar="RECORDED_SHA256")
    try:
        arguments = parser.parse_args(argv)
        prepare_replay(arguments.input, arguments.output, arguments.expected_sha256)
    except PreparationError as error:
        print(f"Preparation refused: {error}", file=sys.stderr)
        return 1
    except Exception:
        print(
            "Preparation failed; inspect the selected private input/output locations.",
            file=sys.stderr,
        )
        return 1
    print(
        "Prepared three private SQL replay phases and a hash manifest. No D1 instance was contacted."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
