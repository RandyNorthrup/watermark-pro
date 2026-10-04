# Workspace member capacity — 2026-10-02

## Current source-only preparation — 2026-10-04

Owned tree `/tmp/lumafoil-pr17-restack-2026-10-04`, branch
`codex/restack-workspace-seat-capacity`, starts above merged capacity main
`4e7dce70db4cac516514dcdf79b7db951c2dd390`. Its tree is byte-identical to published
capacity `23742a56f6756fb244804d212d89260696e9a9e1`. The true original chain is
`fdd55f2` → `b616cd0` → `c8fccc4`; it is replayed as its net seat delta, not a
whole old tree. Four obsolete scanner paths and their unrelated publication
layout receipt are excluded. The original 28-path scope becomes 23 paths.
Nineteen preimages match capacity exactly; four differences are documentation.
Three documentation conflicts preserve current main history. Runtime/test/SQL
leaves retain the exact final original behavior.

One existing plan record now retains historical membership capacity. Actual
conditional grant/accept SQL and the D1 insert trigger fence concurrent seats;
auth prechecks use the same limit. Receipts/audit require actual membership.
Private primary grants and larger retained rosters survive paid expiry/
suspension; public personal capacity remains separate. Existing permission,
recent-proof and protected-account guards are preserved. No new authority,
dependency or admission abstraction is introduced.

The original 0021 delta omitted its generation metadata. Fresh normal owned
installation passes with 737 packages and zero audit findings; script-approval
warnings are retained without an override. Actual installed Drizzle generates
in scratch from preserved 0020 metadata and this schema. Its logical diff is
only `retained_member_limit` INTEGER NOT NULL DEFAULT 1 and the integer/positive
check. All other 26 tables and the old workspace-plan columns/checks/properties
are exact; the new snapshot chains to `105b41c3-ef7e-447e-8a47-ce24aea2f656` and
all 21 old journal entries remain. Root independently reviews these comparisons
before approving only the genuine 0021 snapshot and journal extension. This
corrected candidate has 25 paths.

Generated DDL instead rebuilds the table and selects the new column from its
old definition, where the preserved snapshot proves it absent. It also omits the
authored roster backfill/member trigger. That scratch SQL is neither executed
nor copied; the original ALTER/backfill/checks/trigger stay byte-exact. No
metadata is invented or obtained from old integration. At the generation
checkpoint, scoped style/types and complete existing role/race/retained/rollback/
populated-SQL/D1 checks were the next released proof, executed below. Full
gates/build/UI/provider/remote work remain held. Capacity's
current gates are not a seat certificate.

Scoped formatting/lint and fresh full types on the corrected 25 paths then exit
zero. Complete existing shared plans, real Better Auth workspace-access roles
and schema-compatibility files pass 37/37 cases: 17 plans, twelve access and
eight schema cases. Existing populated workspace-plan migration script passes
4/4 actual SQLite cases, including retained/private/public rosters, over-limit
refusal and replacement after removal. Complete actual D1 files pass 37/37:
nine workspace-access, two account-cutover and 26 upload cases. Zero failures/
skips, unchanged projects/configuration/deadlines and no filtered cases.

Actual D1 assertions cover concurrent direct grants and three distinct bearer
accounts competing for one seat, denied receipt/audit neutrality, suspended
capacity refusal with retained membership, accepted-to-pending auth rollback,
audit-failure rollback and both corrected historical cutover cases. Upload
bindings remain part of the combined schema boundary. Source stays frozen.
The captured Vitest parent is absent and candidate-CWD runtime is zero; native
child identities were not sampled before the short run ended. No unidentified
storage/process is removed. Root then reviews the source and releases one
unchanged complete `npm run quality`, followed by pinned SAST. Both exit zero.
Quality passes 2,955 covered cases across 262 files, coverage 92.59% statements /
85.49% branches / 92.39% functions / 93.52% lines, and 82 actual workerd cases
across 20 files. Every original static/publication/full-audit/later-script/asset/
build gate passes; audit findings are zero. Semgrep 1.174.0 runs 510 rules on
2,174 tracked targets with zero findings; 15 standard oversized skips remain.

Fresh canonical `npm run test:e2e -- e2e/onboarding.spec.ts
e2e/recent-authentication.spec.ts` builds the actual artifact through the unchanged
owned SDK gate and exits zero: 12/12 across desktop Chrome, iPhone, iPad and
Android, zero failures/skips/retries, two workers and all original waits/slow-test
declarations. Personal/collaboration identity, actual viewer invitation/limited
access and verification-only refusal versus genuine password retry reach their
assertions, including zero axe violations/reflow overflow. Four fresh credential
prompt PNGs are actually viewed by Root; each dialog's text/actions are readable
and contained. This does not certify every screen or live human/provider service.

Fifteen sampled startup/WebKit identities and groups are absent, candidate-CWD
runtime is zero and port 5273 is free. Later Chromium/profile identities are not
individually sampled; that limit is retained. One recorded own gate survives
automatic teardown; its canonical parent/prefix, no-symlink state, own-dist/test
configs, empty SDK-secret stub and local R2 settings are verified after runtime
closure, then only it is removed. No baseline/user storage or global process is
touched. Existing generated/executable/enabled Husky hooks forward to staged
lint and the unchanged publication scan, with no global init override. Normal
publication/exact-head hosted checks remain; no payer/provider action, public
activation, final Starter/Free implementation or M19 completion is claimed.

Original hosted failures remain: run `37081765884` on `b616cd0` passed covered
tests but rejected two historical cutover fixtures; final `c8fccc4` corrects
those fixtures. Run `37085396339` on that corrected head then failed the reviewed
braces dependency audit and skipped devices. Main now preserves its independently
verified audit remediation; no rule exception or retry is applied here. Historical
local failures and scoped corrections remain below. Final Starter/Free launch
policy is required separately, with no public/paid activation or M19 completion
claim in this foundation.

## Historical original-source evidence — 2026-10-02

Status: implementation under verification on `codex/workspace-seat-limits`, based
on certified storage source `fdd55f2`. No migration, merge, public admission or
Stripe activation has occurred.

Live server limits govern direct grants and bearer acceptance inside their D1
statements. A D1 member INSERT trigger also fences auth-plugin compatibility
paths. Link acceptance reports success only when membership actually exists;
denied inserts do not create a successful receipt or audit. Auth prechecks read
the same plan authority; they are not the atomic guarantee.

Existing private members currently share their primary workspace through custom
access routes. The initial solo-primary assumption failed four existing tests
and was corrected: private primary collaboration retains a bounded three-member
grant. Historical larger rosters have an explicit retained limit, including through
paid renewal, expiry and suspension. Public personal workspaces remain solo.
Compatibility auth routes retain their existing prohibition on personal sharing.

The corrected focused Node/shared batch passed 35 cases. Real D1 access/race
checks passed seven cases; combined storage/access integration passed 33 cases.
Distinct candidate identities prove rejection is quota enforcement, rather than
a duplicate constraint. Lint, type checking and zero duplication passed. Full
canonical quality, SAST, role matrices and device certification remain pending.

Inspection of the pinned Better Auth source found an existing catch that returns
an accepted invitation to pending when member creation fails. A new deterministic
D1 fixture suspends paid capacity after the invitation status write, then checks
refusal, unchanged membership, pending status and no successful audit before a
real retry. The first expanded run passed the rollback case but consumed the
existing fixture sender's email allowance, making its later budget assertion fail.
The race now uses a separate inviter; all eight D1 access cases pass, including
unchanged budget assertions. No library modification was necessary. Actual
migration checks passed all four cases, including retained public/private primary
rosters, over-limit refusal and replacement of one removed member. The expanded
Node/shared batch passed all forty cases; complete gates remain pending.

A further real-endpoint race now uses three distinct accounts and separate bearer
URLs for one remaining seat. It requires one success, two refusals, three total
members, one accepted link and one success audit. Reusable candidate setup avoids
duplicated fixtures. Its first run passed membership/refusal assertions but failed
the accepted-link assertion: untargeted links deliberately remain reusable and
have no accepted-account marker. The corrected fixture now uses email-bound
invitations under a separate sender. All nine corrected D1 access cases then
passed. The failure was not a reason to change established reusable-link behavior.
Full final-source quality, SAST and device gates remain required.
The first canonical quality attempt stopped at formatting in the changed memory
workspace fixture. Prettier corrected that file and the same full command was
restarted; no gate was waived and final certification remains pending.
That retry passed the static checks through duplication, then its publication
scanner was temporarily paused for another owned scan. The resumed scan timed
out and rejected quality. The interruption invalidates a clean timing receipt;
an uninterrupted full rerun remains required. No process remains paused.

The JavaScript fallback now matches atomic SQL when a shared public record retains
an obsolete private base allowance: public capacity is one plus any explicit
historical roster, rather than inheriting that unrelated private allowance. A
positive retained-roster control accompanies the negative new-seat case.

At this historical checkpoint, creation/member certification and payment
reconciliation remained open and separate Lumafoil account onboarding was not
complete. Onboarding has since completed, and the owner later retired weighted
monthly operation budgets. Current work is the reviewed seat foundation and
actual billing/provider integration, not either superseded requirement. M19
remains open.

The uninterrupted full local run passed static/publication checks, then covered
testing passed 2,913 cases and failed seventeen. All failed files subsequently
passed isolated execution without source/assertion changes: nine folder cases
and ninety-one UI cases. These isolated passes distinguish the observed failures
from a reproducible capacity/permission regression, but do not replace full
canonical testing, coverage, SAST or device certification. Exact-source hosted
gates remain the next required verification step.

Additional real-auth Node quota negatives passed all twelve access cases: a
distinct fourth account receives neither a direct grant nor a bearer success,
existing membership remains readable and no acceptance audit is produced.
Local SAST applied 510 rules to 2,167 targets and found zero issues, but timed
out on rules in the schema/generated declarations. This is not recorded as
clean complete security certification; exact-source hosted gates remain required.
