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

## Controls in place (milestones M0 to M3)

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
- Fail-closed configuration validation; the console email provider (which
  exposes a development mailbox) is refused in production.
- HTML email bodies are built with a library escaper; no raw interpolation.
- Secrets scanning in the pre-commit hook and in CI (gitleaks, full history).
- Dependency vulnerability audit in CI at the `high` level.
- Static analysis with semgrep (`p/default`, `p/typescript`, `p/react`,
  `p/secrets`) locally and in CI.
- Exact dependency pinning, `min-release-age=7` in `.npmrc`, GitHub Actions
  pinned to commit SHAs, semgrep container pinned by digest.
- No third-party runtime origins: fonts, scripts, and styles are self-hosted.
- Logo uploads (M3): type decided by file signature, never by the declared
  MIME type or extension; size limited before the body is read; per-organization
  quota; objects stored in R2 under organization-scoped keys, never public,
  streamed only to signed-in members with `Cache-Control: private`; deletion
  refused while a preset references the file. Every preset and logo change is
  audited.
- Preview rendering happens in the browser's Web Worker; a chosen photo is
  never uploaded to preview a preset.
- The editor (M4) and bulk tool (M5) keep photos and exports on the device:
  files are decoded in the browser, rendered in workers, zipped in memory,
  and downloaded through a same-origin object URL that is revoked
  immediately.

## Controls planned (see `PLAN.md` milestones)

- Photo uploads with the same signature, size and quota validation as logos, plus dimension limits (M6).
- Signed, expiring, revocable share links (M7).
- Turnstile bot protection on sign-up and an admin console (M8).
- Production wrangler environment with `APP_ENV=production` (M8).

## Handling secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets are set with
`wrangler secret put`. `.dev.vars.example` lists every variable the Worker
reads. Never commit a real value; the pre-commit hook will reject known secret
shapes, but the hook is a safety net, not permission.
