# Public plans, private membership and trust gates — M19

Atomic-seat preparation, 2026-10-04: the new isolated candidate above merged
capacity main `4e7dce7` retains historical/private rosters and fences new member
inserts. It has no executable proof or public activation. Its missing generated
0021 metadata requires review. The final Starter and Free media policy below
remains required; capacity source CI does not certify this seat delta.

Restack scope, 2026-10-04: this branch prepares only original workspace-capacity
source above main `8354602`. Its original Free/Pro/Team limits are a foundation,
not the later confirmed Starter/media launch implementation. Final requirements
remain Starter USD 4 monthly, five Free image admissions per UTC day, no Free
Video/Bulk and one-page Free PDFs. Historical all-tools-Free wording below is
superseded for launch. Provider and branch status below is dated evidence;
fresh owned installation and reviewed generated 0020 metadata now exist, but
no payment, public activation or new runtime certification has occurred here.

Status: design and research completed on 2026-10-01. Human-verification runtime
source `b908155` passed full quality, SAST and four-device browser gates on
2026-10-02 in draft PR #12. Private cohort/two-invite runtime and its final
documentation head passed all seven exact-commit CI jobs, including the expanded
140-journey device matrix. Recent credential proof passed complete local quality
before its final save/export warning. Final wording passed focused/catalogue
checks and all four dedicated browser/axe journeys with reviewed actual captures;
runtime `77f6a9a` then passed canonical quality, SAST and all 144 journeys in
exact-commit CI `37009328785`. Workspace storage capacity is under verification on
`codex/plan-entitlements`; its storage-capacity source `fdd55f2` now passed all
seven hosted jobs, including 144 browser/axe journeys. Creation/seat gates and payment reconciliation remain
open. Public registration and subscriptions have not shipped.

## Owner decisions

Public Free and paid subscriptions will run alongside the existing private
membership cohort. Prices are USD and monthly only. On 2026-10-02 the owner
clarified that Lumafoil needs a new, separate Stripe account under the existing
owner login; the unrelated account selected by the first CLI authorization must
not receive Lumafoil products, payments or credentials. Existing private members keep their current access and receive
two new invitations each; each newly admitted private member receives two. Public
accounts receive no private invitation rights. Private membership and donations
are absent from public marketing; donations remain available to private members.
Site admission never grants access to the inviter's workspace.

The owner specifically requires user privacy, prevention of abuse, and gates that
verify humans and control trust. A solved challenge, verified email or successful
payment is not evidence that a person is safe to receive another user's data.
Authorization remains explicit and separate from those signals.

## Selected launch plans

| Plan | Monthly USD | Cloud allowance                                                                         | Membership and sharing                                             |
| ---- | ----------: | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Free |          $0 | 500 MiB photo/gallery storage, 100 photos and 10 logo assets                            | One private personal workspace; no new shared workspace            |
| Pro  |          $9 | 10 GiB photo/gallery storage, 10,000 photos and 50 logo assets                          | One private personal workspace; no new shared workspace            |
| Team |         $24 | 25 GiB photo/gallery storage, 10,000 photos and 100 logo assets in the billed workspace | One explicitly shared workspace, three members including the owner |

Native photo, PDF and video processing remains available on Free within the
existing device/file/project limits. Paid value is hosted capacity and controlled
workspace collaboration, not an artificial claim that open-source client exports
cannot be bypassed. Team means shared gallery, presets and authorized workspace
access; it does not claim simultaneous timeline editing. Video projects remain
session-only until project persistence is implemented and verified. Storage copy
must say photo/gallery storage, rather than imply cloud video-project storage.
There is no annual plan, metered overage, paid trial or Enterprise tier at launch.
Additional seats are not sold until seat changes and their billing are implemented.
Members' personal workspaces keep their own plan; Team covers its shared workspace.

Existing private personal workspaces retain the current 2 GiB/10,000-photo/50-logo
allowances. Existing explicit workspace grants are preserved. A pending
clarification asks whether private members retain limited free collaboration.
After an opportunity to reply, the working assumption is one additional shared
workspace with three members using the existing private allowance; historical
workspaces and grants remain intact even when above new creation/member bounds.
Public Free/Pro users require Team for new shared workspaces. Migration must
identify historical grants before applying limits and must not silently remove
access or delete content. New paid shared workspaces use Team. A private member can purchase
Pro or Team while retaining their separate private membership status.

## Competitive research

Research date: 2026-10-01. Monthly prices below are actual monthly billing, not
annual prices divided by twelve. Comparisons are directional: competitors offer
different server processing, AI, video storage and collaboration features.

| Service                                         | Verified current offer                                                                                                      | Implication                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Watermarquee](https://watermarquee.com/)       | Plus $9.99/month; full-resolution batch photos, brand kit and AI; video to two minutes/1080p/500 MB                         | $9 Pro is competitive for watermark-focused work without charging for unsupported AI                                                       |
| [Kapwing](https://www.kapwing.com/pricing)      | Pro $24/member/month; Business $64/member/month; annual teaser prices are $16/$50                                           | Native rendering and bounded cloud storage support a lower individual price; a three-member shared workspace warrants a separate Team plan |
| [Watermarkly](https://watermarkly.com/pricing/) | One-year access advertised at $19.95 paid annually, permanent access $39.95; page also contains a conflicting monthly label | Annual/permanent models are not comparable monthly subscriptions; do not repeat the conflicting monthly label as a verified price          |
| [Watermark.ws](https://watermark.ws/pricing)    | Default annual display: Premium $4/month billed $48/year; Ultimate $8/month billed $96/year                                 | Do not infer monthly charges from its savings percentage or use annual teasers as monthly benchmarks                                       |

The [VEED pricing page](https://www.veed.io/pricing) did not expose current
monthly prices to the fetched page. Those prices are not used to select launch
prices. Enterprise branding would imply controls such as SSO, procurement terms
and contracted support that Lumafoil has not implemented.

## Unit economics and explicit assumptions

The account country, negotiated Stripe fees, tax registrations and actual
operating/support costs remain unverified. The existing CLI's test key is expired
and its live key is rejected. A Stripe connection was offered; products, prices,
portal configuration and webhook registration have not been created. Live billing
cannot be certified until the intended account and its rates are read back.

Illustrative US standard domestic-card model uses
[Stripe Payments](https://stripe.com/us/pricing) at 2.9% + $0.30 and
[Stripe Billing pay-as-you-go](https://stripe.com/billing/pricing) at 0.7% of
billing volume. [R2 Standard](https://developers.cloudflare.com/r2/pricing/) is
$0.015/decimal GB-month, $4.50/million writes and $0.36/million reads, with no
internet egress charge. GiB allowances are converted to decimal GB for this model.
[Workers](https://developers.cloudflare.com/workers/platform/pricing/) starts at
$5/month with usage charges; [D1](https://developers.cloudflare.com/d1/platform/pricing/)
includes allowances and bills excess rows/storage. No free infrastructure allowance
is credited in the per-subscriber storage figures.

| Maximum-allocation monthly model                               |    Pro |    Team |
| -------------------------------------------------------------- | -----: | ------: |
| Subscription revenue                                           |  $9.00 |  $24.00 |
| Payments plus Billing                                          | $0.624 |  $1.164 |
| Fully used allocated R2 storage                                | $0.161 |  $0.403 |
| Operations/compute allocation assumption                       |  $0.15 |   $0.50 |
| Free/private service subsidy reserve assumption                |  $0.50 |   $1.50 |
| Support allocation assumption                                  |  $2.00 |   $6.00 |
| Refund/fraud/tax-administration reserve assumption: 3%         |  $0.27 |   $0.72 |
| Contribution before fixed overhead, acquisition and income tax | $5.295 | $13.713 |

These are assumptions, not observed margins or a guarantee of net profit.
International cards and conversion can add Stripe charges; sales taxes collected
are liabilities, not revenue. Disputes, transaction fees retained on refunds,
email service, provider charges, marketing, operator pay and fixed costs need
actual accounting. At a hypothetical $500/month fixed overhead, approximately
95 Pro subscribers or 37 Team workspaces cover that overhead at these assumptions;
acquisition and additional costs change that result. Enforced storage, object,
member, admission, email and request bounds prevent unbounded free/private usage.
Review actual cohort usage and margin after launch; update prices prospectively
with notice rather than silently changing existing subscriptions.

## Human verification and account trust

The current server already requires email verification and has credential/API
rate limiting. The isolated human-verification implementation now requires real
production keys, hostname/action validation and fail-closed provider handling;
full implementation quality, SAST, four-device Playwright/axe and viewed auth
UI checks passed on 2026-10-02. Owner-completed Cloudflare login restored
access to the existing managed `lumafoil.com` widget and confirmed the production
verification secret name; no new widget, key or deployment was needed. A live
challenge against the new implementation remains unverified. The
next slice makes the following controls load-bearing:

1. Production admission/recovery requires real Turnstile keys; missing keys or
   test keys fail closed. Development/test may use explicit isolated fixtures.
   Production API configuration and the widget agree on the requirement.
2. Server verification binds the expected hostname and form action. Signup, password sign-in and
   social-entry actions use admission; password recovery and verification-email
   resend use recovery. Provider JSON is bounded and validated with Zod; redirects
   are refused and a ten-second deadline bounds verification. User IDs, email
   and client IP are not sent to Siteverify. Missing,
   forged, expired, consumed, wrong-host and wrong-action tokens are rejected.
   Provider errors/timeouts never become successful admissions. Social callbacks
   require server-controlled state from the verified entry request; a callback or
   admin user-creation seam must not bypass admission/cohort assignment.
3. Email/password accounts cannot access workspace APIs before verification.
   OAuth creates verified accounts only when the provider positively attests the
   matching email. Session, ban and role checks continue on every protected API.
4. Rate limits remain in place before expensive operations. Account-based durable
   budgets additionally bound invitation mail, sharing and checkout creation;
   retries cannot bypass limits by changing a client-supplied ID.
5. Billing ownership, new members, private invitations, deletion and administrator
   operations require the appropriate server role and recent authentication.
   A verified email or payment never grants an administrator role or membership.
6. Private invitation grants are two _new_ successful admissions after cutover.
   Pending invitations reserve capacity; revoking/expiring an unused invitation
   releases it. Historical accepted invitations do not consume the new grant.
   Reusable links share the same atomic budget and cannot admit unlimited users.
   Banned/deleted/unverified inviters cannot issue or redeem admissions.

[Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
is authoritative: tokens expire after 300 seconds and are single-use. Verify on
the server, validate action/hostname, and refresh the widget after an attempted
submission rather than accidentally reusing its consumed token. Cloudflare's
[test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
are explicitly unsuitable for production. A challenge provides an abuse signal;
it does not establish a real-world identity, prevent all abuse or prove trust.
Do not add invasive fingerprinting, identity-document collection or broad email
provider bans to the launch flow without a concrete need and privacy review.

## Recent authentication requirements

The current security candidate uses a ten-minute server-owned credential proof tied to
the current session and account. Password sign-in and validated identity-provider
sign-in may establish that proof. Challenge completion, email verification,
session renewal, payment, profile updates and client timestamps cannot establish
or extend it. Sessions without proof retain ordinary permitted reads and editing,
but sensitive actions require signing in again through the existing challenged
email/OAuth flow. A new sign-in must preserve the application's account/offline
binding checks and must not silently replay a sensitive mutation.

Do not implement this as an age check on `createdAt` alone. The pinned Better
Auth source creates sessions during email verification, including for an already
registered identity; creation time therefore is not sufficient evidence of recent
credential presentation. Server session extension fields must have `input: false`
and receive their values only from trusted authentication hooks. Historical
sessions start without proof, and renewal must preserve rather than advance it.
Reject absent, malformed, future and expired proof with a specific typed error.
The policy must cover both custom APIs and the organization/admin plugin seams,
including private invitation issue/rotation, new workspace members/access links,
membership/role changes, billing ownership, account/workspace deletion and site
administrative mutations. Cancellation/revocation must not restore old proof.

The implementation must ship real-auth positive and negative tests for these
paths, proof forgery through session/profile input, email-verification replay,
session renewal, account changes, provider failure and server expiry. The UI must
explain why a new sign-in is needed and offer a bounded internal return path.
Sensitive operations remain server role/cohort checked after reauthentication;
freshness alone is never an access grant.

Source verification on 2026-10-02: [Better Auth session freshness and updates](https://better-auth.com/docs/concepts/session-management),
[server database hooks and additional fields](https://better-auth.com/docs/concepts/database),
the pinned `node_modules/better-auth/dist/api/routes/email-verification.mjs` and
`session.mjs`, and [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
The candidate implementation is on `codex/recent-authentication`. Complete local
quality, real D1 wiring and four-device browser/axe with viewed prompt captures
passed before the final save/export warning. That final wording passed focused
prompt/catalogue checks and its fresh four-device visual/axe journey. Final SAST
passed with zero findings; exact-commit hosted canonical quality/full device
matrix passed for `77f6a9a` in workflow `37009328785`.
No migration, release or production enforcement is claimed. Cloud connection,
token retrieval and disconnection also require proof. Same-account sign-in retains
only a selected workspace whose current membership still exists.

## Billing and tenant security

Provider account boundary: the intended account is the new Lumafoil business
account, not whichever account a local CLI profile happens to select. Read back
and pin the actual account identifier and mode before provisioning any catalog,
webhook, Checkout or portal resource. The first renewed CLI login reached an
unrelated account; only sanitized account metadata was read, and no provider
resources or payments were created. New-account Dashboard authentication remains
pending. Official Stripe Codex plugin installation was verified on 2026-10-02;
installation is not proof of an authenticated Lumafoil connection. Local service
credentials are owner-readable only and remain outside the public repository.

The capacity foundation has explicit workspace plan authority and a member-only
limits projection. Migration `0020` preserves historical content/membership;
upload reservation and commit resolve the live paid period and suspension inside
D1. Exact-source canonical quality, SAST and all four device jobs passed for
`fdd55f2` in workflow `37024827798`. See
`../verification/m19/workspace-capacity-2026-10-02.md`. This does not activate
subscriptions or replace the remaining creation/member-seat gates.

Checkout and portal endpoints require a verified signed-in workspace owner,
same-origin requests, recent authentication and bounded request schemas. The
server selects allowed plan/price, customer, quantity and return URLs. Client
customer IDs, price IDs, amounts, roles, arbitrary redirects and active workspace
claims never authorize billing. Free-to-Team creation must not convert a private
personal workspace into shared data implicitly.

Use hosted Checkout and portal; Lumafoil must not collect or store card numbers.
Checkout uses automatic collection, fixed monthly USD prices and no unverified
trial. Stripe's own payment authentication and fraud controls supplement the
application's admission controls; payment success is not general account trust.

Webhook verification uses the bounded raw request body, timestamp tolerance and
the endpoint signing secret before decoding event data. Validate mode, account
mapping, supported price, customer, workspace and subscription ownership. Store
event IDs for duplicate delivery; neither redirect success nor a client claim
activates access. [Stripe does not guarantee event ordering](https://docs.stripe.com/webhooks),
and event timestamps can collide: fetch authoritative subscription/invoice state
and serialize or compare-and-swap reconciliations rather than trusting delivery
order. A failed reconciliation remains retryable and never leaves a recorded
success with partially applied entitlements.

Initial paid access requires verified payment and an eligible subscription.
Cancellation at period end preserves access through the paid period. Payment
failure, refund/dispute, cancellation and downgrade policies need explicit tests.
Over-limit downgrades preserve existing files, permit reads/downloads/deletes and
refuse new writes or members; no automatic destructive cleanup. Team seat checks
must be atomic across grants, bearer links and Better Auth organization endpoints.
Public API routes and offline replay must use the same entitlements.

Log event IDs and sanitized outcome codes only. Do not log challenge tokens,
Stripe secrets, card data, full webhook bodies or unnecessary personal metadata.
Keep audit visibility tenant-scoped. Document Stripe/Cloudflare processing in the
privacy notice, retention/deletion behavior, cancellation and support contact.
Subscription identifiers may need limited financial retention after account
deletion; content deletion and financial retention must be distinguished clearly.

## Implementation and certification checklist

- [ ] Read back intended Stripe account, mode, fees, charges and payout capability;
      create/reuse exact products/prices, portal settings and webhook endpoint.
- [x] Add migration and server-owned pending/public/private cohort; preserve
      historical accounts, explicit grants and storage access. Source `08834df`
      passed all seven gates in workflow `36992631513`, including 140 browser
      cases and real-auth/D1/legacy-migration tests. Migration remains undeployed.
- [ ] Add authoritative billing state and entitlement reconciliation, separate
      from private membership and explicit workspace access.
- [ ] Enforce plan quotas atomically on uploads, asset writes, offline replay,
      shared workspace creation, member acceptance and competing requests.
- [x] Implement and certify session-bound recent credential proof, protecting
      sensitive custom APIs and auth-plugin seams; email verification, renewal
      and client session updates cannot refresh the proof.
      Runtime `77f6a9a` passed full exact-commit quality/SAST, real D1 wiring and
      all 144 browser/axe journeys; final prompt captures were viewed.
- [x] Certify implemented two-new-admission controls, including reusable links,
      concurrency, revocation/expiry, historical spend and recipient deletion.
      Cutover retains at most two oldest live pending offers per issuer and
      revokes excess pending offers, while preserving historical admitted access.
- [x] Implement production human verification with hostname/action checks,
      social state binding, consumed-token refresh and provider-failure negatives;
      source `b908155` passed full quality, SAST and four-device browser gates.
- [ ] Verify live Turnstile challenges against the new implementation after all
      deployment gates pass. Existing widget and Worker secret-name readback
      confirms resources, not successful new-code live admission.
- [ ] Implement owner-only Checkout/portal, signed idempotent webhook processing,
      initial-payment checks and ordered authoritative reconciliation.
- [ ] Update public landing/signup/pricing/account pages and all twelve locales;
      keep private cohort/donations out of public marketing.
- [ ] Update privacy/terms, threat model, runbook, secret examples and changelog.
- [ ] Run positive/negative API role tests with real Better Auth, workerd binding
      tests and meaningful concurrent quota/webhook regressions.
- [ ] Pass full quality and SAST; verify signup/payment/sharing journeys with
      Playwright/axe and review real desktop/phone/light/dark/RTL renders.
- [ ] Verify Stripe sandbox purchase, authentication-required payment, replay,
      renewal, cancellation, failed payment and tenant-isolation behavior.
- [ ] Pass all M19 Lighthouse/screenshot release gates before production deploy.

Human-verification implementation checks are complete for runtime source
`b908155`; its draft PR remains unmerged. Private/public cohort boundaries and atomic two-new-invitation grants are
verified for `08834df` in workflow `36992631513`. All 140 browser/axe cases
ultimately passed; the unrelated iPhone gallery case used the existing retry.
Recent credential proof is certified for runtime `77f6a9a`; three unrelated
device journeys used existing retries and all new credential cases passed first
attempts. Next implement authoritative plan quotas and payment state.
Stripe account authentication remains unconfirmed; no catalog or charge has been
created. Video/navigation regressions and full M19 release audits remain open.
No later milestone is started.
