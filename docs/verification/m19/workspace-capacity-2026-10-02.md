# Workspace capacity implementation — 2026-10-02

Status: implementation gates passed for `fdd55f2` on `codex/plan-entitlements`,
stacked on credential-proof runtime `77f6a9a`. No production migration, subscription
activation, public admission, merge or deployment has occurred.

## Authority and admission

The shared monthly catalog implements the researched Free/Pro/Team limits, while
private membership retains its independent historical grant. An explicit D1
`workspace_plan` record stores workspace purpose, base grant, paid period,
suspension and revision. Organization metadata, workspace roles and browser plan
names do not grant paid access. Migration `0020` retains historical shared grants
and actual existing membership, separates personal/private and public base
capacity, and assigns future workspaces an explicit server record.

The member-visible capacity API returns only storage, photo, logo and member
limits. It omits billing/customer identifiers and private admission state. Actual
workspace membership is required; unrelated members and anonymous callers cannot
read another workspace's limits. No client-accessible capacity setter exists.

Upload reservation admission reads current plan authority inside its conditional
D1 INSERT, alongside saved content, thumbnails, concurrent reservations and
outstanding cleanup. Metadata commit rechecks paid-period expiry/suspension and
the complete quota, plus existing membership and folder guards. Audit and lease
completion depend on the reservation-bound metadata actually being inserted;
reusing the quota condition after insertion would count that upload twice.
Downgrade does not delete stored content. Failed commits retain cleanup liability
until physical object recovery releases their reservation.

## Verification status

Exact-commit hosted run `37024827798` passed all seven jobs: canonical quality,
SAST, every device and the fail-closed aggregate. It executed 2,926 covered cases
across 262 files and 78 real workerd cases across twenty files. Coverage was
92.56% statements, 85.45% branches, 92.37% functions and 93.50% lines. The full
144-journey Playwright/axe matrix passed; one Android journey used the existing
retry policy. All new capacity tests passed. This certifies the storage-capacity
implementation, not public launch, Stripe processing or the separate video/UI
candidate. Draft PR: https://github.com/RandyNorthrup/watermark-pro/pull/16.
CI: https://github.com/RandyNorthrup/watermark-pro/actions/runs/37024827798.

New tests cover strict plan records, Free versus private limits, exact paid-period
expiry, suspension, member and tenant isolation, writable-metadata forgery,
concurrent final slots, byte boundaries, commit-time authority changes, audit
fencing and object recovery. The first focused run passed 56 Node/shared cases;
the final real D1 upload integration passed all 26 cases. Three actual-migration
SQLite checks also passed, including legacy content and membership canaries.
The subsequent complete covered run executed the final gallery usage assertion.
The canonical attempt cleared every static, publication and dependency gate,
then passed 2,925 covered cases with one failing cron fixture. Coverage remained
92.54% statements, 85.44% branches, 92.34% functions and 93.47% lines. The cron
fixture had no explicit plan authority; it now seeds a named Free grant and all
twelve focused handler cases passed. This is not a canonical quality pass;
complete final-source quality, real D1 and SAST remain required before this slice
can be marked complete. The preceding credential-proof source has
separate exact-commit hosted receipts; they do not certify these changes.

Final SAST passed all 510 rules over 2,164 files with zero findings. The updated
photo-count red drill deliberately admitted an extra slot; D1 tests went red,
and the runner verified byte-for-byte source restoration. Its focused receipt is
`../../red-drill/2026-10-02.md`; it is not a claim that the entire drill matrix ran.

GitHub readback on 2026-10-02 again confirmed public visibility, all thirteen
repository-policy endpoints, enabled private vulnerability reporting, secret
scanning/push protection and Dependabot security updates. Open secret and
dependency alert queries returned zero without printing secret values. Hosted
video source `c1a503a` has separate quality/SAST passes and a pending four-device
matrix in draft PR #15; it is not this capacity source's certification.

## Remaining launch work

This slice does not activate paid subscriptions or enforce creation/member seat
quotas. Those need atomic auth-plugin and custom-workspace seams, followed by
owner-bound checkout/portal and signed, deduplicated webhook reconciliation.
Authentication to the new Lumafoil Stripe account is still unavailable. The first
renewed CLI login reached an unrelated existing account and made no provider
changes. The owner clarified the separate Lumafoil account requirement; its
Dashboard setup remains pending. Public signup remains closed.
Public landing, private-only navigation/donations, live provider checks and full
M19 UI/release certification remain outstanding.
