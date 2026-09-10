# Isolated D1 restore and private-workspace split rehearsal

Successful run started **2026-09-10 01:51:53 UTC** (2026-09-09 in
America/Los_Angeles). This is a local D1/workerd rehearsal using the previously
captured production export. It is not a production migration or remote recovery.

## Result and scope

The verified 10,562-byte export was restored into a synthetic local D1 binding,
all seven pending schema migrations were applied, and the unchanged generic
`scripts/split-empty-workspace.mjs` CLI replaced the confirmed-empty shared
workspace with separate personal workspaces. The CLI used `--target local` and
an explicit task-owned `--persist-to` directory throughout.

| Check                                   | Restored baseline |                           After migrations and split |
| --------------------------------------- | ----------------: | ---------------------------------------------------: |
| Accounts                                |                 2 |                                                    2 |
| Site administrators                     |                 1 |                                                    1 |
| Site-owner anchors                      |  Not yet migrated |                                                    1 |
| Workspaces                              |          1 shared |                                           2 personal |
| Memberships                             |                 2 | 2, each the corresponding account's owner membership |
| Active sessions                         |                 0 |                                                    0 |
| Saved photos, logos, presets and shares |                 0 |                                                    0 |

Every restored application table's ordered row-value hash matched an independent
import of the original export. After migration and splitting, the complete
`user`, `account`, `audit_log` and `verification` rows still matched the original
values, including user identifiers, verification state, credential records and
site roles. The site-owner anchor referenced the original designated sole
administrator. Neither account gained membership in the other's personal
workspace.

The database history in this backup ended at migration 0004. The actual pending
set was:

- `0005_charming_swarm.sql`
- `0006_private_admission.sql`
- `0007_referral_links.sql`
- `0008_isolate_initial_accounts.sql`
- `0009_storage_reservations.sql`
- `0010_sole_site_admin.sql`
- `0011_recent_activity.sql`

Migration 0008 remains a no-op marker. The split was a separate successful
operator migration. The final migration ledger contained the twelve canonical
migrations and exactly one successful operator split record. Private workspace,
invitation/referral, upload reservation, recent-work and singleton-owner schema
checks passed.

## Restore procedure issue found and resolved locally

Directly executing the unchanged export through Wrangler failed with a missing
`main.user` table. The export interleaves table creation and row insertion;
account rows were inserted before their referenced user table existed. A prior
ordinary SQLite import had not exposed this D1 restore-order problem.

The successful replay separated schema statements from data statements using
Python's `sqlite3.complete_statement`, which recognizes quoted semicolons and
complete SQL statements. All original statement bytes were preserved; none of
the application statements were discarded or rewritten. The thirty schema
statements ran first, followed by nineteen data statements, including the
export's SQLite sequence reset. The original `defer_foreign_keys` directive
preceded both phases. D1 foreign-key enforcement was never disabled. Original
row hashes were checked against the resulting D1 data before migrations began.

This procedure was verified for this exact backup. Direct one-command replay of
the interleaved export was **not** certified as working.

## Positive and refusal controls

All commands below operated on the isolated local binding. Each rejected
operation exited nonzero; an independent full application-schema-and-row
snapshot remained unchanged after the refusal.

| Control                                             | Observed result                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Expected membership count changed from two to three | Split refused; no guard table or migration record remained.                                                                      |
| One synthetic active session inserted               | Split refused; the session was preserved by the failed operation, then explicitly removed. Exact pre-control state was restored. |
| One synthetic saved-logo row inserted               | Split refused; the row was preserved by the failed operation, then explicitly removed. Exact pre-control state was restored.     |
| Confirmed-empty baseline with correct count         | Split succeeded, producing two personal workspaces and matching owner memberships.                                               |
| Same split requested after successful completion    | Refused; completed state unchanged.                                                                                              |
| Promote the other account to site administrator     | Refused by the administrator guard; anchor and roles unchanged.                                                                  |
| Demote the anchored administrator                   | Refused by the administrator guard; anchor and roles unchanged.                                                                  |
| Change the site-owner anchor                        | Refused by the immutable-owner trigger; anchor unchanged.                                                                        |

The two administrator-role controls reported the named administrator guard. The
anchor-change control reported the immutable-owner guard. These checks exercised
the real migrated database rather than a simulated store.

The combined integrity/FK PRAGMA probe through the D1 API returned
`SQLITE_AUTH`. It is recorded as an unsuccessful introspection command, not as a
passing check. Independently, the actual workerd persistence database was
identified by its SQLite header and application schema, opened in read-only mode,
and checked with SQLite directly. `integrity_check` returned `ok`,
`foreign_key_check` returned no violations, final counts matched, and the four
preserved-table hashes still matched the original export.

## Commands and private evidence

Observed tools: Node 24.20.0, Wrangler 4.129.0 and Python 3.14.0. The executed
private rehearsal entrypoint was:

```powershell
node temp/run-d1-restore-rehearsal.mjs
```

It invoked the installed Wrangler CLI for `d1 execute --local` and
`d1 migrations apply --local`, with an explicit isolated configuration and
persistence directory. The canonical split CLI received synthetic Cloudflare
account/database identifiers, the privately read original workspace identifier,
the expected member count and `--target local --persist-to`.

Exact argument arrays, exit codes, source hashes and private diagnostics remain
under the ignored successful-run directory
`temp/lumafoil-d1-restore-2026-09-10T01-51-53-982Z/`. Its
`private-commands.json` records every invocation. `sanitized-result.json` records
the outcomes without account identifiers or credential values. The original
export digest matched the pre-existing private verification manifest before and
after the rehearsal; canonical migration source hashes also remained unchanged.

## Cleanup and remaining release obligations

All temporary SQL/configuration directories created by the canonical split CLI
were removed. Every rehearsal attempt's isolated persistence directory was
removed after inspection. Eight derived schema/data restore copies across the
attempts were also removed after their hashes were recorded. The original
verified backup was preserved unchanged. Exact identifiers and operator evidence
remain only in ignored temporary storage; no user content is included here.

The owner lane separately verified a DPAPI CurrentUser-encrypted copy outside
the repository, decrypting it in memory and matching the original export hash.
That copy depends on the Windows user profile and is **not an off-device disaster
recovery backup**.

This rehearsal made no production writes, deployments, R2 operations or use of
the shared build/port-5273 environment. The export contained no saved media, so
populated-content migration and coordinated D1-plus-R2 recovery were not tested.
A fresh production backup or recovery bookmark and a current empty-state/session
check remain required before the parent workflow's separate live cutover. Local
SQLite integrity does not certify remote Time Travel or recovery onto another
machine.
