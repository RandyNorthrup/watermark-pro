# Separate Lumafoil Stripe account — 2026-10-03

Status: account and test catalog provisioned; production billing is not enabled.
The original provisioning created no customers, subscriptions or payments.
A later isolated provider proof created two disposable test customers, completed
one Pro test Checkout/payment, refunded that test payment and canceled its test
subscription, and expired one unpaid Team Checkout. No live funds or production
secret were changed.

## Latest owner activation and live authority

The owner completed onboarding on 2026-10-03. A fresh authenticated account
read returns the same `acct_1UMNAoIWioJO0GIF` with `charges_enabled`,
`payouts_enabled` and `details_submitted` all true. Separate explicit live-mode
account and balance reads also succeed, with US/USD and `livemode: true`.
The bounded active-price list returns zero items with no additional page.
This supersedes the earlier disabled activation flags recorded below.

No bank/legal/private field values were extracted or published. These reads
created no key, profile, webhook, customer or payment. Monthly live catalog/
portal setup is now underway; permanent credentials, certified webhook,
actual application/D1 provider proof and release/deployment remain separate.
Production billing remains disabled until all required gates pass.

## Account boundary

The owner enabled Chrome's Apple Events JavaScript setting for the existing
authenticated Stripe tab. Its original account was AppBag-Builder. The account
selector's **Create a separate account** option created a blank **Lumafoil**
account; existing branding, public details, ownership and payout information
were not copied. No catalog or payment writes were made to AppBag.

Lumafoil account ID is `acct_1UMNAoIWioJO0GIF`. The separate local Stripe CLI
profile `lumafoil-launch` was authorized against that exact account after
checking the Dashboard account path and pairing code. Its credential file is
outside the repository and has mode 0600. CLI credentials expire and are not
production Worker credentials. Credential values were not added to source or
this receipt.

Authenticated test-mode `GET /v1/account`, pinned to API
`2026-08-26.dahlia`, returned the same account ID, country US and currency USD.
`charges_enabled`, `payouts_enabled` and `details_submitted` were all false.
Country/currency do not establish business identity, tax registrations,
negotiated fees or permission to accept live payments.

## Test catalog and portal

Provider readback verified active licensed monthly USD prices with interval
count one and `livemode: false`. Lookup keys and account-scoped idempotency
keys prevent another setup attempt from duplicating this catalog.

| Plan | Monthly USD | Test price ID                    | Test product ID       |
| ---- | ----------: | -------------------------------- | --------------------- |
| Pro  |           9 | `price_1UMNF1IWioJO0GIFDUibO12o` | `prod_VN7TtGks0OTnV8` |
| Team |          24 | `price_1UMNF1IWioJO0GIFbWR8Hm5k` | `prod_VN7TExFBz7i7Gn` |

Test portal configuration `bpc_1UMNF1IWioJO0GIFIvJFDvcR` enables invoice history,
payment-method updates and cancellation at period end with no proration.
Subscription changes and customer identity updates are disabled. Its return,
privacy and terms URLs point to Lumafoil. No live webhook endpoint or live
catalog has been provisioned. No production secret was changed.

## Remaining work and next slice

Owner activation is completed and actual live authority verified as recorded
above. Fees/tax treatment remains unverified before live billing. Provision permanent scoped
Worker credentials securely, configure signed webhooks only when the certified
endpoint exists, and prove real sandbox Checkout/portal/webhook/failure flows.
The lifecycle correction, operation budgets and full M19 gates remain open.

## Earlier read-only activation refresh — 2026-10-03 (superseded)

A fresh account API read through the verified `lumafoil-launch` profile returned
the same separate Lumafoil account, US/USD. `charges_enabled`, `payouts_enabled`
and `details_submitted` remain false. No remote write or payment occurred.
Owner business activation remains required; test catalog readiness does not
certify production payment availability. Full readback stays outside the public
repository in a private local file; only these finite status fields are recorded.

## Actual gateway sandbox checkpoint — 2026-10-03

A fresh read at this checkpoint again verified the exact separate Lumafoil
account, US/USD, with charges, payouts and business details still disabled.
An isolated temporary driver then called the production `createStripeGateway`
against the real provider, using the existing test-only CLI credential outside
the repository. Account/mode verification passed. Customer and Checkout retry
calls returned the same provider identifiers. The actual USD 900 subscription
Checkout is open and unpaid; `inspect` grants no paid snapshot. Five checks pass.

This is provider gateway proof, not application authentication, D1 entitlement
reconciliation or a completed payment. Hosted test-card completion, actual
provider-signed webhook verification, portal behavior, failure/cancellation and
combined application lifecycle remain the next slice. No live key, payment or
production secret was changed. Raw responses, hosted session URLs and signing
credentials remain private outside the repository.

## Actual hosted payment and provider lifecycle — 2026-10-03

The production gateway now passes seventeen provider checks across three isolated
actual-test-mode drivers. Its hosted Pro Checkout visibly showed Lumafoil,
Sandbox and USD 9.00 per month. Chromium filled only Stripe's documented test
card and a named fictional customer; the successful return was intercepted
locally before navigating to the production application. The initial real
Checkout image was viewed. The agent-browser CLI was unavailable, so the
installed Playwright Chromium driver supplied this hosted interaction.

Actual `inspect` returned a complete Checkout and an active, fully paid invoice
with a future paid-through date. Unrelated customer and request identities were
rejected. The configured actual portal session was created; portal rendering and
interaction are not yet certified. Provider period-end cancellation preserved
the already paid period. A successful test refund removed the paid snapshot,
and `closeAccount` confirmed the provider subscription canceled, no longer
chargeable, with no paid-through date.

The Stripe CLI forwarded six real account/test-mode event types to an isolated
loopback verifier using production `verifyEvent` and `eventAuthority`:
`customer.subscription.created`, `checkout.session.completed`, `invoice.paid`,
`customer.subscription.updated`, `charge.refunded`, and
`customer.subscription.deleted`. Every owned event signature and identity
verified; replay verification succeeded and changing the exact raw payload was
rejected. All six deliveries returned HTTP 200. This proves provider signatures
and identity resolution; application receipt idempotency and D1 entitlements are
covered separately and were not executed by this loopback driver.

Owned Chromium, loopback server and CLI listener are closed with terminal
statuses. Session URLs, signing secrets and raw responses remain private outside
the repository. The disposable customers remain in Stripe test mode for receipt
traceability; the Pro payment is refunded and subscription canceled. Business
activation is still incomplete. Next: actual Team/failure cases, portal behavior,
and the complete application-to-provider-to-D1 sandbox flow, then all release
gates. No launch or full billing certification is implied.

## Actual unpaid Team cancellation — 2026-10-03

Five additional actual gateway checks passed. Real server-pinned Team Checkout
readback is USD 2400 and test-mode; its unpaid state has no paid snapshot.
Inspecting it under an unrelated authority is rejected. `closeCheckout` expires
that exact provider session and confirms it is not chargeable; repeating closure
returns the same terminal state. No Team payment, workspace provisioning or paid
capacity grant is claimed. This API-only run occurred after the owned webhook
listener was closed, so no signed expiry delivery is claimed by this receipt.
Complete Team purchase and application/D1/failure/portal journeys remain open.
