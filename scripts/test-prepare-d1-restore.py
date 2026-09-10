"""Private replay preparation tests use only synthetic exports and in-memory SQLite."""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SOURCE = Path(__file__).resolve().with_name("prepare-d1-restore.py")
SPEC = importlib.util.spec_from_file_location("prepare_d1_restore", SOURCE)
RECOVERY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECOVERY)

EXPORT = b"""-- Private fixture; comment semicolon stays a comment.
PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), note TEXT);
INSERT INTO child VALUES(7,1,'Quoted ''; semi; colon');
CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT);
CREATE TABLE audit (entry TEXT);
CREATE TRIGGER parent_audit AFTER INSERT ON parent BEGIN
  INSERT INTO audit VALUES('new; insert');
  UPDATE parent SET label=upper(NEW.label) WHERE id=NEW.id;
END;
INSERT INTO parent VALUES(1,'Original; owner');
INSERT INTO audit VALUES('restored; history');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('parent',9);
CREATE UNIQUE INDEX child_note_unique ON child(note);
-- trailing private fixture comment
"""


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="lumafoil-recovery-test-")
        self.directory = Path(self.temporary.name).resolve()
        self.source = self.directory / "private-backup.sql"
        self.output = self.directory / "prepared"
        self.source.write_bytes(EXPORT)

    def tearDown(self):
        self.assertEqual(Path(self.temporary.name).resolve(), self.directory)
        self.temporary.cleanup()

    def prepare(self, data=EXPORT, output=None):
        self.source.write_bytes(data)
        return RECOVERY.prepare_replay(
            self.source, output or self.output, hashlib.sha256(data).hexdigest()
        )

    def test_foreign_tables_exist_before_rows_and_triggers_install_after_restored_contents(
        self,
    ):
        manifest = self.prepare()
        self.assertEqual(self.source.read_bytes(), EXPORT)
        self.assertEqual(
            sorted(path.name for path in self.output.iterdir()),
            [
                "01-schema.sql",
                "02-data.sql",
                "03-indexes-and-triggers.sql",
                "manifest.json",
            ],
        )
        schema = (self.output / "01-schema.sql").read_bytes()
        data = (self.output / "02-data.sql").read_bytes()
        after = (self.output / "03-indexes-and-triggers.sql").read_bytes()
        self.assertNotIn(b"CREATE TRIGGER", schema + data)
        self.assertNotIn(b"CREATE UNIQUE INDEX", schema + data)
        self.assertLess(
            after.index(b"CREATE UNIQUE INDEX"), after.index(b"CREATE TRIGGER")
        )
        self.assertIn(b"INSERT INTO child VALUES(7,1,'Quoted ''; semi; colon');", data)
        self.assertTrue(after.endswith(b"-- trailing private fixture comment\n"))
        self.assertFalse(manifest["backupRowsExecuted"])
        self.assertTrue(manifest["syntaxValidated"])
        self.assertEqual(
            json.loads((self.output / "manifest.json").read_bytes()), manifest
        )
        for phase in manifest["phases"]:
            self.assertEqual(
                hashlib.sha256((self.output / phase["file"]).read_bytes()).hexdigest(),
                phase["sha256"],
            )

        connection = sqlite3.connect(":memory:")
        try:
            connection.execute("PRAGMA foreign_keys=ON")
            for phase in (schema, data, after):
                connection.executescript("BEGIN;\n" + phase.decode() + "\nCOMMIT;")
            self.assertEqual(
                connection.execute("SELECT * FROM child").fetchall(),
                [(7, 1, "Quoted '; semi; colon")],
            )
            self.assertEqual(
                connection.execute("SELECT * FROM parent").fetchall(),
                [(1, "Original; owner")],
            )
            self.assertEqual(
                connection.execute("SELECT * FROM audit").fetchall(),
                [("restored; history",)],
            )
            self.assertEqual(
                connection.execute("PRAGMA foreign_key_check").fetchall(), []
            )
            self.assertEqual(
                connection.execute("PRAGMA integrity_check").fetchone(), ("ok",)
            )
            connection.execute("INSERT INTO parent(label) VALUES('later')")
            self.assertEqual(
                connection.execute(
                    "SELECT id,label FROM parent ORDER BY id"
                ).fetchall(),
                [(1, "Original; owner"), (10, "LATER")],
            )
            self.assertEqual(
                connection.execute("SELECT * FROM audit").fetchall(),
                [("restored; history",), ("new; insert",)],
            )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO child VALUES(8,1,'Quoted ''; semi; colon')"
                )
        finally:
            connection.close()

    def test_semicolons_in_quoted_identifiers_comments_and_trigger_bodies_do_not_split_statements(
        self,
    ):
        source = b"""/* leading; comment */ CREATE TABLE "quoted;table" ([semi;column] TEXT);
INSERT INTO "quoted;table" VALUES('a'';b');
CREATE TABLE audit (entry TEXT);
CREATE TRIGGER `quoted;trigger` AFTER INSERT ON "quoted;table" BEGIN
 INSERT INTO audit VALUES('trigger;body'); -- inner; comment
 INSERT INTO audit VALUES('second');
END;
/* trailing; comment */"""
        result = self.prepare(source)
        self.assertEqual([phase["statements"] for phase in result["phases"]], [2, 1, 1])
        self.assertTrue(
            (self.output / "03-indexes-and-triggers.sql")
            .read_bytes()
            .endswith(b"/* trailing; comment */")
        )

    def test_validation_does_not_execute_backup_rows(self):
        class ProbeConnection(sqlite3.Connection):
            close_requested = False

            def close(self):
                self.close_requested = True

        connection = sqlite3.connect(":memory:", factory=ProbeConnection)
        try:
            with patch.object(RECOVERY.sqlite3, "connect", return_value=connection):
                self.prepare(
                    b"CREATE TABLE records(id INTEGER); INSERT INTO records VALUES(abs(-9223372036854775808));"
                )
            self.assertTrue(connection.close_requested)
            connection.set_authorizer(None)
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM records").fetchone(), (0,)
            )
        finally:
            sqlite3.Connection.close(connection)

    def test_schema_only_export_is_valid_and_deterministic(self):
        source = b"CREATE TABLE empty_records(id INTEGER);\r\n"
        first = self.prepare(source)
        second_directory = self.directory / "second"
        second = RECOVERY.prepare_replay(
            self.source, second_directory, hashlib.sha256(source).hexdigest()
        )
        self.assertEqual(first, second)
        self.assertEqual([phase["statements"] for phase in first["phases"]], [1, 0, 0])
        for filename in RECOVERY.OUTPUT_FILES:
            self.assertEqual(
                (self.output / filename).read_bytes(),
                (second_directory / filename).read_bytes(),
            )

    def test_malformed_or_incomplete_sql_never_creates_output(self):
        for source in [
            b"",
            b"\xff",
            b"CREATE TABLE a(id INTEGER);\x00",
            b"CREATE TABLE a(id INTEGER)",
            b"CREATE TABLE a(id INTEGER,,);",
            b"CREATE TABLE a(id TEXT); INSERT INTO a VALUES('unterminated;",
            b"CREATE TABLE a(id INTEGER); /* unterminated;",
            b"CREATE TABLE a(id INTEGER); CREATE TRIGGER bad AFTER INSERT ON a BEGIN SELECT 1;",
            b"CREATE TABLE a(id INTEGER); INSERT INTO a VALUES(1,2);",
        ]:
            with (
                self.subTest(category="malformed"),
                self.assertRaises(RECOVERY.PreparationError),
            ):
                self.prepare(source)
            self.assertFalse(self.output.exists())
            self.assertEqual(self.source.read_bytes(), source)

    def test_unsupported_statements_and_non_export_reads_are_refused(self):
        for statement in [
            "ATTACH DATABASE 'outside.db' AS other;",
            "VACUUM;",
            "PRAGMA foreign_keys=OFF;",
            "UPDATE records SET id=1;",
            "DELETE FROM records;",
            "DROP TABLE records;",
            "CREATE VIEW view_records AS SELECT * FROM records;",
            "CREATE VIRTUAL TABLE search USING fts5(content);",
            "BEGIN TRANSACTION;",
            "INSERT INTO records SELECT 1;",
            "CREATE TABLE copied AS SELECT 1;",
            "INSERT INTO records VALUES(load_extension('outside'));",
        ]:
            source = ("CREATE TABLE records(id INTEGER); " + statement).encode()
            with (
                self.subTest(category="unsupported"),
                self.assertRaises(RECOVERY.PreparationError),
            ):
                self.prepare(source)
            self.assertFalse(self.output.exists())

    def test_wrong_recorded_hash_refuses_without_creating_output(self):
        for expected in ["0" * 64, "not-a-digest"]:
            with (
                self.subTest(expected_kind=len(expected)),
                self.assertRaises(RECOVERY.PreparationError),
            ):
                RECOVERY.prepare_replay(self.source, self.output, expected)
            self.assertFalse(self.output.exists())
        self.assertEqual(self.source.read_bytes(), EXPORT)

    def test_existing_directory_and_file_are_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / "01-schema.sql"
        sentinel.write_bytes(b"keep operator data")
        with self.assertRaisesRegex(RECOVERY.PreparationError, "already exists"):
            self.prepare()
        self.assertEqual(sentinel.read_bytes(), b"keep operator data")
        self.assertEqual(list(self.output.iterdir()), [sentinel])
        with self.assertRaisesRegex(RECOVERY.PreparationError, "already exists"):
            self.prepare(output=self.source)
        self.assertEqual(self.source.read_bytes(), EXPORT)

    def test_failed_write_removes_only_this_attempts_partial_output(self):
        write = RECOVERY._write_private_file
        calls = 0

        def fail_second(filename, chunks, owned):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("Synthetic storage failure")
            return write(filename, chunks, owned)

        with patch.object(RECOVERY, "_write_private_file", side_effect=fail_second):
            with self.assertRaises(OSError):
                self.prepare()
        self.assertFalse(self.output.exists())
        self.assertEqual(self.source.read_bytes(), EXPORT)

    def test_output_inside_normal_or_linked_git_worktrees_is_refused(self):
        for kind in ("directory", "file"):
            repository = self.directory / kind
            nested = repository / "nested"
            nested.mkdir(parents=True)
            marker = repository / ".git"
            if kind == "directory":
                marker.mkdir()
            else:
                marker.write_text(
                    "gitdir: /private-linked-metadata\n", encoding="utf-8"
                )
            output = nested / "private-replay"
            with (
                self.subTest(kind=kind),
                self.assertRaisesRegex(RECOVERY.PreparationError, "outside every Git"),
            ):
                self.prepare(output=output)
            self.assertFalse(output.exists())
            self.assertEqual(self.source.read_bytes(), EXPORT)

    def test_output_inside_git_metadata_is_refused(self):
        metadata = self.directory / "bare-repository"
        (metadata / "objects").mkdir(parents=True)
        (metadata / "refs").mkdir()
        (metadata / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
        with self.assertRaisesRegex(RECOVERY.PreparationError, "outside every Git"):
            self.prepare(output=metadata / "private-replay")
        self.assertFalse((metadata / "private-replay").exists())

    def test_input_may_be_in_git_but_plaintext_output_must_be_outside(self):
        repository = self.directory / "source-repository"
        repository.mkdir()
        (repository / ".git").mkdir()
        source = repository / "ignored-backup.sql"
        source.write_bytes(EXPORT)
        manifest = RECOVERY.prepare_replay(
            source, self.output, hashlib.sha256(EXPORT).hexdigest()
        )
        self.assertEqual(manifest["sourceSha256"], hashlib.sha256(EXPORT).hexdigest())
        self.assertEqual(source.read_bytes(), EXPORT)

    def test_a_git_marker_appearing_during_preparation_aborts_and_removes_owned_files(
        self,
    ):
        parent = self.directory / "new-worktree"
        parent.mkdir()
        output = parent / "prepared"
        write = RECOVERY._write_private_file

        def add_marker(filename, chunks, owned):
            result = write(filename, chunks, owned)
            (parent / ".git").mkdir(exist_ok=True)
            return result

        with patch.object(RECOVERY, "_write_private_file", side_effect=add_marker):
            with self.assertRaisesRegex(RECOVERY.PreparationError, "outside every Git"):
                self.prepare(output=output)
        self.assertFalse(output.exists())
        self.assertTrue((parent / ".git").is_dir())

    def test_cleanup_does_not_delete_an_unrelated_file_added_to_the_new_directory(self):
        write = RECOVERY._write_private_file

        def collision(filename, chunks, owned):
            if filename.name == "02-data.sql":
                (self.output / "operator-note.txt").write_bytes(b"do not remove")
                raise OSError("Synthetic storage failure")
            return write(filename, chunks, owned)

        with patch.object(RECOVERY, "_write_private_file", side_effect=collision):
            with self.assertRaisesRegex(
                RECOVERY.PreparationError, "could not be cleaned"
            ):
                self.prepare()
        self.assertEqual(
            (self.output / "operator-note.txt").read_bytes(), b"do not remove"
        )
        self.assertEqual(
            sorted(path.name for path in self.output.iterdir()), ["operator-note.txt"]
        )

    def test_external_source_change_aborts_without_rewriting_the_source(self):
        write = RECOVERY._write_private_file
        changed = b"CREATE TABLE changed(id INTEGER);"

        def alter_source(filename, chunks, owned):
            result = write(filename, chunks, owned)
            self.source.write_bytes(changed)
            return result

        with patch.object(RECOVERY, "_write_private_file", side_effect=alter_source):
            with self.assertRaisesRegex(
                RECOVERY.PreparationError, "Source backup changed"
            ):
                self.prepare()
        self.assertFalse(self.output.exists())
        self.assertEqual(self.source.read_bytes(), changed)

    def test_limits_refuse_instead_of_truncating_the_export(self):
        for setting, limit in [
            ("MAX_BACKUP_BYTES", 1),
            ("MAX_STATEMENT_BYTES", 1),
            ("MAX_STATEMENTS", 1),
            ("MAX_COMPOUND_PARTS", 1),
        ]:
            with self.subTest(setting=setting), patch.object(RECOVERY, setting, limit):
                with self.assertRaises(RECOVERY.PreparationError):
                    self.prepare()
            self.assertFalse(self.output.exists())

    def test_cli_output_never_contains_source_sql_or_private_values(self):
        source = b"CREATE TABLE PRIVATE_SCHEMA_CANARY(id INTEGER,,);"
        self.source.write_bytes(source)
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = RECOVERY.main(
                [
                    "--input",
                    str(self.source),
                    "--output",
                    str(self.output),
                    "--expected-sha256",
                    hashlib.sha256(source).hexdigest(),
                ]
            )
        self.assertEqual(code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("PRIVATE_SCHEMA_CANARY", stderr.getvalue())
        self.assertIn("statement 1", stderr.getvalue())
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = RECOVERY.main(["--unknown", "PRIVATE_ARGUMENT_CANARY"])
        self.assertEqual(code, 1)
        self.assertNotIn(
            "PRIVATE_ARGUMENT_CANARY", stdout.getvalue() + stderr.getvalue()
        )

    def test_cli_success_reports_only_completion(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = RECOVERY.main(
                [
                    "--input",
                    str(self.source),
                    "--output",
                    str(self.output),
                    "--expected-sha256",
                    hashlib.sha256(EXPORT).hexdigest(),
                ]
            )
        self.assertEqual(code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertNotIn("Original; owner", stdout.getvalue())
        self.assertNotIn(str(self.source), stdout.getvalue())
        self.assertIn("No D1 instance was contacted", stdout.getvalue())

    def test_real_cli_entrypoint_prepares_once_and_refuses_overwriting_its_output(self):
        command = [
            sys.executable,
            str(SOURCE),
            "--input",
            str(self.source),
            "--output",
            str(self.output),
            "--expected-sha256",
            hashlib.sha256(EXPORT).hexdigest(),
        ]
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run(
            command, capture_output=True, text=True, check=False, creationflags=flags
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Original; owner", result.stdout + result.stderr)
        before = {
            filename.name: filename.read_bytes() for filename in self.output.iterdir()
        }
        repeated = subprocess.run(
            command, capture_output=True, text=True, check=False, creationflags=flags
        )
        self.assertEqual(repeated.returncode, 1)
        self.assertEqual(
            {
                filename.name: filename.read_bytes()
                for filename in self.output.iterdir()
            },
            before,
        )
        self.assertEqual(self.source.read_bytes(), EXPORT)


if __name__ == "__main__":
    unittest.main()
