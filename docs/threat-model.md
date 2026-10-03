# Threat model

Scope: Lumafoil as deployed at `lumafoil.com` on Cloudflare
Workers (single Worker, D1, R2, Rate Limiting, Email Sending and
Turnstile). Admission/cohort amendments reviewed 2026-10-02 within open milestone M19 against the controls listed
in [SECURITY.md](../SECURITY.md); the platform-telemetry boundary was reviewed
again on 2026-09-09 for M19. Re-review when a new trust boundary is
added (a new binding, a new public route, a new third-party origin).

## Assets

| Asset                            | Where                                     | Why it matters                                                  |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Account credentials and sessions | D1 `user`, `account`, `session`; cookies  | Access to every organization the user belongs to                |
| Organization data                | D1 `organization`, `member`, `invitation` | Tenancy boundary; membership decides what a user may see        |
| Presets and logos                | D1 `watermark`, `asset`; R2 `org/*/logos` | Brand assets; logos are uploaded files                          |
| Stored photos and thumbnails     | D1 `photo`; R2 `org/*/photos`, `…/thumbs` | Customer work; often unreleased                                 |
| Share links                      | D1 `share`; signed tokens                 | Deliberate, bounded disclosure of photos to outsiders           |
| Audit trail                      | D1 `audit_log`                            | Accountability; must be append-only from the application's view |
| Secrets                          | Worker secrets, CI secrets                | `BETTER_AUTH_SECRET` signs sessions and share tokens            |
| Availability of processing       | Browser (workers), Worker CPU, R2 egress  | Rendering is client-side; the Worker is a thin API              |

## Trust boundaries and entry points

1. **Browser → Worker API** (`/api/*`): authenticated JSON and multipart
   requests, same-origin only.
2. **Anyone → public routes**: `/api/health`, `/api/config`, `/api/share/*`,
   the auth endpoints for sign-up, sign-in and password reset, and the
   static SPA.
3. **Worker → Cloudflare services**: D1, R2, Rate Limiting, Email Sending,
   Turnstile siteverify (outbound HTTPS).
4. **CI → Cloudflare**: guarded deployment from current `main` after canonical
   quality, SAST, every device journey and complete release audits. Credentials
   are scoped to the production environment and withheld from earlier jobs.
5. **Email → user**: verification, reset and invitation links.
6. **Worker invocation → platform telemetry**: Cloudflare can enrich a sanitized
   application log with the original request URL, independently of the
   application's formatter. The local deployment configuration disables
   persistent platform logs and traces; live operator tails remain sensitive.

## Threats and mitigations (STRIDE)

The human-control runtime source passed full implementation gates in draft PR #12.
The private-membership and recent-credential implementations passed complete
exact-commit CI gates in draft PRs #13 and #14; neither migration
nor a new production deployment is claimed. Private payment/cohort
quotas and recent-authentication certification remain tracked in
`docs/plans/public-billing.md`. The recent-credential candidate adds nullable
server-owned session proof rather than trusting session creation time, browser
dates, challenge success or payment. Email verification and renewal cannot
advance it. Both custom sensitive APIs and auth-plugin mutation seams require
proof from the preceding ten minutes; cloud token/connection operations share
that boundary. Reauthentication retains only a still-authorized workspace and
never replays a mutation. Missing/future/malformed/expired proof, role negatives,
verification/renewal replay and account changes require real-auth/D1/browser
evidence. Those implementation negatives passed for credential runtime `77f6a9a`
in workflow `37009328785`; full release certification and deployment remain open.

### Spoofing

| Threat                                      | Mitigation                                                                                                                                                                                                                                                        | Evidence                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Credential stuffing, password guessing      | 10 credential attempts / minute / address (Rate Limiting binding); 12–128 character passwords; mandatory email verification; Required production Turnstile with exact hostname/action for signup, password/social entry and recovery; provider errors fail closed | `auth-flow.test.ts` (429 with `X-Retry-After`), `admin.test.ts` (captcha) |
| Forged private membership / revocation race | New account defaults to pending; only server admission activates its cohort. Client cohort fields cannot grant privileges. Pending accounts remain blocked after email verification.                                                                              | `private-membership.test.ts`, `private-membership.workers.test.ts`        |
| Unbounded private invite chain              | Two new admissions per private user; pending email/reusable reservations share one atomic budget. Historical accepted spend excluded; new accepted spend survives deletion/rotation. Public roles never confer private invitation rights.                         | Migration tests; real-auth role negatives; concurrent D1 tests            |
| Session theft                               | HttpOnly, SameSite=Lax, Secure cookies; sessions revoked on password reset and by admins                                                                                                                                                                          | cookie flag test in `auth-flow.test.ts`                                   |
| Forged share tokens                         | HMAC-SHA-256 over `<id>.<expiry>` with a key derived from the application secret, verified in constant time; mismatched expiry refused                                                                                                                            | `share-token.test.ts`, `shares.test.ts`                                   |
| Invitation hijack                           | Invitations are single-use, expire, and require a verified email matching the invitee                                                                                                                                                                             | `auth-lifecycle.test.ts`                                                  |

### Tampering

| Threat                                         | Mitigation                                                                                                                                                                      | Evidence                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Cross-site request forgery                     | `requireSameOrigin` on every state-changing request plus Hono's CSRF check and Better Auth's own origin checks                                                                  | `auth-flow.test.ts` CSRF negatives                     |
| Malicious uploads (polyglots, oversized files) | Type from file signature only; size checked from `Content-Length` and the body; count and byte quotas; R2 keys are server-generated and organization-scoped                     | `photos.test.ts`, `library.test.ts`, `uploads.test.ts` |
| Preset referencing another organization's logo | `assertAssetOwned` on create and update                                                                                                                                         | `library.test.ts`                                      |
| Share listing photos outside the organization  | Photo ids validated against the organization before the share is created; public routes only serve listed ids                                                                   | `shares.test.ts`                                       |
| Supply-chain tampering                         | Exact pins, `min-release-age=7`, local `npm audit` at high, semgrep, gitleaks, actions pinned to SHAs, semgrep image pinned by digest; hosted workflows require manual dispatch | Local release gate and manual CI workflow              |

### Repudiation

| Threat                      | Mitigation                                                                                                                                                                         | Evidence                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Disputed changes            | Append-only audit trail for sign-ups, organization, membership, invitation, preset, logo, photo, share and admin actions, with actor id and name; addresses stored as a keyed hash | `audit.test.ts`, route tests |
| Admin abuse without a trace | Ban, unban, role and session-revocation calls are recorded with the admin as actor                                                                                                 | `admin.test.ts`              |

### Information disclosure

| Threat                                                         | Mitigation                                                                                                                                                                                                                                                                                                                     | Evidence                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Reading another organization's data                            | Every organization route resolves membership and role through Better Auth on each call; non-members and insufficient roles both get 403                                                                                                                                                                                        | RBAC matrices in every route test file                                          |
| Enumerating organizations or shares                            | 403/404 responses do not distinguish "does not exist" from "not yours"; share failures are one neutral 404                                                                                                                                                                                                                     | `shares.test.ts`                                                                |
| Public objects in R2                                           | Bucket is private; every byte is streamed through the Worker after an authorization or token check; `Cache-Control: private`                                                                                                                                                                                                   | `photos.test.ts`, `library.test.ts`                                             |
| Photos leaving the device unintentionally                      | Editor and bulk rendering happen in Web Workers in the browser; uploads only on explicit "Save to gallery"                                                                                                                                                                                                                     | design; `bulk.browser.test.ts`                                                  |
| Camera metadata (GPS, capture time) in exports or shared files | Every export is re-encoded from pixels by the canvas; strip (the default) copies no metadata. Keep modes are an explicit per-export choice; keep-except-location empties the GPS IFD and zeroes its pointer, keep names GPS in its label, and `{location}` is opt-in by typing the token. Read and written in the browser only | `exif-edit.test`, `metadata.browser.test`, the GPS red drill, and the fuzz test |
| Test-only routes reachable in production                       | `GET /api/dev/mailbox` and `POST /api/dev/promote` exist only with the console email provider, which configuration validation refuses in production; otherwise 404                                                                                                                                                             | `admin.test.ts` ("dev promotion route"), `env.test.ts`                          |
| Leaked stack traces                                            | API errors are typed envelopes; unexpected errors become `internal_error`; the client shows only known messages                                                                                                                                                                                                                | `index.test.ts`                                                                 |
| Third-party scripts                                            | CSP allows scripts from self, `challenges.cloudflare.com` (Turnstile) and `static.cloudflareinsights.com` (the zone's SRI-pinned Web Analytics beacon); fonts and icons are bundled                                                                                                                                            | `public/_headers`, Lighthouse best-practices                                    |
| Mixed content on the https origin                              | HSTS (one year, subdomains) and CSP source lists of `'self'` and explicit https origins only; `upgrade-insecure-requests` is not set because it adds nothing here and breaks WebKit against plain-http localhost                                                                                                               | `public/_headers`, `smoke.spec.ts` on every device project                      |

### Denial of service

| Threat                            | Mitigation                                                                                                                      | Evidence                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Auth endpoint floods              | Rate Limiting bindings (10/min credentials, 120/min other auth), Turnstile when configured                                      | `auth-flow.test.ts`                 |
| Public share scraping             | Same per-address limiter on `/api/share/*`, 429 with `Retry-After`                                                              | `shares.test.ts`                    |
| Storage exhaustion                | 40 MB per photo, 1 MB per thumbnail, 5 MB per logo, 50 logos, 10 000 photos and 2 GB per organization, 500 files per bulk batch | `photos.test.ts`, `library.test.ts` |
| Expensive rendering on the Worker | None exists: rendering, ZIP building and thumbnails run in the browser                                                          | design                              |

### Elevation of privilege

| Threat                                  | Mitigation                                                                                                          | Evidence                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Viewer performing writes                | Server-side `requirePermission` on every write; client hides controls but never authorizes                          | viewer negatives in every route test |
| Member reaching platform administration | `requirePlatformAdmin` checks the Better Auth `admin` role; the admin plugin enforces the same on its own endpoints | `admin.test.ts`                      |
| Banned user continuing                  | Better Auth rejects sign-in for banned users and revokes sessions on ban                                            | `admin.test.ts`                      |

### Subscription authority and signed provider events (candidate)

Attackers may forge plan/customer/price/return inputs, reuse another tenant's
Checkout, replay a signed event, submit an old event after a renewal, race two
handlers, or delete/demote the only payer who can cancel a subscription. Strict
shared product-intent schemas, verified payer/recent-proof checks and current
ownership when a workspace exists refuse client authority. Account/mode readback and per-workspace customer bindings
keep an unrelated business or workspace outside billing authority. Portal price
updates are disabled because Pro personal and Team shared ownership are distinct.

The webhook's exact POST is authenticated by a bounded raw signature rather than
browser origin. Five-minute past/future windows, raw-byte caps and rejection of
Connect/organization contexts close spoofing/replay seams. Durable receipts track
event IDs, while current provider objects and fenced exclusive leases handle
reordering and concurrent stale responses. D1 commits subscription, new paid
workspace, owner, quotas and receipt together. A banned payer's event records
financial state while retaining suspended access and never creating a Team.
Actual succeeded current-period payments are checked through invoice/intent/charge
linkage. Refunds and unresolved/lost disputes suspend paid capacity. Paid expiry
is rechecked inside existing writes, preserving content and independent grants.

Deletion/ownership triggers retain an authenticated cancellation path while
billing can charge. Before self/admin deletion, an existing banned-field marker
quiesces new financial operations before any credential row is removed. Existing
leases and live user checks reject in-flight work across that boundary. Closure
expires Checkout or cancels the server-bound subscription, verifies terminal
chargeability, then permits auth deletion. Failure restores only the exact marker,
so concurrent moderation cannot be undone and password rows remain recoverable.

Security ban commits paid suspension before attempting provider closure. Delayed
signed events cannot grant or provision for banned users. Existing banned +
chargeable authority is the cron retry signal; no new job table exists. Provider
outage can delay cancellation but cannot release deletion protection or orphan
the financial payer. A local deletion failure after provider closure may retain
the temporary marker and requires verified operator recovery. The current delta
still needs final-source proof; these controls do not certify complete privacy.

Validated payer transfer and financial retention/deletion remain pre-launch work.
Root created the separate verified Lumafoil account and test catalog/portal on
2026-10-03. Isolated actual test-mode gateway proof now verifies hosted Pro
payment, linked paid-period state, identity negatives, refund/cancellation and six
provider-signed event types. Full application-to-provider-to-D1 lifecycle, portal
interaction and business activation remain pending. Named provider fixtures are
not evidence of live availability; the actual gateway receipt does not certify
application entitlements or production readiness.

## Accepted residual risks

- **Platform request enrichment** can expose bearer values carried in URL paths.
  A 2026-09-09 hosted probe proved that disabling invocation records and
  redacting query strings still leaves paths in persisted custom-log metadata.
  The reviewed Wrangler configuration therefore disables platform logs/traces
  and persistence while retaining application D1 diagnostics and private live
  tailing. See [hosted evidence](verification/m19/platform-observability-privacy.md).
  Applying this configuration to production is a separate release check; it
  does not remove historical provider records or sanitize operator captures.

- **Encoded image payload corruption** remains possible after valid dimension
  fields. The isolated M19 candidate derives stored PNG/JPEG/WebP display dimensions
  from encoded headers and genuine JPEG orientation, rejects contradictory claims
  and applies actual side bounds. This removes client authority over dimension
  metadata; it does not decode compressed pixels, validate every container field
  or guarantee complete image validity. Actual near-limit runtime/memory and
  combined source verification remain required before release certification.
- **Share links are bearer tokens**: anyone holding the URL can view until it
  expires or is revoked. This is the feature; expiry defaults to seven days in
  the UI and revocation is immediate.
- **`style-src 'unsafe-inline'`** remains for UI primitives (PLAN.md §9).
- **esbuild advisory GHSA-67mh-4wv8-2f99** (moderate) via `drizzle-kit`, a
  development-only tool that never runs a network server here; `npm audit`
  gates at high.
- **Better Auth memory adapter in Node tests** differs from D1; the workerd
  test project runs the same routes against real D1 and R2 to close that gap.

## Out of scope

Cloudflare's own infrastructure, the user's device, and email transport
security beyond TLS to Cloudflare Email Sending.
