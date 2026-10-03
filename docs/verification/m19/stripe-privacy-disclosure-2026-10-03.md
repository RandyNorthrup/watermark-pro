# Stripe privacy disclosure — 2026-10-03

This isolated `codex/stripe-privacy-disclosure` candidate adds one Payments
heading and one paragraph to the public privacy page in all twelve locales.
The notice date becomes 2026-10-03. M19 remains open; this is not complete legal,
privacy or launch certification.

## Source facts and scope

The paragraph follows the implemented hosted Checkout/portal flow in
`src/worker/stripe-gateway.ts`, the strict product-intent request schema in
`src/shared/billing-client.ts`, and the identifiers/status/event receipts stored
by `src/worker/db/billing-store.ts` and migration 0023. Stripe hosts payment entry;
Lumafoil stores customer, Checkout, subscription and invoice references, event
receipts, subscription status and paid-through dates linked to the payer and
billed workspace. Gateway requests send billing references and the selected
price; they do not send photos, videos, documents, logos or saved watermark
content. The application does not collect or persist full payment-card numbers.

The copy describes the data flow conditionally; it does not claim currently
enabled billing or an actual payment. It adds no refund terms, retention period,
tax promise, legal-rights claim or provider-compliance guarantee. Those launch
decisions remain in the billing plan. No payment/configuration/dependency/gate
code changes.

The worktree overlays the exact 247-path current integration snapshot, read twice
while root source was frozen. Snapshot manifest SHA-256:
`5953951a84efa1959e20beb652e14a99f85a21bb46fb04117ea9c1a11f2c61d3`.
It includes the reviewed billing fixes and public-tour correction and precedes
the operation delta. Independent npm installation uses the existing exact pins;
no credentials or node_modules are copied. Structural comparison confirms every
locale value outside `legal.privacy.billing` is unchanged, preserving the root
tour and private-cohort copy.

## Verification and next slice

The new rendered-page regression first failed against the original notice:
two legal cases passed and the Payments region was missing. After the addition,
all 48 focused legal/catalogue cases passed. The test checks one billing
paragraph, provider references/status/receipts, full-card-number exclusion and
the content-transfer boundary; negative assertions keep the disclosure out of
unchanged Terms. Final full TypeScript and scoped lint passed. Translation
extraction passed 1,292 keys, all referenced and none missing. Formatting and
diff checks passed.

Browser/scanner/native/build checks were held for the coordinated AAC lane and
are not claimed. Next: review/apply the exact small delta, verify the actual
public privacy page on desktop and Arabic phone with axe/overflow and images,
then run the frozen combined gates and remaining M19/provider/financial checks.
Full audit remains a strict blocker; public signup and production billing stay
closed. No commit, push, deployment or payment was performed.
