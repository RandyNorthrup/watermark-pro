# Security policy

Watermark Pro is built to be operated as an enterprise-grade service. This
document describes how to report a vulnerability and which controls the
project commits to. The threat model and accepted residual risks live in
`PLAN.md` §5.4 and are updated at every milestone.

## Reporting a vulnerability

Please do not open a public issue for security problems. Email the maintainer
at the address on the GitHub profile of the repository owner, or use GitHub's
private vulnerability reporting on the repository once it is enabled. Include
steps to reproduce, the affected version or commit, and impact. You will get
an acknowledgement within three business days.

## Supported versions

Only the `main` branch and the latest tagged release receive fixes.

## Controls in place

- Response headers: CSP, HSTS, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` on both API and static responses.
  Zero CSP violations on any page (verified in the M1 Lighthouse run).
- Same-origin guard on every state-changing API request, plus Hono's CSRF
  check for form bodies and Better Auth's own origin checks.
- Email + password authentication with mandatory email verification, password
  policy (12 to 128 characters), password reset tokens that expire after one
  hour and revoke other sessions, and sessions in HttpOnly SameSite=Lax
  cookies (Secure on https origins).
- Rate limiting through Workers Rate Limiting bindings: 10 requests per minute
  per address on credential endpoints, 120 on the rest of the auth API.
- Role-based access control enforced server-side on every custom route;
  non-members and insufficient roles both receive 403 without revealing
  whether the organization exists.
- Append-only audit trail for sign-ups and every organization, invitation and
  membership change, readable only by owners and admins.
- Fail-closed configuration validation; the console email provider is
  refused in production. Two test-only routes exist solely with that
  provider: the development mailbox (`GET /api/dev/mailbox`) and the
  platform-admin promotion the end-to-end suite uses (`POST /api/dev/promote`,
  the same change the runbook makes with a D1 update). Both answer 404 in
  any other configuration, and a Node test proves it.
- Transport: HSTS (one year, subdomains included) and every CSP source list
  limited to `'self'` or an explicit `https:` origin, so an https page can
  load no http subresource. `upgrade-insecure-requests` is deliberately not
  set: it adds nothing on this origin and WebKit applies it to plain-http
  localhost, which made the app unrenderable in Safari-engine tests.
- HTML email bodies are built with a library escaper; no raw interpolation.
- Secrets scanning in the pre-commit hook and in CI (gitleaks, full history).
- Dependency vulnerability audit in CI at the `high` level.
- Static analysis with semgrep (`p/default`, `p/typescript`, `p/react`,
  `p/secrets`) locally and in CI.
- Exact dependency pinning, `min-release-age=7` in `.npmrc`, GitHub Actions
  pinned to commit SHAs, semgrep container pinned by digest.
- Two third-party runtime origins, both Cloudflare's:
  `https://challenges.cloudflare.com` in `script-src` and `frame-src` for the
  Turnstile widget, and `https://static.cloudflareinsights.com` /
  `https://cloudflareinsights.com` for the cookie-less Web Analytics beacon
  the zone injects (SRI-pinned by Cloudflare; disable "automatic setup" on
  the zone to drop it). Fonts, styles and everything else are self-hosted.
- Logo uploads (M3): type decided by file signature, never by the declared
  MIME type or extension; size limited before the body is read; per-organization
  quota; objects stored in R2 under organization-scoped keys, never public,
  streamed only to signed-in members with `Cache-Control: private`; deletion
  refused while a preset references the file. Every preset and logo change is
  audited.
- Preview rendering happens in the browser's Web Worker; a chosen photo is
  never uploaded to preview a preset.
- Stored photos (M6): both the photo and its thumbnail are typed by file
  signature, size-limited before the body is read, and counted against
  per-organization photo and byte quotas; objects live under
  organization-scoped R2 keys, are served only to signed-in members with
  `Cache-Control: private`, and every upload and deletion is audited.
- Share links (M7): tokens are `<id>.<expiry>.<HMAC-SHA-256>` signed with a
  key derived from the application secret and verified in constant time;
  expiry is enforced from the token and revocation from the database; the
  public routes carry no session, are rate limited per address, serve only
  the photos listed in the share, return one neutral 404 for expired,
  revoked, tampered and unknown tokens, and mark the album JSON `no-store`.
  Creating and revoking links needs the `share` permission and is audited.
- The editor (M4) and bulk tool (M5) keep photos and exports on the device:
  files are decoded in the browser, rendered in workers, zipped in memory,
  and downloaded through a same-origin object URL that is revoked
  immediately.
- Metadata policy (M10, extended M13): every export is re-encoded from pixels
  by the canvas, so no metadata is carried unless the user chooses to. The
  default is **strip** — no camera data and no location reaches the output,
  the share sheet or the gallery. Two explicit per-export keep modes exist:
  **keep except location** copies the source's Exif with the GPS IFD emptied
  and its pointer zeroed (and the orientation tag reset to 1, since the pixels
  are already upright), and **keep everything** copies the Exif and XMP as-is.
  WebP is always stripped. GPS is named in the "keep everything" label, and
  the `{location}` token is opt-in by typing it. Metadata is read and written
  in the browser; nothing is uploaded for it. GPS removal in keep-except-
  location is proven by a unit test (`exif-edit.test`), a browser test
  (`metadata.browser.test`) and a red drill; an untrusted-input fuzz test runs
  400 random mutations through the scanners without a throw.
- Sharing an export through the Web Share API (M10) hands the file to the
  operating system's share sheet; the browser only offers the button where
  `navigator.canShare({ files })` accepts the output type, and the app
  itself never sees where the file goes.
- QR-code marks (M10) are rendered from the content typed into the preset;
  the content is stored with the preset (limited to 512 characters) and
  rendered as pixels, never interpreted or fetched by the app.

- Bot protection (M8): when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
  are configured, sign-up and password-reset requests must carry a Turnstile
  token that the Worker verifies with Cloudflare before Better Auth runs;
  a missing token is a 400 and a rejected one a 403. The two variables must
  be set together or the configuration is refused.
- Platform administration (M8): a separate `admin` role checked server-side
  by `requirePlatformAdmin` on the organization and audit listing routes and
  by Better Auth's admin plugin on user management. Bans (with a mandatory
  reason), unbans, role changes and forced sign-outs are written to the audit
  trail with the administrator as the actor. Banned users cannot sign in and
  lose their sessions.
- Supply chain (M8): GitHub dependency review blocks pull requests that add a
  dependency with a high or critical advisory or a licence outside the
  allow-list; production deploys run only from version tags after the full
  gate chain and the end-to-end suite pass on that commit.
- The threat model in [docs/threat-model.md](docs/threat-model.md) lists the
  assets, trust boundaries, mitigations and accepted residual risks; the
  operational playbook (rollback, secret rotation, Time Travel restores,
  bans, share revocation) is in [docs/runbook.md](docs/runbook.md).

## Handling secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets are set with
`wrangler secret put`. `.dev.vars.example` lists every variable the Worker
reads. Never commit a real value; the pre-commit hook will reject known secret
shapes, but the hook is a safety net, not permission.
