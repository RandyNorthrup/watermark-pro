# Workspace member capacity — 2026-10-02

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

Creation limits, complete member-capacity certification, monthly operation budgets
and signed payment reconciliation remain required before public launch. Stripe needs a separate new Lumafoil account
and owner Dashboard authentication; no unrelated-account provider writes occurred.
M19 remains open.

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

Hosted member source `b616cd0` passed all 2,931 covered cases with unchanged
coverage floors, but failed two historical account-cutover fixtures. Their
corrected setup seeds the old two-member capacity before the roster; all eleven
focused cutover/access D1 cases passed. Follow-up `c8fccc4` passed static/publication
and hosted SAST, but the full audit rejected the newly reviewed braces advisory;
devices were skipped. Recovery canonical quality independently reached the same
audit failure after all static/publication gates. See
[release blockers](release-blockers-2026-10-02.md); member certification is pending.
