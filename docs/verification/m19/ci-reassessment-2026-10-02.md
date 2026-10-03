# Whole-candidate CI reassessment — 2026-10-02

Status: review and correction required. The owner explicitly requires scanning
and reassessing a complete PR after three failed CI runs rather than continuing
small patches. `AGENTS.md` now records that rule. The video PR has already passed
that threshold; the next retry requires a coherent root-cause correction. New
feature edits/commits/pushes were frozen across all four owned worktrees. Existing
checks completed; no active check is being treated as stopped merely due to an
observation timeout. The full delivery goal remains active and M19 remains open.

## Actual evidence

Storage source `fdd55f2`, hosted run `37024827798`, completed successfully; its
certification does not certify the expanded candidates. Latest published video
source `496bc2e`, canonical run `37096836621`, failed the full dependency audit.
Its dedicated Linux native run passed eight cases; native output duration, coded
padding, Web Audio extent and both waveform edges passed, while library AAC
iteration hit its unchanged deadline. This separates an output contract already
proved from a remaining decoder integration failure.

Root creation candidate passed 29 focused Node cases, 43 workerd cases and four
actual migration cases. Its canonical quality passed all static and full
publication checks (15,173 candidate/object checks, 12,776 scanner copies, 183
archive entries; no configured private values available), then failed seven high
findings from the unpatched braces advisory before tests/build. Removing its
actual migration INSERT guard made negative regressions fail; restored source
passed all four cases. SAST, complete coverage and device gates remain unexecuted
on that final candidate. It is not implementation certification.

The Stripe candidate's latest focused workerd batch passed seven cases. Its
latest Node run passed 78/79 and failed a HTTP-negative fixture after lint changed
that fixture; its scoped coverage was 87.5% functions against the required 90%
floor, and typecheck reported an unused import. Earlier 79/79 predates later
history/cleanup changes. Full quality, SAST, browser/payment flow and live sandbox
checks have not passed. The public candidate passed focused admission/UI/catalogue
and four D1 cases, but latest targeted lint failed five test rules; final types,
quality, SAST and actual visual/browser checks remain. Passing subsets are useful
proof for their scope only.

## Review findings that change the implementation

1. Billing checkout/portal returns use `/app/settings`, while the real account
   route is `/app/account`. Mocked provider results did not validate the landing
   route and therefore missed a broken user flow.
2. Webhook authority is read/validated before acquiring its lease. Commit checks
   lease identity but not the expected checkout generation. A replaced attempt
   can be overwritten by a stale event snapshot.
3. Local checkout expiry does not prove Stripe closed the session or cancelled
   a subscription. It currently permits replacement checkout and payer deletion
   despite a completed charge whose webhook failed/delayed, risking duplicate
   subscriptions and orphaned payment responsibility.
4. Team reservation/name uniqueness can permanently block retry or repurchase;
   UI always requests a new name instead of resolving existing billed workspace.
   Payment return, Team discovery and provider readiness are not integrated.
5. Public availability preflight rejects an idempotent retry holding the last
   reservation. Anonymous configuration also queries global capacity repeatedly.
   Pending population accounting mixes private failures and public holds.
6. Public adapter-failure cleanup is not proven; only an earlier admission failure
   was injected. The account card displays selected workspace capacity while a
   Pro purchase targets the personal workspace. Suspended/cancelled billing needs
   explicit portal state rather than inferring eligibility from capacity.

## Smallest coherent corrective slice

Keep one current billing authority, durable event receipts, one fenced lease and
the existing workspace-capacity projection. Remove redundant subscription history
unless a concrete retention requirement needs it. Acquire the lease, refetch live
current authority, retrieve bound Stripe objects and commit only against the
expected generation. Keep a chargeable lock until provider-confirmed closure;
local elapsed time cannot authorize replacement or payer deletion. Reuse a live
checkout for the same intent, and explicitly reconcile/close an old intent before
changing it. Validate the real return route and discover the new Team workspace
without implicitly sharing a personal workspace.

Public configuration should expose the explicit policy flag without scanning
population. Reserve once at the actual account-creation boundary with an
email-aware idempotent authority, then consume/activate once. Retain the durable
spending row needed to survive deletion, but remove unused columns/preflights.
Clarify population semantics and inject a real adapter failure. Agree one
workspace-kind/billing-status contract with the UI, including portal eligibility
and actual backend readiness.

Use real-auth Node tests for role/input boundaries and real D1 for authoritative
fulfillment, generation races and idempotence. Remove large duplicated simulated
fulfillment implementations; tests must not mirror an unverified model. Preserve
all required privacy, human checks, historical access and exact video output
requirements. No weaker gate, smaller product or artificial successful response
is accepted as a fix.

Before another video retry, complete the full decode/export review and identify
one coherent correction. The native decoder's negative-timestamp behavior has
primary-source evidence; the candidate clock bridge remains uncommitted and
requires exact Linux proof. Repeated canonical runs cannot cure the unrelated
unpatched braces advisory; no audit exclusion/downgrade is permitted.

Next: agree the shared contracts and remove redundant state, then verify the
combined correction on actual integration paths before another CI attempt.
Production flags, migrations, payments and deployment remain gated.
