# Prepare a private D1 SQL replay

`scripts/prepare-d1-restore.py` turns a verified D1 SQL export into ordered,
private replay files. It uses only the Python standard library and needs Python
3.12 or newer. It does not contact Cloudflare, run Wrangler, select a database,
execute backup rows, or modify the source backup.

## Prepare the files

Use an independently recorded backup SHA-256 and a new directory beneath an
existing private storage location **outside Git**. An ignored directory inside
the repository is still refused. Normal and linked worktree markers, and Git
metadata directories, are checked after resolving the output parent.

The helper also refuses an existing output file or directory, even an empty
directory. There is no force/overwrite option. Keep the source export and the
prepared files under the appropriate private storage policy; the prepared data
file contains the export's account and credential data.

These argument forms have been executed successfully:

```powershell
python scripts/prepare-d1-restore.py --help

python scripts/prepare-d1-restore.py `
  --input $privateExport `
  --output $newPrivateReplayDirectory `
  --expected-sha256 $recordedSha256
```

The three variables represent private operator inputs. Obtain the hash from the
backup's existing verification receipt; hashing a possibly modified file again
does not independently establish that it is the intended backup.

The existing output parent must have suitable private access controls. New
directories/files request restrictive POSIX modes; Windows inherits the parent
directory's access controls. The command prints a completion message only. SQL,
row values, source paths and output paths are not printed. Failures report safe
classifications and statement positions rather than SQLite messages that could
contain private values.

## Replay order

The output directory contains these files and `manifest.json`:

| Order | File                          | Contents and reason                                                                                            |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | `01-schema.sql`               | All table definitions. Every referenced table exists before data replay starts.                                |
| 2     | `02-data.sql`                 | Original inserts and the export's SQLite sequence reset, in their original relative order.                     |
| 3     | `03-indexes-and-triggers.sql` | Indexes, then triggers. Restored rows do not fire triggers or acquire newly generated audit/ownership effects. |

Original statement text is retained byte-for-byte in UTF-8; the statement order
changes. Quoted semicolons, leading/trailing comments and complete trigger bodies
are retained. Each phase starts with deferred foreign-key checking. The helper
never adds `foreign_keys=OFF`.

Replay into an isolated, empty target first. Keep that target unserved until all
three phases and the independent validation checks have completed. Phase three
installs indexes and triggers, including uniqueness and administrative guards;
finishing only the data phase is not a completed restore. Replay each complete
phase with its deferred-FK setting rather than copying individual insert lines.

The manifest records the input hash/byte count and the statement counts and
SHA-256 of each output file. It is written last. Require a successful command
exit and a complete manifest, then verify those file hashes before execution.
The helper neither performs nor authorizes a local or remote database replay.
The deployment and recovery workflow remains in [the runbook](runbook.md).

## What preparation verifies

- The input is a regular nonsymlink file and matches the recorded SHA-256.
- SQL statements are complete and use the supported export forms.
- Table/index/trigger syntax can be compiled against an empty in-memory schema.
- Data statements can be compiled with `EXPLAIN`; their rows and expressions are
  not executed. Backup triggers are installed only after this validation step,
  so no backup data statement runs with a trigger installed.
- Attach/detach, external-file functions, transaction commands, arbitrary
  PRAGMAs, non-export reads and non-main database operations are denied during
  validation.
- The source hash remains unchanged before the manifest is written.

Supported input forms are `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, `CREATE
TRIGGER`, `INSERT INTO`, a `sqlite_sequence` reset, and an enabled
`defer_foreign_keys` directive. Unsupported statements are rejected; they are
never silently omitted. This is an export preparation tool, not a converter for
arbitrary migration scripts, virtual-table dumps or views.

Preparation is bounded to a 64 MiB export, an 8 MiB statement, 100,000 statements
and 256 compound-statement parts. Oversized input is refused rather than
truncated. SQLite compilation also has bounded statement and opcode limits.

On failure after output creation, cleanup removes only files created by that
attempt, after checking ownership. An unrelated file or changed output ownership
causes cleanup to stop and report that private inspection is required. A Git
marker appearing during preparation also aborts output. Successful output is
retained for the operator; manage and remove its plaintext copies privately
after use according to the recovery retention policy.

## Evidence and limits

Nineteen standard-library tests cover malformed and unsupported SQL, quoted
semicolons and comments, trigger bodies, data non-execution, source-hash checks,
Git boundaries, no-overwrite behavior, source changes, partial cleanup and CLI
output privacy. The ordered phases are replayed into real in-memory SQLite with
foreign-key enforcement enabled: restored contents remain unchanged, subsequent
inserts fire the restored trigger, and the restored unique index rejects a
duplicate.

The actual CLI was also run on the previously verified 10,562-byte export. It
produced 13 table statements, 19 data statements and 17 post-data index/trigger
statements. The
recorded source hash and output hashes matched; no backup rows were executed or
D1 instance contacted. Its private proof output was removed after verification.
The sanitized receipt is kept in ignored operator evidence.

Three disposable-copy red drills removed `EXPLAIN`, moved triggers before data,
and bypassed the Git-output boundary. Each mutation failed the relevant existing
test, and exact restoration returned all nineteen tests to green. Canonical
source files were unchanged by the drills and the disposable copies were removed.

The earlier [isolated D1 restore rehearsal](verification/m19/d1-restore-rehearsal.md)
proved the missing-table problem in direct interleaved replay, schema-first D1
restoration, all pending migrations and the guarded empty-workspace split. This
helper makes preparation reproducible and adds deliberate index/trigger ordering.
Preparation alone does not prove database integrity, account preservation, a
production cutover, remote Time Travel or coordinated D1/R2 recovery. Those
remain separate checks on the actual restored target.
