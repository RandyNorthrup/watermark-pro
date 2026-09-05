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

## Controls in place (milestone M0)

- Response headers: CSP, HSTS, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` on both API and static responses.
- CSRF origin check on all state-changing API requests.
- Startup configuration validation; the Worker fails closed when misconfigured.
- Secrets scanning in the pre-commit hook and in CI (gitleaks, full history).
- Dependency vulnerability audit in CI at the `high` level.
- Static analysis with semgrep (`p/default`, `p/typescript`, `p/react`,
  `p/secrets`) in CI.
- Exact dependency pinning, `min-release-age=7` in `.npmrc`, GitHub Actions
  pinned to commit SHAs, semgrep container pinned by digest.
- No third-party runtime origins: fonts, scripts, and styles are self-hosted.

## Controls planned (see `PLAN.md` milestones)

- Session authentication with HttpOnly, Secure, SameSite cookies (M1).
- Role-based access control enforced server-side per route (M1).
- Audit log for every mutating action (M1).
- Rate limiting on authentication and upload endpoints (M1, tuned in M8).
- Upload validation by magic bytes, size, and dimensions (M6).
- Signed, expiring, revocable share links (M7).
- Turnstile bot protection on sign-up (M8).

## Handling secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets are set with
`wrangler secret put`. `.dev.vars.example` lists every variable the Worker
reads. Never commit a real value; the pre-commit hook will reject known secret
shapes, but the hook is a safety net, not permission.
