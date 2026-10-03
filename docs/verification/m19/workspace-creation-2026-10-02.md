# Workspace creation authority — 2026-10-02

Status: candidate on `codex/workspace-creation-limits`, based on member source
`c8fccc4`. No production migration, merge, public admission or deployment occurred.

## Authority and retained behavior

Migration `0022` adds server creation owner/kind and an indexed atomic organization
INSERT guard. The authenticated Better Auth hook ignores client creator/kind,
fetches live account authority and forces the current user as creator. Metadata,
existing workspace roles and a client paid-plan name never grant creation.

Historical organizations are retained, with personal ownership from its mapping
and shared provenance from the first historical owner ordered by creation/id.
Existing plans, member rosters and content are not rewritten. Shared/private
creation consumes one slot belonging to that creator even after a role transfer;
historical workspaces consume the allowance rather than silently authorizing
unlimited new groups. Deleting a group frees the slot; deleting the creator can
null the foreign key without transferring the old slot or deleting shared content.

Personal preparation binds both ID and slug to `personal-<account>`, remains
idempotent and supports the confirmed-empty historical account splitter without
changing old verification state. Normal authenticated preparation still requires
verified admission. It does not consume shared creation capacity.

Paid provenance is a separate immutable kind. `0022` rejects new paid/historical
claims; the future signed billing writer must establish a matching verified grant
before `0023` can admit paid creation. A Team purchase must neither implicitly
share a personal workspace nor create unlimited private fallback grants after
cancellation. Stripe provisioning remains a separate candidate, not active service.

## Executed verification

- 29 Node cases across the new real-auth role matrix, guard classifier, existing
  account/workspace access and schema drift checks passed. Owner/admin/editor/
  viewer/non-member actors receive the same account-owned grant and its negative
  public/over-limit controls. Anonymous writes fail before side effects. Forged
  creator/kind/user IDs and metadata do not assign another account as creator.
- 43 real workerd cases passed, including three new creation cases and unchanged
  upload/access/account-cutover/auth wiring. Concurrent HTTP and direct D1 writes
  admit exactly one of three requests. A ban after the precheck is rechecked
  inside INSERT, yields neutral conflict with no row/audit, and a real retry passes.
- Four actual SQLite migration cases passed, retaining historical roster/content/
  plans, enforcing one private group, separating personal preparation, rejecting
  public/pending/banned/unverified/missing/paid claims, protecting provenance and
  preserving foreign-key account deletion.

Earlier failures are retained: the first D1 batch passed ten and failed 33 because
fixtures reused a single creator for unlimited setup; it also exposed cross-realm
wrapped-error classification. The second passed 37 and failed six after additional
real fixture signups correctly exhausted the existing limiter. The third passed
42 and failed one sender fixture that attempted another new shared workspace.
Named historical creators/ownership transfers and per-case upload actors fixed
fixture authority without altering production limits or existing assertions.
The final batch passed all 43. Targeted lint and complete canonical/SAST/device
receipts still need completion before implementation certification.

## Remaining certification and next slice

Required canonical quality currently reaches a separate high development-tool
advisory with no patched release; no audit exclusion or downgrade is permitted.
Complete quality, SAST and four-device Playwright/axe remain required on final
source. Then integrate verified billing/public admission and monthly operation
budgets, plus Linux AAC library decode and the remaining M19 release audits.
The owner authorized parallel agents; each owns a separate worktree and coordinates
heavy scans/browser gates to preserve meaningful timing evidence. M19 stays open.

## Broader verification after reassessment

Executed the full `npm run test` chain on the creation candidate. Its covered
stage passed 2,939 cases and failed one folder fixture (263 files passed, one
failed). Global coverage floors passed: statements 92.55%, branches 85.46%,
functions 92.38%, lines 93.50%. The chain stopped there, so later workerd/script
stages were not executed by that attempt. Separate earlier D1/migration passes
remain separate receipts.

The failed fixture tried to create a second new shared group for one private
creator. It now uses the same actor's actual personal workspace as the foreign
context, preserving the original cross-workspace item, version and rollback
assertions. All nine corrected folder cases passed with lint. A full final-source
rerun, SAST and device gates remain required; focused success is not certification.

Creation SAST executed after the reassessment: 510 applied rules, 2,176 targets,
zero findings, no timeout/warning reports, exit zero. Production source was
included; this is a separate static receipt, not complete implementation or
release certification. Final corrected-source test/device execution remains.

The next broad covered run passed all 2,940 cases/264 files and retained every
coverage floor. Its subsequent full D1 stage passed 77, failed six folder cases
and skipped two admin cases because those old fixtures still assumed unlimited
new creation. A named retained-workspace fixture now centralizes valid historical
ownership transfer setup; ordinary creation remains bounded. Corrected full
workerd execution passed all 86 cases across 21 files, with complete types.

Actual public integration also found an independent production bug: a repeated
personal prepare attempted the same member INSERT, so its BEFORE INSERT seat
trigger fired before ON CONFLICT could skip the duplicate. Private three-seat
allowances hid this; public one-seat workspaces failed. The prepared INSERT now
uses SELECT WHERE NOT EXISTS for the existing (organization,user) member while
retaining the atomic batch and ON CONFLICT race protection. No capacity trigger
was disabled. A real public Free one-seat repeated-prepare test passed in the
full 86-case workerd batch. Remaining script and device gates are being executed;
these stage receipts do not claim a complete canonical/CI pass.

Remaining script stages executed separately and passed: bootstrap 40, gate-runtime
15, performance verifier tests 36, publication 22, asset tools 24 and CI policy 4.
The full four-device Playwright/axe run is live; no final result is claimed yet.
A browser smoke first used 127.0.0.1 instead of the configured localhost gate
origin and showed a gate error. Correct-origin inspection then rendered Lumafoil's
actual homepage, heading, links and no framework overlay; the screenshot was
viewed. This is an anonymous baseline smoke, not public-billing visual certification.
