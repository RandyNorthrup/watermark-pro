# Stripe subscriptions — M19 candidate

Updated 2026-10-03. This candidate is unreleased and requires migration 0022
followed by 0023. The separate Lumafoil account and test monthly catalog/portal
are now verified; see [account receipt](../verification/m19/stripe-account-2026-10-03.md).
Live charges/payouts and submitted business details remain false. Actual isolated
test-mode gateway proof now passes seventeen checks, including hosted Pro payment,
refund and confirmed cancellation, plus six provider-signed event types. No live
payment, production webhook, Worker secret or deployment was created. Business
activation, permanent scoped credentials and full application/D1 sandbox lifecycle
proof remain required.
The older `lumafoil` CLI profile still targets AppBag; only the verified
`lumafoil-launch` profile belongs to this account. Root owns remote provisioning.

## Current flow

Monthly USD prices remain Free $0, Pro $9 and Team $24 for three members. Pro
always resolves the caller's personal workspace. Team names a separate shared
workspace or selects an explicitly owned existing shared workspace; it never
implicitly shares personal content. Private membership and historical grants
remain independent of payment.

One current billing authority stores account/mode, original payer, workspace or
reserved Team intent, Checkout generation/state, customer/subscription, verified
paid period and provider-confirmed chargeability. Durable event receipts and one
fenced lease protect that authority; existing workspace_plan is its capacity
projection. The prototype's extra subscription-history table and simulated Node
fulfillment store have been removed. Receipts retain relevant provider object
references; a financial retention/deletion schedule is still a launch decision.

All provider effects require exact account/mode verification. Checkout checks
server-pinned active licensed monthly USD prices and exact amounts. Hosted URLs
are restricted to Stripe HTTPS origins without credentials or custom ports.
SDK 22.6.2 and API 2026-08-26.dahlia remain pinned: peer/engine verification requires
Node and @types/node >=18; the project's Node 24 baseline and locally observed
Node 26 satisfy that range. SDK 23.0.0 was refused by the seven-day dependency
age guard. Official version source:
https://raw.githubusercontent.com/stripe/stripe-node/v22.6.2/src/apiVersion.ts.

Checkout, portal, explicit recovery and pending-Checkout cancellation require
verified admitted unbanned payer sessions, recent credential proof and same
origin. Existing workspaces also require current owner membership. A pending
Team's payer can manage their own financial customer before its workspace exists;
this reveals no workspace content. Portal cancels renewals at period end.

GET /api/me/billing is read-only. It reads an existing personal mapping and
financial authority, returns actual scope/kind and server eligibility, and never
prepares a workspace or grants capacity. POST /api/me/billing/reconcile accepts
only {plan: pro|team}; it verifies current provider state through the same fenced
reconciler as signed events. This recovers a completed purchase after a delayed
webhook. Actual Checkout/portal returns use /app/account with only product-scope
queries. The UI performs explicit recovery after return, then refreshes workspace
choices. No browser-supplied customer, price, subscription or return ID is accepted.

Open Checkout is resumed for the same intent across UUID changes/reloads. A
changed name is refused while it can charge. Explicit cancellation expires that
server-bound session and verifies closure before replacement. A completed paid
session whose webhook failed cannot create another subscription merely because
local time expired. Lease acquisition is followed by a fresh authority read;
every binding and commit also checks the expected request generation.

Only verified current invoice/PaymentIntent/charge linkage grants a paid period.
Period-end cancellation preserves its remaining paid access; failed/unpaid,
refunded or unresolved/lost-dispute states suspend it. Expiry is checked by existing
atomic quotas. Signed events are limited to 64 KiB raw bytes with five-minute
past/future signature windows; foreign modes and Connect contexts are refused.
Receipts, paid Team provisioning, owner membership and capacity commit atomically.
Elapsed local Checkout time never releases payer/deletion protection: a provider
must confirm that the intent/subscription cannot charge. Paid Team provenance
survives cancellation, preserving Free base rather than creating a private grant.

## Account deletion and security bans

The installed Better Auth 1.7.2 deletion order matters: its internal adapter
removes sessions and accounts before deleting the user. A user database
before-delete hook therefore cannot safely reject provider closure. Self removal
uses the existing authenticated `/api/auth/delete-user` endpoint and its
`user.deleteUser.beforeDelete` hook, after password/fresh-session checks. The
existing recent credential and privacy guards also apply. Site owner deletion is
refused. Administrative removal uses the guarded `/admin/remove-user` before-hook
before the SDK removes any target sessions or accounts.

A server-only operation UUID in the existing `banReason` field, prefixed
`billing-account-removal-`, temporarily marks the target banned before financial
closure. Quiescence compares the actual observed false/null ban value and rechecks the
live banned state; a silently missed update refuses removal before provider
calls. Reservation, lease acquisition, post-lease user checks and customer/
Checkout bindings inspect the live account. The existing lease prevents an
already-running financial operation from racing removal. Closure resolves both
financial scopes on the server, verifies account/mode/customer/generation,
expires open Checkout or immediately cancels the current subscription with
`invoice_now=false` and `prorate=false`, and verifies terminal chargeability before
committing. After provider-confirmed closure, a new webhook/cron read lease
cannot prevent final user deletion: the deletion fence retains chargeable=true,
and every financial acquire/commit requires the live bound owner. A late commit
after the owner is removed fails; subsequent signed replay records an ignored
receipt. No provider identifier comes from the removal body.

Provider or busy-lease failure returns `BILLING_CLOSURE_PENDING` before the SDK
removes credentials. Rollback clears the temporary ban only when its exact
operation marker still matches; a concurrent moderator ban replaces that marker
and is never undone. A failed attempt may invalidate a session or suspend paid
capacity, but successful rollback retains the password and permits sign-in and
explicit recovery/retry. Temporary ban uses the raw adapter deliberately to avoid
running the moderator background closure hook twice. This is quiescence, not a
transaction spanning Better Auth and Stripe: an unrelated failure after confirmed
provider closure may leave an account with the temporary marker. Operators must
verify closed financial authority before clearing that marker and retrying local
removal; they must never restore a real moderation ban.

A real security ban commits without waiting for Stripe. Its SQL trigger
immediately suspends paid access, and later signed events cannot regrant capacity
or create Team workspaces while the payer remains banned. The existing request
background task attempts closure. Banned, still-chargeable authority remains the
retry signal for the existing scheduled maintenance pass; no new jobs, tables or
payment state are introduced. A provider outage can delay renewal closure, so this
is not a promise of instantaneous cancellation during a provider outage. Retained
payer authority and the deletion fences prevent orphaning that charge.

## Evidence and launch blockers

Earlier prototype receipts remain historical. The frozen corrected baseline
passed 83 focused Node/shared cases with targeted coverage of 93.49% statements,
86.70% branches, 100% functions and 98.03% lines; nine actual D1 cases, TypeScript
and scoped ESLint passed. The batchable primary-workspace INSERT SELECT fixed an
intermediate db.run-in-batch mistake without weakening quotas.

The isolated lifecycle correction passed 154 selected real-auth Node/shared cases, with
its final quiescence negative rerun passing all nine lifecycle Node cases. Actual
D1 passed 17/17: self/admin provider outage and retry, banned closure recovery,
paid suspension after failed removal and explicit recovery, nullable historical
ban quiescence, in-flight Checkout, self/admin final deletion across a paused
webhook, queued cron, and owner/receipt non-resurrection. These use actual SDK
requests and installed Better Auth; provider boundaries remain named fixtures.
Final-source TypeScript and scoped ESLint passed after the last race corrections.
No new coverage, full quality, browser or scanner gate is claimed for this delta.

Failure receipts remain: first Node 134/137 had incorrect DELETE-body and
revoked-session expectations; first D1 0/13 captured fetch before its fixture and
ignored raw seed IDs; the next D1 12/13 correctly refused banning its accidentally
promoted immutable owner. Initial expanded 13/17 stopped four cases at the real
shared-IP sign-in limiter. Distinct TEST-NET fixture IPs now retain actual rate
limiting and auth rather than weakening the limiter. Review also caught nullable
quiescence and post-closure lease races; their negative proofs above now pass.

Validated billing ownership transfer, tax/credit/proration treatment, financial
retention, complete quality/SAST/device journeys and real Stripe sandbox lifecycle
verification remain open. The existing full-audit blocker is not waived or retried.
Next slice is to certify this compact lifecycle delta, integrate it with the frozen
explicit UI recovery flow, then prove real sandbox behavior after owner activation.
M19 remains open.

## Combined source integration — 2026-10-03

The approved lifecycle hunks now preserve public admission's insertion-boundary
hold/activation/failure cleanup and the existing preset capacity projection.
The public admission hook's third argument remains its store; billing deletion
closure is fourth. Combined selected Node/shared passed 185/185, actual D1 passed
31/31 across public/creation/billing/auth/preset files, and final full TypeScript
and scoped lint passed. Original preset type/locale and projection-fixture
failures remain recorded; no failure is relabeled. These are focused functional
receipts, not full coverage, rendered browser or release certification. Exact
merge provenance, hashes and open gates are in
[the integration receipt](../verification/m19/stripe-lifecycle-integration-2026-10-03.md).
Root owns the next monthly-operation budget proposal and all remote activation;
no budget coding, new provider write or publication occurred in this integration.
