# Security policy

This document describes vulnerability reporting and Lumafoil's application
security controls. The threat model, release checks, and residual risks live in
`PLAN.md` §5.4 and are updated at every milestone.

## Reporting a vulnerability

Please do not open a public issue for security problems. Email
[support@lumafoil.com](mailto:support@lumafoil.com), or use
[GitHub's private vulnerability reporting](https://github.com/RandyNorthrup/watermark-pro/security/advisories/new).
Include
steps to reproduce, the affected version or commit, and impact. You will get
an acknowledgement within three business days.

## Supported versions

Only the `main` branch and the latest tagged release receive fixes.

## Controls in place

- Response headers: CSP, HSTS, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` on both API and static responses.
- Same-origin guard on every state-changing API request, plus Hono's CSRF
  check for form bodies and Better Auth's own origin checks.
- Invitation-only signup with mandatory verified email. Google and Microsoft
  identity sign-in are separate from cloud-file connections; existing accounts
  do not need another invitation. Additional sign-in methods require explicit
  authenticated linking. Passwords use a 12-to-128-character policy; reset tokens
  expire after one hour and revoke other server sessions. Sessions use HttpOnly,
  SameSite=Lax cookies, Secure on HTTPS. Signed OAuth state cookies last ten
  minutes and are always checked. Provider access/refresh tokens are encrypted;
  identity tokens and provider avatars are not persisted.
- Site invitations and reusable referral links grant separate private accounts,
  never membership in the inviter's workspace. Admission rechecks that the
  inviter exists, has verified email and is not banned, including during OAuth
  callbacks. Banning through the application revokes outstanding admissions;
  unbanning does not revive those links. Deleting the inviter cascades their
  invitation/link rows. Explicit collaboration uses separate workspaces.
- Exactly one anchored site administrator. Workspace owner/admin roles do not
  grant site administration. API and D1 guards refuse additional administrators,
  anchor changes, owner removal/demotion, impersonation, or administrative
  takeover of another user's email or password.
- Rate limiting through Workers Rate Limiting bindings: 10 requests per minute
  per address on credential endpoints, 120 on the rest of the auth API.
- Role-based access control enforced server-side on every custom route;
  non-members and insufficient roles both receive 403 without revealing
  whether the organization exists.
- Application audit records cover account, workspace, invitation, library,
  gallery and sharing changes. Workspace audit routes require an owner/admin
  role; the site administrator can review global moderation and audit records.
  Account/invitation totals are site-admin-only; recent-work history is per user.
- Validated offline display snapshots have no arbitrary age cutoff. Online boot
  validates the live session before showing private workspace data. A real
  transport outage may admit only the prepared account and unchanged account
  generation; server 401/403, sign-out, malformed data, and future timestamps
  never authorize a cached fallback. Cached display state is not a credential.
- Private offline copies and queues are scoped by account and workspace. Account
  changes invalidate in-memory state; unsynchronized changes block sign-out and
  unsafe account switches. Replay requires a server-checked account binding.
  Successful sign-out clears local app data. A disconnected device can retain
  copies until it reconnects or its browser data is cleared.
  The earlier global `Clear-Site-Data` logout policy is superseded: a delayed
  old-account response must not erase a newer account's queued work. Cleanup is
  awaited and scoped to the departing account; public service-worker assets
  contain no private data and can remain cached.
- Installed-app file launches capture account ownership before asynchronous file
  reads. Explicit locks, account changes and newer launches invalidate old work;
  only trusted initial admission can preserve a new unowned launch. Editor and
  bulk intake consume only their matching target, and delayed editor metadata
  cannot replace another account's or a newer selection's photo.
- Real-stream API limits include Better Auth regardless of declared content
  type/length. Photo/logo quota admission is atomic in D1 and accounts for
  thumbnails and pending work. Metadata, audit and receipts commit together;
  durable cleanup and lease-specific object keys protect failure recovery.
  Database guards prevent dangling/foreign logo references and workspace
  deletion while saved content or storage cleanup remains.
- Auth and Worker diagnostics omit raw tokens, request bodies, state details,
  provider identity fields and database parameters. Better Call's raw fallback
  logger is bypassed in favor of the sanitized Worker error handler.
- Automatic browser reports send only a fixed error classification, code
  coordinates from the app's own compiled assets and a known route shape.
  Arbitrary messages, rejected objects, stack text, URL parameters, content IDs
  and full user-agent strings are not stored. The server normalizes direct
  submissions too; detailed local browser errors remain on the user's device.
- Release configuration disables persistent Cloudflare Worker logs and traces:
  a hosted probe showed that custom-log enrichment otherwise retains bearer
  request paths despite invocation-log disabling. Application diagnostics and
  audits remain separate. Private live-tail envelopes still contain request
  URLs and must not be published. See
  [the platform privacy evidence](docs/verification/m19/platform-observability-privacy.md).
- Fail-closed configuration validation; the console email provider is
  refused in production. Two test-only routes exist solely with that
  provider: the development mailbox (`GET /api/dev/mailbox`) and the
  initial singleton administrator bootstrap used by isolated verification
  (`POST /api/dev/promote`), which refuses a second administrator. Both answer 404 in
  any other configuration, and a Node test proves it.
- Transport: HSTS (one year, subdomains included) and every CSP source list
  limited to `'self'` or an explicit `https:` origin, so an https page can
  load no http subresource. `upgrade-insecure-requests` is deliberately not
  set: it adds nothing on this origin and WebKit applies it to plain-http
  localhost, which made the app unrenderable in Safari-engine tests.
- HTML email bodies are built with a library escaper; no raw interpolation.
- Secrets scanning in the pre-commit hook and in CI, including full Git history,
  current source, index and release archives. The independent publication audit
  compares configured private values against original bytes and does not trust
  generic repository ignore files. One revoked historical Picker key has an
  exact immutable finding/digest exception; current and built copies receive no
  exception. See [the retirement record](docs/verification/m19/picker-key-rotation.md).
- Dependency vulnerability audit in CI at the `high` level.
- Static analysis with semgrep (`p/default`, `p/typescript`, `p/react`,
  `p/secrets`) locally and in CI.
- Exact dependency pinning, `min-release-age=7` in `.npmrc`, GitHub Actions
  pinned to commit SHAs, semgrep container pinned by digest.
- Fonts, stickers, styles and application code are self-hosted. Turnstile uses
  Cloudflare's challenge origin; explicitly invoked cloud connections also use
  the Google, Dropbox and Microsoft script, frame and API origins enumerated in
  `public/_headers`. Microsoft authentication code is bundled. Earlier analytics
  CSP allowances were removed; final hosted verification must also confirm that
  the zone does not inject analytics into private or bearer-link routes.
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
- Video watermarking (M17) runs entirely in the browser: each file is demuxed,
  decoded, watermarked frame by frame and re-encoded with WebCodecs and
  `mediabunny` inside a dedicated Web Worker with no network or storage access,
  so no bytes leave the device. Size, duration and dimension limits
  (`MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS`, `MAX_VIDEO_SIDE`) are enforced from
  the file's metadata before any frame is decoded, and the watermarked file is
  downloaded through a same-origin object URL; the gallery does not store videos.
- PDF watermarking (M17) runs entirely in the browser: `pdf-lib` parses the
  chosen documents' untrusted bytes in the page, with no Worker or server
  exposure and no upload. Encrypted documents are refused rather than
  processed, and each file is bounded before work begins by a size cap
  (`MAX_PDF_BYTES`), a page cap (`MAX_PDF_PAGES`, enforced in
  `watermark-pdf.ts`) and a per-batch file cap (`MAX_PDF_FILES`); the marks are
  drawn from the same presets as photos and the watermarked file is downloaded
  through a same-origin object URL. `pdf-lib` is unmaintained (last release
  2021); its maintained fork `@cantoo/pdf-lib` is the migration target if a fix
  is ever needed (PLAN.md §3.1).

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
