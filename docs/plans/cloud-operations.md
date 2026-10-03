# Monthly cloud-operation admission — M19 candidate

Updated 2026-10-03. This isolated candidate is unreleased. Its exact 236-path WIP
seed is recorded by manifest SHA256
`07e9453bc40f5982f16d1c5e7e83101aa352bf68564f4e2bce80384d57c29c1d`.
No dependency, provider, price, public flag or production state changes.

One workspace product aggregate receives two integer columns on workspace_plan:
operation_month and operation_units. One dedicated site singleton holds id/month/
units and survives workspace/account deletion. It stores no actor identity,
request/event history or jobs. Existing site_owner schema and immutable guards
remain unchanged. A fresh replacement/rejoined workspace has a fresh local quota;
it cannot erase cumulative ordinary site work.

Provisional UTC calendar limits are Free 1,000, private/legacy 10,000, Pro 20,000,
Team 60,000 and site 3,000,000 weighted units. Read costs 1, metadata write 4,
upload request 12, bounded folder move 1+4 per validated item (maximum 500).
These are request classes, not dollars or exact physical-operation counts.
Authorized attempts and exact request replay keep the admitted request-class
charge; idempotence still prevents duplicate content or provider effects. Failed
or aborted work after admission is not refunded. No additional receipt exists.

Persistence rechecks current live member permission or signed-share record scope,
paid expiry/suspension and capacity inside one conditional workspace UPDATE. Its
trigger debits the site row. RAISE(ABORT) undoes both if site authority is missing,
future-dated or exhausted. Workspace denial leaves site untouched. UTC month is
derived within SQLite; old-month rollover occurs only with positive work, and
backward/future month or same-month decrease is refused. A BEFORE INSERT guard
also refuses replacing the seeded singleton, because SQLite REPLACE need not fire
DELETE guards when recursive triggers are disabled. No calendar job is needed.
PlanStore's existing strict getter explicitly projects its original fields;
internal counters do not leak or break member capacity responses.

Member data routes retain current real Better Auth permissions and persistence
rechecks allowed roles, verified admission and ban state. Viewer read remains
allowed; owner/admin/editor production writes remain distinct. Valid anonymous
shares verify the signature, live expiry/revocation, tenant and requested photo
before debit; SQL rechecks the same share scope. Invalid/foreign/expired/revoked
shares and denied actors consume neither aggregate. The site cap is shared and
gives no fairness guarantee against an authorized actor exhausting it.
An actor ban prevents member spending but does not itself revoke already published
share links. Existing explicit share revocation and content moderation remain
separate capability controls; no new creator-ban policy was added.

Content deletion/cleanup and share/access revocation retain their current roles,
recent proof, address and batch limits while bypassing usage debit. Authentication,
account preferences/tour state, group replacement, billing management/webhooks,
account removal and background ban closure remain control-plane overhead. Ordinary
org imports use their existing upload permission class. Local work/exports remain
independent. No ordinary cloud data is silently returned after refused admission.
A typed 429 uses the existing rate-limit envelope and Retry-After to the next UTC
month; a malformed/future authority fails closed. Final product display is root's
decision, not a new UI in this slice.

A 32-day paid period can span three calendar allocations. Pre-counter CPU,
denied/critical/creation traffic, unpaginated lists, account minimums and provider
cost remain separate prerequisites/overhead. No CPU cap is introduced. No
profit/cost ceiling or proof of the former $0.15/$0.50 allocation assumptions is
claimed. Public signup and production billing stay closed pending these measured
bounds and complete release gates.

The actual migration/permission/rollover/reset proof and failed attempts are in
[the verification receipt](../verification/m19/cloud-operations-2026-10-03.md).
M19 remains open. Corrected focused checks now pass: 176 affected Node cases,
21 overlapping final guard/API regression cases, 13 actual D1 cases, full types
and scoped lint. Complete combined release gates remain required. Next review
the exact seed-relative source delta; the next independent slice is
measured admitted CPU and bounded saved-preset/list payloads, with denied/control/
creation overhead still separate. No source change to those boundaries is included
here, and no invoice/profit ceiling follows from the provisional unit limits.
