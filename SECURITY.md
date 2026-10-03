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

## Current release blocker — 2026-10-02

The required full dependency audit rejects GHSA-vfj7-8cjw-p6xm
([GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)), a stack-exhaustion
availability vulnerability affecting `braces` through 3.0.3. The installed path is
Stylelint 17.15.0 → micromatch 4.0.8 → braces 3.0.3. At verification, the latest
braces registry release was still 3.0.3, no patched version was listed, and latest
Stylelint 17.16.0 still depended on micromatch 4.0.8. These are development-tool
findings; a separate production-only audit returned zero findings. That narrower
result does not satisfy or replace the full release gate. No advisory waiver,
forced downgrade or dependency substitution has been applied. See the
[release-blocker receipt](docs/verification/m19/release-blockers-2026-10-02.md).

## Controls in place

- Public signup is an independent explicit release switch, disabled by default.
  Enabling it requires real Turnstile keys even outside production; email
  verification, identity attestation, bans and recent credential proof retain
  their existing authority. Durable public reservations precede creation and
  activation, store purpose-bound HMAC email keys, and bound rolling-day spending
  and public-account population. Accepted spending cannot be released by deleting
  an account. Failed activation remains pending; a supplied invalid private
  invitation never falls back to public admission. Migration `0024`, complete
  combined-source verification and launch approval remain outstanding.

- Bulk CSV reports escape delimiters/quotes and prefix spreadsheet-like text
  values so imported file names, preset names and error strings are not emitted
  as formulas. This is an export safeguard, not a guarantee about later editing,
  re-saving or interpretation by every spreadsheet importer. See
  [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).

- Response headers: CSP, HSTS, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` on both API and static responses.
  The default referrer policy is `strict-origin`: request referrers contain only
  the origin, including same-origin requests from invitation/share pages. This
  removes bearer paths while retaining the origin used by provider key
  restrictions. Cloud authorization callback responses use the stricter `no-referrer` policy.
- Same-origin guard on every state-changing API request, plus Hono's CSRF
  check for form bodies and Better Auth's own origin checks.
- Default-closed public signup and private invitation signup both require verified email. Google and Microsoft
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
  invitation/link rows. Workspace sharing requires an explicit owner grant for
  the selected workspace, including when its owner chooses to share a personal
  workspace. Site admission alone never grants access to the inviter's content.
- Exactly one anchored site Owner. Workspace owner/admin roles do not grant
  global site management. The Owner may appoint Admins; both roles can manage
  non-owner users. API and D1 guards refuse another Owner, anchor changes,
  owner removal/demotion/ban, impersonation, or administrative takeover of
  another user's email or password.
- Rate limiting through Workers Rate Limiting bindings: 10 requests per minute
  per address on credential endpoints, 120 on the rest of the auth API.
- Role-based access control enforced server-side on every custom route;
  non-members and insufficient roles both receive 403 without revealing
  whether the organization exists.
- Application audit records cover account, workspace, invitation, library,
  gallery and sharing changes. Workspace audit routes require an owner/admin
  role; the site Owner and Admins can review global moderation and audit records.
  Account/invitation totals are site-manager-only; recent-work history is per user.
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
  exception. The aggregate candidate cap charges only the existing exact
  original-path/byte/historical-treatment dedup identity; raw occurrence bytes
  remain reported. Every original path/private-value/file-size/LFS check and all
  history/archive bounds remain enforced before or alongside that sharing.
  See [the retirement record](docs/verification/m19/picker-key-rotation.md).
- Dependency vulnerability audit in CI at the `high` level.
- Static analysis with semgrep (`p/default`, `p/typescript`, `p/react`,
  `p/secrets`) locally and in CI.
- Exact dependency pinning, `min-release-age=7` in `.npmrc`, GitHub Actions
  pinned to commit SHAs, semgrep container pinned by digest.
- Fonts, stickers, styles and application code are self-hosted. Turnstile uses
  Cloudflare's challenge origin; explicitly invoked cloud connections also use
  the Google, Dropbox and Microsoft script, frame and API origins enumerated in
  `public/_headers`. Cloud OAuth callbacks and encrypted refresh credentials now
  stay on the Worker; obsolete browser token/redirect bridges and their SDK were
  removed. The native video viewer admits only same-origin and local blob media.
  PDF.js, its parsing worker and font/decoder assets are self-hosted; its image
  and color decoders use narrowly allowed WebAssembly compilation, without
  allowing general JavaScript eval. Earlier analytics CSP allowances were
  removed, and the hosted audit confirmed Cloudflare automatic Web Analytics
  injection is disabled on `lumafoil.com`.
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
  Multi-clip projects are Zod-validated, bounded to 32 source assets and 64 clips,
  two video/four audio tracks and ten minutes of timeline duration. Aggregate
  source bytes retain the 2 GiB cap. Native demuxing and decoding determine media
  kind and source bounds, regardless of claimed MIME or extension. Worker export
  rechecks source identities, dimensions, duration and decode support; audio is
  mixed in bounded chunks rather than loading complete source PCM. Edited audible
  tracks are refused when their target encoder is unavailable. Sources, project
  state and pending outputs retain account/workspace-generation guards and are
  disposed on a new project, identity change or unmount. Native audio decoding retains
  the stock SDK capability/queue/error/flush/close authority. A guarded downstream
  correction translates negative native input timestamps and maps actual decoded
  frames onto codec-derived packet spans, preserving explicit presentation gaps.
  Unknown frame provenance, unexpected rates, surplus or unexplained discarded
  frames fail explicitly. The normal guard validates the complete seven-artifact
  pristine/prior/corrected state before any write; mixed states reject. Complete
  preferred source and reconstructable generated bytes are published in the
  pinned MPL offer. Native original 18, both-engine canonical 20 and 58 finite
  guard/span contracts pass. Physical proof is limited to named LC fixtures;
  final Linux, full device and release certification remain required.
- PDF watermarking (M17) runs entirely in the browser: `pdf-lib` parses the
  chosen documents' untrusted bytes in the page, while PDF.js supplies a
  dedicated local parsing/rendering worker. There is no upload unless the user
  explicitly chooses a cloud save. Encrypted documents are refused rather than
  processed, and each file is bounded before work begins by a size cap
  (`MAX_PDF_BYTES`), a page cap (`MAX_PDF_PAGES`, enforced in
  `watermark-pdf.ts`) and the shared 500-file Bulk cap; the marks are
  drawn from the same presets as photos and the watermarked file is downloaded
  through a same-origin object URL. `pdf-lib` is unmaintained (last release
  2021); its maintained fork `@cantoo/pdf-lib` is the migration target if a fix
  is ever needed (PLAN.md §3.1).

- Human verification (M19 implementation verified; live-provider/release certification pending): production
  requires both real Turnstile keys and an HTTPS origin. Cloudflare's dummy keys
  and incomplete/missing pairs fail configuration validation. Email signup, password sign-in and
  OAuth entry use the admission action; password recovery and verification-email
  resend use a separate action.
  Tokens and response bytes are bounded; Siteverify has a ten-second deadline,
  cannot redirect, sends no email, user ID or client IP, and Zod requires exact
  boolean success. Tokens must match the configured hostname and
  action; missing/malformed tokens are 400 and rejected tokens are 403. Provider
  failure refuses admission. Non-production isolated fixtures may omit both keys.
  Client controls wait for verified configuration and a solved challenge; every
  attempted submission removes its consumed token and remounts the widget.
  Every custom account/workspace API and privileged organization/admin plugin
  endpoint also refuses an existing session whose email is unverified or whose
  account remains banned. Bans, rate limits and workspace permission checks remain
  independent. Passing a challenge never establishes real-world identity or
  grants roles, paid entitlements, private invitation rights or another user's
  content. The recovery endpoint's actual Better Auth route and OAuth entry now
  use the strict credential limiter. Runtime source `b908155` passed full hosted
  quality, SAST and the 136-journey four-device Playwright/axe matrix; local
  challenge cases and viewed English/Arabic light/dark auth captures passed.
  Live-provider verification and complete M19 release certification remain open.
- Private membership (M19, exact-commit implementation gates passed; release/deployment pending): server-owned membership is
  independent of payment and workspace/site roles. Historical accounts retain
  their cohort and grants; new rows remain pending until server admission. A
  revoked-during-creation invitation cannot activate a pending account through
  later email verification. Public accounts have no private invitation rights;
  both API and D1 inviter eligibility enforce the cohort, verification and ban.
  Two new admissions are reserved atomically across targeted/reusable requests;
  accepted spend survives recipient deletion and token/link changes. The cutover
  retains at most two oldest live promises per inviter and revokes excess
  pending promises. Historical accepted invitations are excluded from new spend.
  Unused rotation/revocation releases reservations; independent rate limits
  continue to bound repeated mail/link operations. Production public signup and
  billing entitlement enforcement have not yet launched.
- Workspace capacity (M19 candidate under verification): server plan records
  separate historical/private base grants from expiring, suspendable paid
  periods. Member-visible responses omit billing identifiers and admission
  state. Upload quota admission reads current authority inside the D1 write;
  commit rechecks it before metadata/audit/completion. Downgrade retains stored
  data, and outstanding cleanup continues to consume capacity. Metadata or
  client plan names cannot activate paid access. Member admission now has a live-plan/D1 candidate under verification;
  creation gates now have a server/D1 candidate under verification. Signed
  payment reconciliation remains under implementation.
  Public signup stays closed.
- Workspace creation (M19 candidate under verification): immutable server-only
  provenance binds private creation to its original account, independently of
  role transfers and untrusted metadata. Existing workspaces and grants survive
  migration. New personal preparation is identity-bound and idempotent; private
  shared creation requires live verified, unbanned private admission and one
  unused slot. The organization INSERT trigger fences concurrent requests.
  New historical/paid claims are refused until trusted billing provisioning is
  installed; no client paid flag or price can activate access. A quota race
  returns a neutral conflict without a creation audit. Complete gates remain open.
- Recent credential proof (M19 implementation gates passed; release/deployment pending):
  a server session field with `input: false` records successful password or
  validated identity sign-in. Nullable migration leaves old sessions unproved.
  Sensitive custom invitation/access/share/deletion/admin and reserved billing
  mutations, cloud credentials/connection changes and auth-plugin security
  mutations require proof from the preceding ten minutes. Missing, malformed,
  future or expired proof is refused. Verification, challenge success, payment,
  profile/session fields and renewal do not establish or extend it. Ordinary
  authorized reads/saves/editing remain available. Reauthentication never grants
  a role or membership; selected workspaces are rechecked before carryover. Both
  browser transports provide an account-bound prompt without automatic replay.
  Full-page sign-in follows the session-only editor lifecycle; the prompt tells
  users to save or export unfinished edits before leaving.
- Platform administration (M8): a separate `admin` role checked server-side
  by `requirePlatformAdmin` on the organization and audit listing routes and
  by Better Auth's admin plugin on user management. Bans (with a mandatory
  reason), unbans, role changes and forced sign-outs are written to the audit
  trail with the administrator as the actor. Banned users cannot sign in and
  lose their sessions.
- Supply chain: dependencies and licences are checked by local quality and
  release gates. Pull requests automatically run canonical quality, Semgrep and
  all four Playwright/axe devices; main merges also run full UI release audits
  before automatic deployment. Dependabot version/security PRs require those
  same checks and are never automatically merged.
- Repository governance (2026-10-01): required PRs, strict current-branch quality
  and fail-closed E2E checks from GitHub Actions, resolved conversations, linear
  history, no ruleset bypass, and no main/version-tag deletion or force pushes.
  Zero independent reviews is explicit for the single-owner repository.
- Actions accept only the three reviewed full-SHA action pins; tokens default to
  read-only, PR approval by Actions is disabled, checkout credentials are not
  persisted, and external fork workflow runs require maintainer approval.
  Production accepts only main; source guards reject stale or non-main releases.
  Credentials are available only to the final deployment step, after all gates.
  The credential relocation receipt and live control verification are in
  [docs/verification/github-ci-2026-10-01.md](docs/verification/github-ci-2026-10-01.md).
- The threat model in [docs/threat-model.md](docs/threat-model.md) lists the
  assets, trust boundaries, mitigations and accepted residual risks; the
  operational playbook (rollback, secret rotation, Time Travel restores,
  bans, share revocation) is in [docs/runbook.md](docs/runbook.md).

### Stripe billing candidate boundary

The unreleased backend verifies actual owning Stripe account/mode before
provider effects. Checkout/portal require a verified unbanned original payer
and recent server-owned credential proof, plus current owner membership when
the workspace exists. Pre-workspace financial recovery grants no content access. The exact
signed webhook POST is the sole new same-origin exception: raw bytes are bounded
to 64 KiB and verified with a five-minute signature window in both directions,
with foreign modes/Connect contexts refused. Durable event IDs, exclusive fenced
leases and atomic D1 reconciliation prevent replay or stale concurrent writes.
Actual invoice/payment/charge linkage is required before paid capacity; redirects
and writable metadata grant nothing. Active/pending chargeable billing fences
payer removal and deletion until provider-confirmed closure. The candidate self/
admin deletion path quiesces through a server-only marker in the existing banned
field before Better Auth removes credential rows; provider failure retains
credentials and restores only that exact marker, never a concurrent moderation
ban. Nullable historical ban state is compared and verified live before closure.
Provider-confirmed closed authority permits final deletion even across a later
webhook/cron lease; every financial acquire/commit requires a live bound owner,
and removed-owner events become ignored receipts. Security bans suspend paid access immediately, attempt background provider
closure and retain chargeable authority for existing cron retry. Delayed events
cannot grant or provision for a banned payer. Seventeen isolated actual D1 cases
passed; complete integrated/provider gates remain open. An outage may delay
remote cancellation. Failed removal retains paid suspension until explicit
provider reconciliation, which is covered by the recovery case. Content grants remain tenant
scoped and independent of payment/private admission. Complete gates and provider
sandbox/account verification remain pending; no billing production activation is
claimed. See `docs/plans/stripe-subscriptions.md`.

## Handling secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets are set with
`wrangler secret put`. `.dev.vars.example` lists every variable the Worker
reads. Never commit a real value; the pre-commit hook will reject known secret
shapes, but the hook is a safety net, not permission.

### Monthly ordinary-cloud admission candidate

The unreleased migration 0026 adds only workspace month/units and one dedicated
site month/units singleton. One current-role/share-authorized workspace update
and trigger-based site debit either succeed together or roll back together. UTC
rollover cannot erase the site aggregate through account/workspace replacement;
its direct deletion and INSERT OR REPLACE are refused. Immutable site-owner
schema/guards remain unchanged. Live role, verified admission, ban, paid expiry
and signed share tenant/photo/expiry/revocation are rechecked before mutation.
Existing explicit published shares are not implicitly revoked by creator bans.

Deletion, revocation, auth and financial closure remain governed by existing
authorization and stay usable when ordinary allowance is exhausted. Provisional
product quotas are not a complete invoice limit, per-actor fairness or net-profit
proof. Exempt/denied traffic, per-request CPU, unpaged/retained data and provider
costs still need independent bounds and policy. Isolated actual D1 proof passed
13 cases; combined security/release certification remains required. Public launch
and production payment flags remain closed. See
[the operation boundary](docs/plans/cloud-operations.md).

### Encoded upload metadata candidate

Unreleased stored PNG/JPEG/WebP admission derives MIME and encoded header
dimensions and reconciles genuine EXIF display orientation before digest/quota/R2.
Validated client claims must match those display dimensions. Photo/logo side
limits are 8,192; generated thumbnail longest side is 400. Existing actual byte
limits remain. This proves dimension-bearing headers, not full pixel decoding or
complete compressed-payload validity. Four actual Worker module cases and 91
selected Node cases pass; full multipart/hash/concurrent CPU/memory and final
combined gates remain required. Existing delayed-producer cleanup was separately
found insufficient; no physical-erasure claim follows from metadata validation.

### Conditional payload storage candidate

Existing fresh per-lease R2 keys now use conditional empty initialization and
mandatory ETag-matched payload writes. A null conditional write is a typed failure.
Actual pending lease identity/keys, expiry and current writer are rechecked before
payload; reservation itself also requires the current writer. Independent cleanup
deletion invalidates that ETag, preventing a late producer from recreating payload
after its recovery pointer has gone. No unconditional ObjectStore escape remains.

Actual isolated R2/D1 proof passes 37 cases, including a started stream paused
while marker deletion completes, then null write and final absence. Original
physical red is retained. Late empty initialization can leave only an opaque empty
key, and interruption tests simulate ordering rather than an actual isolate kill.
Extra initialization PUTs are part of cost accounting. Compact account cleanup
now stages proven sole-owner personal metadata/links in one atomic D1 batch,
retains its organization until durable physical recovery drains, and preserves
collaborative/ambiguous scopes plus financial/audit records. Malformed or foreign
reservation keys fail closed. Provider/staging failures retain credentials; lost
acknowledgement may leave already-staged metadata while the account remains.
The actual isolated D1/R2 pool passes 16 cases, including late producer absence.

Self-service controls retain server identity/origin/recent-proof/owner gates and
require explicit email confirmation. Confirmed deletion erases only this account's
local cache/outbox; other-account data remains. A generic root notice makes failed
device cleanup visible after login and retries only the captured account's local
erasure. Its acknowledgement is transient across reload. Actual desktop and
Arabic-phone built failure/retry flows pass axe and were visually reviewed. This
does not promise immediate all-byte erasure, downloaded/other-device/provider
copy deletion, an invoice cap or complete privacy/release certification. Full
combined gates, multipart/hash/concurrent-memory and retention/headroom policies
remain open.
