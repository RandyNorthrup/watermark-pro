# Billing review corrections — 2026-10-03

Scope: two existing billing contracts, on isolated `codex/billing-review-fixes`.
No production configuration, provider account write, deployment, commit or push
is performed. M19 remains open.

## Provenance and review

The worktree starts at `c8fccc4f6e32459768043961963324331c52925c` and overlays
all 236 exact files from the immutable security seed. Every input length and
SHA-256 matched; the seed manifest SHA-256 is
`07e9453bc40f5982f16d1c5e7e83101aa352bf68564f4e2bce80384d57c29c1d`.
Seed metadata's earlier RTL concern is superseded by the original PNG pixel and
native-ready measurements in the integrated visual receipt. No other worktree
source or node_modules is copied. Independent `npm ci` completed successfully;
787 packages were installed and the pinned SDK correction verified.

Read-only review found no additional account/tenant isolation defect in the
examined public-admission, membership roster and financial boundaries. Actual
user insertion reserves public capacity; activation remains one authority and
failed creation releases its unconsumed hold. Invalid private bearer invitations
cannot fall through to public admission. Purpose-bound HMAC keys avoid storing
raw reservation emails. Installed Better Auth's roster selection and the existing
negative API tests retain only peer id, name, email and image; another member's
cohort or ban reason does not cross that boundary. Private invitation/donation
controls remain bound to the caller's verified private cohort.

Billing mutations retain same-origin, account binding, recent credential proof,
verified/unbanned payer and current owner checks. The official SDK uses pinned
account, mode and API version; signed events retrieve current provider state and
commit under request-generation and lease fences. Read-only GET does not create
a workspace or reconcile payment. These source observations and named provider
tests are not evidence of an actual sandbox payment or provider availability.

## Corrections and regression proof

Historical users may have `banned = NULL`. Reservation, lease acquisition and
session trust already treat this as unbanned, but customer/Checkout binding used
`banned = 0`, so a valid payer failed after the provider response. The correction
uses the same `COALESCE(banned, 0) = 0` predicate at those two writes. Actual D1
regressions cover NULL before the first purchase, stored customer/session binding
and single-session retry. Separate negative cases put a real security ban between
each provider response and binding; widening the valid NULL case must not admit
either banned write.

The closed Team authority persists after cancellation. An older UI test returned
`team: null` after cancellation, although the actual store returns the retained
record. The UI therefore never exposed the new name and could strand an upgraded
Team scope after its empty old workspace was deleted. The correction permits a
name draft when the server allows Checkout and the Team has no organization;
an open intent retains its fixed server name. Changed drafts go through the
existing strict product-intent schema and the server's provider-closure check.
No new financial state, provider identifier or capacity-derived eligibility is
introduced.

The corrected retained-record and orphan regressions were first run against the
unchanged component: six cases passed and both new assertions failed. The small
component correction then passed all eight cases, including fixed open names,
server-denied Checkout, portal access and identical request UUID on retry.
The actual D1 cancel/name-generation case now also asserts the retained closed
overview; a separate actual auth deletion/repurchase case covers the orphan scope.
Before the SQL correction, the one executed NULL first-purchase regression failed
with HTTP 503 instead of 200; the other 20 were filtered, and fixture setup passed.
After the two predicate changes, all 21 actual D1 cases passed, with none skipped,
including both provider-response ban negatives and real auth workspace deletion.
The focused Node run passed 110 cases across roles, provider/lifecycle/shared and
UI boundaries. These remain functional named-provider receipts, not real payments.
Final-source full TypeScript and scoped lint passed. The first lint found three
optional-chain/nested-call errors, which were corrected without a suppression.
Formatting and diff checks passed.
No browser, scanner, native, global coverage or full quality run is claimed for
this isolated correction; fresh rendered UI remains required after integration.

## Current gates and next slice

Read-only `npm run github:verify` passed all 13 live control endpoints. Main still
requires PRs and strict Actions-bound quality/E2E checks with no bypass; production
is main-only with administrator bypass disabled. Deploy verifies the current main
SHA before gates and again before migration/deployment. CI requires canonical
quality, SAST and every device before its fail-closed aggregate; release also
requires the complete UI audit matrix. Native diagnostics do not replace those
required checks.

One official dependency refresh at 2026-10-03 09:18:18 UTC found npm
[braces latest](https://registry.npmjs.org/braces/latest) still 3.0.3, published
2024-05-21. The [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
still lists affected versions through 3.0.3 and no patched version; upstream has
no GitHub release. The existing seven cascading high audit findings remain a
strict blocker. No audit rerun, waiver, fake version or CSS substitution is used.

Ordered next slice: finish these focused regressions; review and integrate the
separate operation/image corrections with their real binding proofs; freeze the
combined source; run the final types/static/coverage/native/D1/SAST and isolated
four-device gates once. Finish the unchanged Lighthouse/screenshot, physical
video, two-deployment offline, localization/keyboard and live provider/financial
obligations in PLAN.md before release. Full dependency audit must become genuinely
clean before canonical quality/release can pass. Public signup and production
billing remain closed.
