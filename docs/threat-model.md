# Threat model

Scope: Watermark Pro as deployed at `watermark.blowmoney.net` on Cloudflare
Workers (single Worker, D1, R2, Rate Limiting, Email Sending, optional
Turnstile). Reviewed 2026-09-06 for milestone M8 against the controls listed
in [SECURITY.md](../SECURITY.md). Re-review when a new trust boundary is
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
4. **CI → Cloudflare**: `wrangler deploy` from a tag with a scoped API token.
5. **Email → user**: verification, reset and invitation links.

## Threats and mitigations (STRIDE)

### Spoofing

| Threat                                 | Mitigation                                                                                                                                                                  | Evidence                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Credential stuffing, password guessing | 10 credential attempts / minute / address (Rate Limiting binding); 12–128 character passwords; mandatory email verification; Turnstile on sign-up and reset when configured | `auth-flow.test.ts` (429 with `X-Retry-After`), `admin.test.ts` (captcha) |
| Session theft                          | HttpOnly, SameSite=Lax, Secure cookies; sessions revoked on password reset and by admins                                                                                    | cookie flag test in `auth-flow.test.ts`                                   |
| Forged share tokens                    | HMAC-SHA-256 over `<id>.<expiry>` with a key derived from the application secret, verified in constant time; mismatched expiry refused                                      | `share-token.test.ts`, `shares.test.ts`                                   |
| Invitation hijack                      | Invitations are single-use, expire, and require a verified email matching the invitee                                                                                       | `auth-lifecycle.test.ts`                                                  |

### Tampering

| Threat                                         | Mitigation                                                                                                                                                          | Evidence                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Cross-site request forgery                     | `requireSameOrigin` on every state-changing request plus Hono's CSRF check and Better Auth's own origin checks                                                      | `auth-flow.test.ts` CSRF negatives                     |
| Malicious uploads (polyglots, oversized files) | Type from file signature only; size checked from `Content-Length` and the body; count and byte quotas; R2 keys are server-generated and organization-scoped         | `photos.test.ts`, `library.test.ts`, `uploads.test.ts` |
| Preset referencing another organization's logo | `assertAssetOwned` on create and update                                                                                                                             | `library.test.ts`                                      |
| Share listing photos outside the organization  | Photo ids validated against the organization before the share is created; public routes only serve listed ids                                                       | `shares.test.ts`                                       |
| Supply-chain tampering                         | Exact pins, `min-release-age=7`, `npm audit` at high, semgrep, gitleaks, dependency review on pull requests, actions pinned to SHAs, semgrep image pinned by digest | CI workflow                                            |

### Repudiation

| Threat                      | Mitigation                                                                                                                                                                         | Evidence                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Disputed changes            | Append-only audit trail for sign-ups, organization, membership, invitation, preset, logo, photo, share and admin actions, with actor id and name; addresses stored as a keyed hash | `audit.test.ts`, route tests |
| Admin abuse without a trace | Ban, unban, role and session-revocation calls are recorded with the admin as actor                                                                                                 | `admin.test.ts`              |

### Information disclosure

| Threat                                    | Mitigation                                                                                                                              | Evidence                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Reading another organization's data       | Every organization route resolves membership and role through Better Auth on each call; non-members and insufficient roles both get 403 | RBAC matrices in every route test file       |
| Enumerating organizations or shares       | 403/404 responses do not distinguish "does not exist" from "not yours"; share failures are one neutral 404                              | `shares.test.ts`                             |
| Public objects in R2                      | Bucket is private; every byte is streamed through the Worker after an authorization or token check; `Cache-Control: private`            | `photos.test.ts`, `library.test.ts`          |
| Photos leaving the device unintentionally | Editor and bulk rendering happen in Web Workers in the browser; uploads only on explicit "Save to gallery"                              | design; `bulk.browser.test.ts`               |
| Leaked stack traces                       | API errors are typed envelopes; unexpected errors become `internal_error`; the client shows only known messages                         | `index.test.ts`                              |
| Third-party scripts                       | CSP allows scripts from self and, when enabled, only `challenges.cloudflare.com`; fonts and icons are bundled                           | `public/_headers`, Lighthouse best-practices |

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

## Accepted residual risks

- **Client-reported image dimensions** are stored for display; the Worker
  never decodes images, so a client could misreport them. Impact: cosmetic.
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
