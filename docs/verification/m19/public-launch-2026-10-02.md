# Public launch candidate — 2026-10-02

Candidate on `codex/public-launch`, based on `c8fccc4`. M19 remains open. Public
registration and billing are closed in production. No provider resource, payment,
production migration, main merge or deployment was performed.

## Admission repair

The explicit `PUBLIC_SIGNUP_ENABLED` flag defaults to `false`; malformed values
fail validation. Opening it requires real Turnstile keys in every environment.
Existing hostname/action/token checks, verified email, bans, authorization and
recent credential proof remain independent requirements. The disposable fixture
bypass continues to admit private fixtures and cannot open public registration.
Supplied invalid private invitations never fall back to public admission,
including Google/Microsoft signed-state callbacks.

There is one public quota boundary at the actual Better Auth adapter insertion,
including its transaction adapter. A purpose-bound HMAC of normalized email
reserves a stable opaque user ID before insertion. The hold is reused even when
it occupies the final daily slot. Actual APIError and ordinary adapter failures
release unused holds; transaction rollback cleanup is idempotent. No raw email,
IP, challenge token or provider key is retained in admission rows or logs.

Migration `0024` contains only the email key, reserved user ID, expiry and
consumption timestamp. One conditional update and its SQLite trigger consume the
hold and activate the matching pending user atomically. Unsuccessful activation
retains `pending`. Accepted spending survives deletion without a foreign-key
reset. Expired holds with no inserted account can be removed; failed public
pending accounts keep their provenance until cleanup.

Approved initial bounds remain 100 admissions per rolling day, 10,000 public
accounts/held public identities, and fifteen-minute unused holds. These are
explicit temporary cost/abuse assumptions, not measured economics or a guarantee
of registration availability. Public population counts each public account or
its hold once; unrelated private pending accounts are excluded. Private admission
budgets remain independent. Anonymous configuration exposes the flag without
performing global database counts. No generic ledger framework is added.

## Billing and public presentation

Twelve-locale pricing presents Free $0, Pro $9 and Team $24 monthly USD, with the
existing server catalog's photo/gallery limits. Team includes three people and
explicit gallery/preset sharing; it does not provide simultaneous timeline
editing or cloud video-project persistence. Public landing, brand and legal copy
exclude private-program marketing. Donations require the verified account's
private cohort. Missing old display-cache cohort fields grant no private UI.

Billing UI uses the agreed server account overview, independently of the selected
canvas's capacity. Personal Pro and owned Team scopes have actual workspace
kind/name, provider checkout state, readiness and checkout/portal eligibility.
Nullable workspace identity is retained for paid Team before provisioning; no
workspace is invented. Financial portal access alone grants no content access.

GET `/api/me/billing` is read-only. Checkout sends a UUID and product intent;
portal, cancellation and reconciliation send only `{plan}`. Existing open checkout
resumes its server-bound name/session; a changed Team name requires explicit
cancellation. The server determines provider closure and payment state; client
expiry and returned URLs grant nothing. After a return, explicit Refresh performs
a same-origin protected POST and invalidates workspace/capacity queries. It never
silently replays a sensitive mutation after reauthentication. A localized notice
requires saving/exporting unfinished work before leaving for hosted billing.
Redirects are restricted to HTTPS Stripe checkout/portal hosts.

The independent Stripe implementation owns signed reconciliation and financial
eligibility. Its source must be integrated with root creation migration `0022`
and billing migration `0023` before browser certification. The separate Lumafoil
Stripe account is still unconfigured; the unrelated account receives no writes.

## Verification

- Independent `npm ci` succeeded with seven high findings from the unresolved
  braces advisory. No waiver or CSS replacement was applied; all 82 CSS rules
  remain. Current-source CSS and catalogue extraction passed.
- Repaired Node auth checks passed 58 cases, including public OAuth, invalid
  private state, actual API/non-API insertion failures and final-hold retry.
- Repaired UI/schema/catalogue checks passed 86 cases. Full TypeScript passed.
  Initial obsolete labels/transport fixtures and lint failures were corrected;
  they are retained as failed attempts, never counted as certification.
- Eight real workerd cases passed: five public admission cases and three existing
  auth-flow cases. The actual public journey verifies human challenge, cohort,
  email confirmation, Free limits, denied private privileges and repeated personal
  preparation. Its first repeat exposed the member trigger running before conflict
  handling. The root-approved prepared `INSERT SELECT ... WHERE NOT EXISTS` fixes
  that operation without changing the quota. An initial `db.run` batch variant
  failed because Drizzle requires a prepared query; the successful source uses its
  insert/select builder.
- Pinned SDK source already projects member users to id/name/email/image. Actual
  public signup and explicit private-primary sharing verified both raw organization
  and roster JSON omit peer cohort/admission and ban-reason fields. Public self
  cohort remains public, gallery reads succeed, and private invitation/referral
  APIs remain denied. No new privacy filter/framework was needed.
- Full types, changed-source lint, formatting, dead-code, CSS and catalogue
  checks passed. Integrated browser/axe,
  desktop/phone light/dark/RTL review, quality, SAST and release audits have not
  executed for this candidate. No browser server was started before integration.

The existing exact `@better-auth/core` 1.7.2 pin moved from development to runtime
classification for its exported endpoint context. Registry peer metadata was
checked on 2026-10-02: jose 6.2.10, kysely 0.29.5, nanostores 1.5.2, better-call
1.4.0, auth utils 0.4.2, OpenTelemetry API 1.9.1 and better-fetch 1.3.1 satisfy the
ranges; absent Workers types are optional. Published 2026-08-26, it satisfies the
seven-day age policy. No package version or dependency tree was substituted.

## Price evidence and next slice

Official sources refreshed on 2026-10-02: [Watermarquee](https://watermarquee.com/)
lists Plus $9.99/month; [Kapwing](https://www.kapwing.com/pricing) lists monthly
Pro $24/member and Business $64/member. Their AI/video/cloud features differ.
[Watermarkly](https://watermarkly.com/pricing/) annual/permanent offers are not
monthly equivalents. The existing contribution model remains before overhead,
acquisition and income tax; actual costs and net profit remain unverified.

Next: integrate root/Stripe source once local gates are green, prove repeat public
preparation and complete the actual billing/admission browser flow. Keep launch
closed until full audit, canonical quality, clean SAST, device/axe and UI audits
pass, and the intended provider account, keys, webhook and payment/refund controls
are verified. [The braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
still has no published fix; [upstream PR #72](https://github.com/micromatch/braces/pull/72)
remains unmerged. A production-only audit does not replace the full gate.
