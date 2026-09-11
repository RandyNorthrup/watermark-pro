# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Entries record what happened, not
what was planned; superseded entries stay.

## [Unreleased]

### Added

- Direct canvas manipulation in both preset design and photo editing: click a
  mark to select it, drag to move it, use visible resize/rotate handles, pinch
  to scale, twist to rotate, and use the documented keyboard controls.
- Undo and redo inside the watermark designer, including visible controls,
  Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. A complete drag, resize, rotate,
  pinch or twist gesture forms one history step.
- Recently used fonts in the searchable 551-family picker. Recent choices and
  view preferences remain scoped to the signed-in account.
- A same-origin Microsoft OAuth response bridge for popup and silent-iframe
  flows. The Worker serves only the built bridge at the two exact OAuth paths,
  strips request credentials from the asset subrequest and applies no-store,
  frame and referrer protections.
- Official provider marks beside Google and Microsoft account actions, Google
  Drive, Dropbox and OneDrive file actions, connected accounts, and the GitHub
  source link. The unmodified assets and their usage sources are documented in
  `public/providers/README.md`.

### Changed

- Standard users now enter the Editor directly and no longer have a redundant
  dashboard. Owners and Admins retain a compact Overview. The workspace primary
  rail contains Library, Editor, Bulk, Video, Documents, Gallery and Shares;
  account, invitations, members and audit are reached from the account menu.
  Account routes use a contextual rail with a return to the workspace.
- Moved Recent work into the Library for presets and Gallery for photos, with
  thumbnail, list and details views on both pages. Moved offline synchronization
  state, counts and Sync now to the bottom of the desktop rail and phone menu.
- Administration now uses a contextual desktop sidebar and the phone's More
  sheet for Users, Organizations, Audit trail, Health and Client errors. The
  selected section is validated URL state, so direct links, reloads and browser
  history retain the destination; Users is the default section.
- Organized the account page into identity and global-role information alongside
  a separate sign-in-method panel, including connected providers and the existing
  account-linking actions.
- Rebuilt the public, authentication and application surfaces from the supplied
  liquid-glass reference with a visible rose/peach scene, translucent panels,
  stronger depth, floating desktop chrome and responsive fallbacks for reduced
  motion, reduced transparency and forced colors.
- Replaced the separate font search and native 551-item selector with one
  searchable, categorized dropdown. Font names and specimens render in their
  own faces; the clipped list supports wheel, touch and keyboard navigation.
  Replaced the QR-only checkbox filter with a pressed-state filter button.
- Rebuilt photo, video and PDF import panels with a clear drop target, a large
  primary file action, a separate folder action and a secondary provider row.
  Preset actions now sit in a grouped top-right toolbar instead of an unlabeled
  row under the description.
- Embedded the complete watermark designer in the Editor side panel, replacing
  the separate Create watermark dialog. Export, gallery and cloud destination
  actions now share one full-width action layout.
- Scheduled interactive previews one frame at a time with latest-input
  backpressure, discarded stale subject results and coalesced pointer movement.
  Mouse, touch, pen, pinch, twist, keyboard and control changes remain responsive
  while the rendering worker is busy.
- Global account roles are now **Owner**, **Admin** and **User**. Migration
  `0012_site_roles.sql` preserves the anchored owner, starts with zero admins,
  and makes every other existing account a user. Owners and admins can manage
  non-owner users; the owner cannot be removed, demoted, banned or altered by
  an admin. These roles remain separate from private-workspace roles.

### Fixed

- Corrected earlier documentation and UI that conflated the single site owner
  with an `admin` role and failed to distinguish global roles from workspace
  ownership.
- Preserved each photo's intrinsic aspect ratio in editor, designer and video
  previews when both viewport width and height constraints apply. Portrait and
  landscape photos no longer stretch to fill both limits.
- Kept font results clipped below their sticky search and section headers so
  scrolled names cannot show through or behind the selected-font area.
- Allowed preset-card titles and action toolbars to wrap on tablet widths instead
  of collapsing the description to zero width.
- Kept every workspace tool bound to the live, account-checked organization
  shown in the shell after creating or switching workspaces. Audit, Editor,
  Library, Gallery, Bulk, Video, Documents, Shares and preset pages can no
  longer keep reading the previous route-loader organization.

## [2.0.0] - 2026-09-10

M19 is the production-readiness release for Lumafoil. Source and local evidence
live under [docs/verification/m19](docs/verification/m19/); provider and domain
cutover outcomes are recorded separately because they occur after the tagged
candidate passes its hosted gates.

The owner directed the 2026-09-10 production launch while mobile Lighthouse
timing remained open. The guarded account split and `lumafoil.com` deployment
completed; functional, security and four-device gates passed. Interactive
provider journeys, Web Analytics disablement, final performance/screenshots and
the version tag remain explicit post-launch work.

### Added

- Private personal workspaces, separate site invitations, each user's unique
  rotatable invitation link, count-only referral attribution, and
  administrator-only aggregate account/invitation statistics. Workspace
  collaboration remains a separate explicit action.
- A per-user recent-work dashboard with thumbnail, list and details views,
  account-scoped preferences, real photo/preset previews and offline event replay.
  Access denial hides previously cached rows immediately.
- Database-anchored sole site administration, streaming request-size limits and
  atomic photo/logo/thumbnail storage reservations with durable cleanup recovery.
- Google and Microsoft account sign-in with invitation-gated new identities,
  explicit authenticated provider linking, email-ownership checks, encrypted
  provider tokens and no stored ID-token claims or external avatar URLs.
- A guarded migration for the original two unused accounts, plus an explicit
  empty-database owner bootstrap and a self-hosting guide. No public bootstrap
  endpoint or temporary production-signup bypass is provided.
- A private SQL replay preparation tool that verifies the recorded backup hash,
  refuses Git destinations and existing output, and orders table definitions,
  original data, then indexes/triggers. It executes no backup rows or remote
  commands. Actual isolated D1 restoration and account/workspace preservation
  were rehearsed separately before production changes.
- 500 additional open-licensed font families, bringing the library to **551
  distinct families**, and **400 Microsoft Fluent vector stickers** with search,
  categories, provenance, checksums and locally distributed licence notices.
- A saved-QR creation shortcut and filter. Named codes retain independent
  destinations; exported QR images have independent decoder regression checks.
- Durable account-scoped preset/photo/logo saves and an outbox, reconnect
  replay, visible pending/blocked/conflict states, explicit discard confirmation,
  and keep-both conflict recovery. Stable server identities make lost-response
  retries idempotent; preset updates detect concurrent changes.
- Explicit native cloud-link creation and revocation after Google Drive,
  Dropbox or OneDrive saves. Saving does not automatically publish files.
  Confirmed file identities and partial-batch outcomes are preserved.
- A complete Lumafoil brand kit with outlined wordmarks, approved rounded marks,
  provider/PWA icons, social assets, colours, typography, email signature and
  portable guide/archive. Real editor, QR and library captures and bundled-font/
  sticker specimens support the feature page.
- Bundled software license notices generated by Vite, plus a deterministic
  corresponding-source archive and explicit MPL source offer for the pinned
  Mediabunny video library.
- Support shared mailbox **support@lumafoil.com**, with direct sign-in blocked
  and access limited to the existing licensed owner. Inbound and Send As mail
  were received successfully; recipient checks passed SPF, DKIM and DMARC.
- Correlation IDs, bounded browser-error reports, scheduled database-health
  checks and administrator health/error views. Operational records retain the
  existing seven-day window; sensitive route/query values are redacted.

### Changed

- Private query restoration, account observers and offline admission now load
  only before an `/app` route is admitted. Public auth pages avoid that private
  startup work; same-document sign-in still installs it before rendering a
  workspace. Signed-in public language changes use a fresh exact-session fence
  and never restore workspace data to save the account preference.
- Core login, audit and invitation queries now load a four-schema validation
  leaf instead of initializing unrelated media and administration schemas.
  Desktop file-launch delivery, the bulk engine pool, mark resource catalogues,
  photo metadata parsing and PDF processing load only when their actual action
  needs them; account leases and early error reporting remain synchronous.
- Updated the exact compatible dependency pins for MSAL Browser, i18next,
  react-i18next, Lucide, Mediabunny, Testing Library user-event and
  chrome-launcher. TypeScript 7 and Vitest 5 remain held by the installed
  typed-ESLint and Cloudflare Workers test peer ranges.
- Recent work now uses a stable scrollable results panel, with compact horizontal
  thumbnails on phones and the full card grid on larger screens. This removes
  the large Tools-section shift without delaying the page or adding an empty
  placeholder. The first visible thumbnail is eager/high priority; later images
  remain lazy.
- Inter remains the interface and watermark font. The application shell keeps
  its normal stylesheet discovery so the font does not compete with private
  startup, while prerendered landing/legal documents preload the one built Inter
  file before their stylesheet. Linux evidence identified the public font swap
  as the layout-shift source; the targeted preload removes it.
- Commit hooks invoke the pinned formatter and linters through Node directly.
  Native Windows argument handling avoids repeated small command batches while
  retaining staged-only formatting, strict lint and publication checks. Isolated
  positive/negative proofs preserve partially staged and unstaged changes.
- Device verification now runs in four separate GitHub jobs with the existing
  required aggregate check. Release UI audits derive their parallel matrix from
  the shared page inventory, and tag deployment requires both code/device gates
  and UI audits. Local browser scheduling uses two workers after paired offline
  journeys passed under unchanged deadlines; all 104 device cases remain.
- Authenticated startup now uses one origin-checked `POST /api/me/bootstrap`
  response to seed the existing session, workspace-list, selected-workspace and
  role queries. Every account receives its private workspace; a valid selected
  collaboration remains selected. Revoked selections return to the workspace
  chooser without rendering stale content or looping through sign-in.
- Product identity is **Lumafoil**, with **lumafoil.com** as the sole planned
  production origin and no redirects from retired app domains. Provider
  registrations and mail settings were moved to the new identity; hosted
  cutover and provider-flow proof remain tracked release work.
- Replaced purple with **#C86B82** rose, stronger action contrast and warm neutral
  surfaces. The first generic serif landing was rejected and replaced with
  concrete illustrated feature explanations, following the owner's eZy
  reference. All twelve languages retain equivalent feature/access copy.
- Applied the supplied MIT-licensed liquid-glass reference to application panels,
  navigation and controls, with solid reduced-transparency/forced-color fallbacks.
  The approved landing composition remains; responsive picture variants reduce
  screenshot transfer and follow manual or system theme selection.
- The landing explicitly explains invitation-only hosted access and free
  GitHub source for self-hosting; the footer links to the actual repository.
  The owner chose the original rounded landing icon over the heavier
  intermediate OAuth mark; the kit and provider icons now follow that choice.
- Public landing markup is shared with a build-time renderer for all twelve
  locales. The earlier preview-dependent prerender procedure is superseded by
  a build that needs neither a running server nor account credentials.
- Earlier cache-first online account rendering is superseded by live identity
  checks and immediate account-boundary clearing. Offline display snapshots
  exclude session credentials; sign-out does not silently discard pending work.
- Offline caches use a complete byte-versioned static inventory and independent
  shell. Private URLs, invitation/share tokens and API responses are not public
  cache entries. Old static caches remain while another tab may still need them.
- Creative/media/cloud code loads at its use site. The earlier broad Radix/UI
  chunk group and eager MSAL import were removed. Bundle tooling measures actual
  surface dependencies; final budget and Lighthouse evidence remains required.

### Fixed

- Verified Google sign-in can recover an existing matching verified account
  whose provider rows were lost or never created, but only when that account has
  no sign-in method. Existing password/provider accounts still require explicit
  authenticated linking; unverified, mismatched, forged, replayed and uninvited
  identities remain refused.
- Administrator totals and Gallery filters/actions now retain their final
  geometry while real responses are pending. Loading, empty and failure states
  remain labelled; actions stay disabled until valid data exists. Held-response
  checks across desktop, iPhone, iPad and Android report no shift, overflow or
  axe violations.
- Library export and invitation referral controls now reserve their final
  layout while data loads, eliminating the measured desktop and phone shifts
  without enabling actions before valid data exists. The language chooser is a
  labelled nonmodal menu, so opening it no longer hides the page landmarks or
  headings from assistive technology.
- Filled preset designers now constrain grid tracks, font specimens and hidden
  radio inputs at phone and tablet widths. English and Arabic production-build
  checks keep every visible control inside the viewport and preserve keyboard
  selection with the matching native radio state.
- Lighthouse content checks wait a bounded interval for the final asynchronous
  heading and visible-image decode, while still rejecting wrong screens, broken
  images and decode timeouts. CI report JSON retains only
  finite benchmark, layout-path, rectangle and task-source diagnostics; page
  text, selectors and full URLs are omitted.
- Selecting an Insert detail token could let the closing menu return focus to
  its trigger after the designer restored the text caret. Selection now retains
  the insertion field; Escape dismissal still returns focus to the trigger.
- Bulk filename validation now exposes its composite token/example feedback
  through `aria-describedby` and reports the real invalid state. Device tests
  assert both the blank-pattern failure and valid-pattern negative control.
- Lighthouse previously closed its internally created tab before the rendered
  content assertion ran. The runner now supplies and owns the exact measured
  browser target until route, seeded-state and image decoding checks finish.
- WebKit's automation-level offline switch disabled service-worker cache delivery
  even when the complete cache was active. Offline browser journeys now sever a
  per-test loopback proxy, prove uncached traffic is blocked and cached assets
  remain readable, then reconnect the same origin. A one-operation transport
  fault drops only a real successful photo acknowledgement so replay and
  idempotency remain end-to-end checks. Production offline code is unchanged.
- GitHub's Ubuntu runner could not start the pinned audit browser under its
  namespace sandbox. The ephemeral runner now verifies the exact publisher
  sandbox helper by browser version and SHA-256 before installing that same file
  root-owned with its required mode. No sandbox is disabled and no developer
  machine is changed.
- Completed bulk and video results could expand the iPhone document by six and
  eight pixels. Their grids now use a zero-minimum flexible column and
  shrinkable cards. Replay of the captured pages shows no overflow or axe
  violations, with every control remaining within the viewport.
- Linux audit startup now retains the pinned Chromium build while allowing a
  verified existing root-owned sandbox helper. Startup failures are classified
  before profile cleanup; no operating-system permissions or global browser
  settings are changed.
- Folder import could mount after preset loading, after its mount-only setup
  effect had already run. The directory attribute is now attached when the
  actual input mounts. A loading-to-ready regression reproduced the missing
  attribute; normal photo input remains a separate control.
- The first populated Lighthouse run misclassified browser-local blob images as
  HTTP requests because they share the page's origin. Protocol checks now apply
  only to HTTP(S) traffic, while visible in-viewport images must already be
  complete and decode successfully. Audits use the real sample photograph and
  a normal thumbnail instead of a one-pixel photo fixture.
- PDF export assumed `OffscreenCanvas` existed and failed on the WebKit device
  profile. Rasterization now uses the existing canvas backend, including its DOM
  fallback. A real pixel test first reproduced the missing-capability failure
  and then passed without changing PDF page/content assertions.
- Empty or loading Recent work views constructed a date formatter before any
  dates were needed. Formatting now initializes on first use and reuses the
  locale's formatter across view changes; populated and locale-change tests
  preserve the actual displayed dates.
- Bulk CSV reports incorrectly marked every result as having no per-photo
  override. Reports now distinguish customized and ordinary rows; a regression
  test demonstrated the wrong output before the correction.
- Visual certification could overwrite distinct designer, crop, menu and
  administration captures. New and saved designers now have separate names,
  duplicate capture names fail, and a shared inventory covers every leaf route.
  Reset-password forms, matching-recipient collaboration invitations, language
  menus and bilingual share dialogs are included in the pending visual run.
- Lighthouse reports now use fixed surface names rather than fixture-token URLs.
  Real local accounts, invitations, presets, photos and view preferences prepare
  the audited states; rendered-content checks reject a successful HTTP response
  that displays the wrong page or missing fixture content.
- The browser gate now uses the supported Workers test harness with native
  service/asset dispatch and isolated D1/R2. Routing parity and cancellation
  checks precede adoption. Offline conflict verification now waits for the real
  service-worker lifecycle before asserting readiness, without increasing its
  timeout. The PDF test reader also handles pdf-lib's legitimate normalized
  content streams while retaining original-content and watermark-pixel checks.
- Delayed operating-system file reads could repopulate the launch buffer after
  an account change. Launch ownership is now captured before reading; explicit
  locks and newer launches invalidate older work. Trusted initial admission can
  preserve a new unowned launch, while mounted editor/bulk views receive later
  same-route launches. Editor metadata completion also checks account, request
  and mount lifetime before adopting a file.
- Automatic browser diagnostics could transmit private data embedded in raw
  error messages, rejection values or stack URLs. Reports now retain only fixed
  error classifications, own-asset code coordinates and known redacted route
  shapes. Direct API submissions are normalized again; full user-agent strings
  are no longer stored. Negative canary tests cover both transport and storage.
- A hosted Cloudflare probe disproved the assumption that disabling invocation
  logs removes sensitive request context from custom logs. Persistent Worker
  logs and traces are now disabled in the release configuration, with source
  and generated-output checks; sanitized application diagnostics remain.
  Query redaction alone does not remove bearer tokens embedded in paths.
- Better Auth per-request callbacks could consume an old account's response
  before the SDK's global response hooks ran. The shared account boundary now
  checks request callbacks, retry callbacks and session updates before adoption.
  Mismatched custom-API account headers receive a neutral denial rather than an
  internal authentication exception becoming a server error.
- Cancelling or unmounting video export while preparing a watermark could start
  a worker afterward. Cancellation now covers preparation and worker startup;
  synchronous worker-message failures clear pending work, and disposed clients
  reject new requests instead of hanging.
- A rejected Dropbox loader remained cached and prevented recovery after a
  network failure. Failed loader state and script elements are cleared so a
  later attempt can retry while concurrent requests still share one load.
- Retired the previously published Google Picker key, installed its restricted
  replacement as an encrypted Worker binding, and resolved the GitHub alert as
  revoked. Account OAuth credentials are also installed as encrypted bindings.
  Publication checks permit only the exact revoked historical finding and keep
  current source, index, build and private-value checks strict. Repository-local
  Gitleaks ignores cannot silently bypass the independent publication audit.
- A cached null or different active organization could leave onboarding stuck
  at “Your workspace”. Account/workspace refresh now rejects that stale state.
- Private media cache fallback could bypass a live authorization denial;
  in-flight responses and shared-file inboxes could survive account changes.
  Owner-generation checks, account-bound requests, scoped inboxes and explicit
  local-store cleanup close those paths.
- Native IndexedDB Blob persistence failed on the WebKit test host. Versioned
  byte buffers retain exact content and MIME type, reconstruct Blob values when
  read, and remain compatible with existing locally stored Blob entries.
- Button color interpolation briefly failed rendered contrast checks. Foreground
  and background now change together while shadow transitions remain.
- Delayed sign-out responses could redirect a new login or erase a newer
  account's local saves. Global `Clear-Site-Data` was replaced by serialized,
  account-scoped cleanup that rechecks the outbox transactionally; newly queued
  work survives for its original owner. HTTP session revocation and no-store
  responses remain enforced.
- Cached offline boot now distinguishes a real transport failure from a live
  authorization refusal even when the browser still reports being online.
  Structurally valid display snapshots remain available across long outages;
  online identity validation still precedes private rendering.
- The dependency-cycle gate found a lazy recent-work notification back edge;
  notification state now has an independent shared module. Generated temporary
  repo mirrors are excluded from lint and forbidden by publication checks.
- Earlier coverage exclusions incorrectly assumed browser code could not be
  instrumented. Actual V8 counters disproved that; canvas, cloud, PDF, locale
  and main-thread video modules are now included under unchanged coverage floors.
- Delayed URL-import bodies and cancelled dialogs could still deliver a file.
  Owner checks cover body completion and editor adoption; cancelled requests
  cannot populate a reopened dialog.
- Private photo/logo/shared-file HTTP responses now use **private, no-store**.
  Public analytics allowances inherited from the old host were removed.
- Fractional QR modules created seams that prevented an actual scan. Four-module
  quiet zones and integer-aligned module edges now pass independent decoding.
- Unsupported font weights persisted after a family change; selection now
  chooses a shipped weight atomically. Narrow editor/designer tabs now wrap
  instead of clipping labels.
- Dropbox PKCE now validates state, cancels on account change and times out.
  App-folder saves avoid an unnecessary nested folder. OneDrive creates its
  destination explicitly and uses conflict-safe uploads instead of silently
  overwriting same-named files.
- Manual themes now change semantic surfaces as well as component variants.
  Unavailable localStorage no longer prevents the system theme from applying.
- The invalid wildcard SharePoint CSP origin was removed; the valid existing
  subdomain source covers the required hosts.
- Pinned sharp **0.35.4** and the legacy esbuild-kit loader's esbuild **0.25.12**
  to remove the observed audit advisories, preserving release-age checks.
  Sharp raster tooling and jsQR decoder tests are direct development dependencies.
  Semgrep's launcher now resolves Windows Python user installs outside PATH.

## [1.10.0] - 2026-09-08

M18 (localisation): the whole interface is available in twelve languages,
including one right-to-left script, and follows the user's preference.

### Added

- **Twelve languages**: English, Spanish, German, French, Italian, Brazilian
  Portuguese, Dutch, Japanese, Korean, Simplified Chinese, Russian, and Arabic
  (right-to-left). A language picker in the header and on the signed-out pages
  applies a choice immediately, remembers it in the browser, and â€” when signed
  in â€” saves it to the account (a new `user.locale` column via a validated
  `PATCH /api/me`) so it follows the member across devices. Before a choice is
  made the app picks from the saved preference, then the browser's languages,
  then English; `<html lang>`/`dir` follow the locale.
- Every user-visible string now comes from the i18next catalogues under
  `src/client/locales/` (English is the typed source of truth; the eleven
  translations were produced and self-checked against a product-term glossary,
  with the plural forms each locale's `Intl.PluralRules` requires). Catalogues
  are code-split and loaded on demand.
- Right-to-left support: the client layout mirrors under `dir="rtl"` (Arabic). A
  one-off codemod (`scripts/logical-utilities.mjs`) rewrote physical Tailwind
  utilities to logical ones across the client (`ml`/`mr`â†’`ms`/`me`,
  `pl`/`pr`â†’`ps`/`pe`, `left`/`right`â†’`start`/`end`, `text-left`/`text-right`â†’
  `text-start`/`text-end`, `border-l`/`border-r`â†’`border-s`/`border-e`); a new
  ESLint rule (`watermark-rtl/no-physical-utilities`) keeps them from creeping
  back; and direction-implying icons (undo/redo, the folder and breadcrumb
  chevrons) flip with `rtl:-scale-x-100`. The editor overlays and the centred
  modals keep physical geometry on purpose (marked `physical: geometry`; see
  PLAN Â§9), since pointer/keyboard coordinates and `translate` are not mirrored
  by `dir`.

### Gates

- New: the `no-literal-string` ESLint gate (a hard-coded string in a component
  fails lint), a catalogue completeness test (every locale has English's keys,
  no empty values, placeholder and plural parity), and `i18n:check` (no dead or
  missing keys) â€” all part of `npm run quality`.

### Notes

- Date, number and file-size formatting still follow the browser default rather
  than the active locale, and error-message and email text stay English â€” a
  localisation follow-up (PLAN Â§4).

## [1.9.0] - 2026-09-07

M17 (video and PDF): the same presets, placement and contrast now go onto video
and onto every page of a PDF, both in the browser, from two new tools.

### Added

- **Video** tool (`/app/video`): drop one MP4, WebM or MOV (up to 2 GB, 600 s,
  3840 px) and watermark every frame with the chosen layers, keeping the audio.
  Runs entirely in a dedicated Web Worker with WebCodecs and `mediabunny`; picks
  the best codec the browser can encode and shows the output up front ("Saves as
  MP4 (H.264)"). Quality is a bitrate ladder (Low/Standard/High) and the output
  fits Original, 1080p or 720p. Audio is copied when it fits the container, else
  re-encoded at 128 kbit/s. Progress shows a frame count and ETA, with Cancel.
  Over-limit files are refused before any frame is decoded. Nothing is uploaded;
  the gallery does not store videos. Browsers without a WebCodecs `VideoEncoder`
  see an unsupported message.
- **Documents** tool (`/app/documents`): watermark every page of up to 50 PDFs
  (â‰¤ 50 MB, â‰¤ 200 pages each) with `pdf-lib`. The layers are rasterised once per
  distinct page size at 150 dpi and drawn on every page; smart placement falls
  back to a bottom-right anchor on the blank page. Output is
  `<name>-watermarked.pdf` (a ZIP for several), the Info dictionary kept with
  `Producer` set to "Watermark Pro". Encrypted PDFs are refused. Runs in the
  browser; nothing is uploaded.

### Changed

- The bulk and documents tools share one preset checklist (`PresetChecklist` +
  `selectedSpecs`).
- `mediabunny` (video) and `pdf-lib` (documents) each load in their own route
  chunk, so no other page carries them.

## [1.8.2] - 2026-09-07

M16 (cloud read **and** write): save watermarked photos straight back to Google
Drive, Dropbox, and OneDrive, and make the whole cloud feature work for every
user (not just the owner). This completes "read and write to cloud storage".

### Added

- **Save to cloud** from the editor (the export panel gains a "Save to Google
  Drive / Dropbox / OneDrive" button next to Download) and from the bulk tool
  (a "Save to <provider>" button after a batch finishes). Each writes the
  watermarked photos into a "Watermark Pro" folder in the user's account,
  created if missing. Google uses the same `drive.file` sign-in as the picker;
  Dropbox signs in with a browser PKCE flow; OneDrive uses Microsoft Graph.

### Changed

- The Google OAuth app is **published to production**, so any Google account can
  use Drive import and save (no verification â€” `drive.file` is non-sensitive).
- The OneDrive app was **re-registered on the correct Microsoft account** and now
  requests `Files.ReadWrite` (read for the picker, write for save).
- Dropbox gained `files.content.write` and a PKCE redirect for the save flow.
- CSP `connect-src` gains the write endpoints (`api.dropboxapi.com`,
  `content.dropboxapi.com`, and the OneDrive upload hosts). See `public/_headers`.

### Fixed

- The `adjustPixels` 12-megapixel timing guard flaked on a saturated CI runner
  (6220 ms against a 6000 ms ceiling; real cost is ~250â€“450 ms). Its headroom is
  raised to ~48x the real cost so a genuine large regression still trips it
  without flaking under gate contention. See PLAN.md Â§9.
- The accept-invitation end-to-end navigations wait for the navigation to commit
  rather than the full `load` event, which WebKit (iPhone/iPad) aborts while the
  router resolves the route on the client â€” Playwright reported that abort as
  "Frame load interrupted". The rendered-page assertions are unchanged. See
  PLAN.md Â§9.
- The D1 rate-limit test no longer pins the throttle to the exact `(max + 1)`th
  attempt. Cloudflare's Rate Limiting binding is approximate, so the test asserts
  the 429 engages within a small margin while still proving every pre-throttle
  attempt is a 401 (never a success). See PLAN.md Â§9.

## [1.8.1] - 2026-09-07

M16 (cloud pickers): import photos straight from Google Drive, Dropbox, and
OneDrive â€” the follow-up the 1.8.0 notes held for vendor app registration. The
three OAuth applications are now registered in the owner's accounts, and each
button appears only where its keys are configured.

### Added

- **Import from Google Drive**: opens the Google Picker after a one-tap Google
  sign-in for the narrow, per-file `drive.file` scope; chosen images download
  through the Drive API and drop into the editor or bulk tool.
- **Import from Dropbox**: opens the Dropbox Chooser; selected images are
  fetched from their temporary direct links.
- **Import from OneDrive**: sign in with Microsoft, then browse your OneDrive
  in a small in-app dialog (folders navigate with a breadcrumb, images
  multi-select) and add the ones you pick. Uses Microsoft Graph with a
  `Files.Read` token; the MSAL sign-in library is bundled, not loaded from a CDN.
- The cloud buttons show up in both the editor (loads the first photo) and the
  bulk tool (loads all selected), next to "Take photo" and "From a link", and
  only for the providers this deployment has configured.

### Changed

- The public config (`GET /api/config`) now also carries the cloud-import
  picker identifiers (all public, non-secret client keys); the browser uses them
  to decide which import buttons to show.
- Content-Security-Policy gains the picker vendor origins (Google, Dropbox,
  Microsoft) for their SDKs and downloads, and `Cross-Origin-Opener-Policy` is
  relaxed to `same-origin-allow-popups` so the pickers' sign-in popups can hand
  their result back. See `public/_headers` and PLAN.md Â§9.

### Notes

- The Google app is in testing mode, so its Picker is available to the owner and
  designated test users; general availability needs publishing the app (no
  Google review is required because `drive.file` is a non-sensitive scope).

## [1.8.0] - 2026-09-07

M16 (autonomous phase): more ways to get a photo into the app. The cloud
pickers (Google Drive, OneDrive, Dropbox) are held for a follow-up because they
need vendor app registrations in the owner's accounts.

### Added

- **Import from a URL**: paste a link in the editor or bulk tool and the Worker
  fetches the image on your behalf, under an SSRF policy â€” https only, no
  credentials in the link, no IP-literal or internal hosts, every redirect hop
  re-checked, a size cap enforced by both the declared length and the streamed
  bytes, the type sniffed from the bytes, a 15 s timeout and a dedicated
  per-address rate limit. Gated by the upload permission and audited by host.
- **Camera capture** on phones: a "Take photo" button (shown only on
  coarse-pointer devices) opens the OS camera through the file input's
  `capture` attribute â€” no `getUserMedia`, no camera permission prompt.
- **Web Share Target** (Android): share photos from any app into Watermark Pro;
  a single-purpose service worker (scoped to `/share-target`) stashes them and
  the bulk tool picks them up.
- **Desktop file handling** (installed PWA): open image files with the app; one
  goes to the editor, several to the bulk tool.
- **/privacy** and **/terms** pages, generated honestly from the project's
  data-handling facts, linked from the landing footer.

### Notes

- The SSRF policy (`src/worker/url-policy.ts`) and the import route are covered
  by Node tests against a mocked upstream plus a workerd test of the real
  rate-limit binding; four red drills guard the policy, the redirect re-check,
  the streamed size cap and the byte sniff.
- **Deferred to a follow-up (needs the owner):** the Google Drive, OneDrive and
  Dropbox pickers require registering an application in each vendor's account.
  Those credentials, the vendor SDK loads and the picker CSP origins are not in
  this release.

## [1.7.0] - 2026-09-07

M15: preset files, logo tools and an invisible mark.

### Added

- **Preset files**: export any or all presets to a portable `.wmp.json` bundle
  (logos embedded) and import them back, with a name-collision check that
  renames rather than overwrites. Round-trips through the same Zod schema the
  app validates presets with.
- **Logo prepare tools**: when a logo is chosen, a "Prepare" step can remove a
  flat background (corner-seeded flood with an adjustable tolerance and a
  one-pixel feather) and trim transparent margins, then uploads a clean PNG.
- **Invisible mark**: the editor and the bulk tool can hide a short message in
  the pixels of a PNG export (LSB steganography along a seeded walk, protected
  by a CRC). It is PNG-only â€” a lossy re-encode is refused â€” and defaults to the
  workspace name. A new **/app/verify** page and a gallery "Check a photo"
  entry read the message back (or report that a photo carries no mark).

### Notes

- The steganography, background-removal, preset-file and read-back logic are
  pure modules unit-tested in jsdom; the canvas decode/encode wrappers
  (`read-invisible.ts`, the logo-prepare panel) are browser-only and covered by
  their callers, excluded from coverage like `engine/render.ts` (PLAN.md Â§9).
- New red drills: an invisible mark written into a lossy JPEG, a corrupted
  payload read as valid, a preset spec imported without validation, and a
  background removal that ignores its tolerance.

## [1.6.1] - 2026-09-07

M14 (completion): the two carried-forward bulk features now ship.

### Added

- **Per-photo override**: an "Adjust" button on any bulk row opens that photo
  in the full editor (embedded, without its own export step). "Apply to this
  photo" re-runs just that job with the override; "Apply to all photos"
  reuses the same edits across the batch; "Remove override" restores the batch
  settings. A row with an override wears a "Custom" badge.
- **Watch a folder**: pick an input and an output folder (File System Access
  API, desktop only) and new photos dropped into the input are watermarked
  with the ticked presets and written to the output while the page stays open.
  Absent the API (e.g. mobile) the panel does not render.

### Notes

- The override decision (which marks, transform and output size a job uses) is
  factored into pure helpers (`marksForJob`, `transformForJob`,
  `outputSizeForJob`) unit-tested in jsdom; the watch scanner (`scanDirectory`,
  `diffScans`, `writeOutput`) is tested against in-memory fake handles, and the
  `WatchFolder` component is driven in jsdom with a stubbed directory picker.
- New red drills cover both features: batch presets drawn despite an override,
  an adjust that skips its re-run, and a watch that reprocesses seen files.
- The local dev/preview origin moved from `http://localhost:5173` to
  `http://localhost:5273` (the `APP_URL` same-origin guard, both npm scripts
  and the e2e preview move together) so it no longer collides with another
  local project that holds 5173. Production is unaffected.

## [1.6.0] - 2026-09-07

M14: bulk power â€” folders, output-name patterns, pause/resume, and a batch report.

### Added

- The bulk tool accepts **folders**: an "Add a folder" button (where the
  browser supports it) and folder drag-and-drop, with the tree preserved in
  the ZIP (each output keeps its source sub-folder). Non-image files are
  skipped and counted.
- An output **file-name pattern** with a live example and the tokens `{name}`,
  `{index}` (zero-padded to the batch's digit count), `{count}`, `{date}`,
  `{preset}`, `{width}` and `{height}`. Unsafe characters become hyphens and
  an empty result is refused. Duplicate names still get ` (2)` in the ZIP.
- **Pause and resume** a running batch: pausing lets the jobs already running
  finish and stops starting new ones.
- A **batch report** (CSV, "Download report") with one row per job â€” source,
  path, output, status, size, duration, error and presets â€” with proper CSV
  escaping.
- The photo list is capped at 60 rows with a "Show all" control, so a
  500-photo batch stays responsive.

### Changed

- The bulk job input is now typed (`file`, `relativePath`, `metadata`) and
  each photo's EXIF is read in a small concurrent pool when files are added.

### Notes

- **Carried forward** (recorded in PLAN.md M14): the per-photo **override**
  (opening one photo of a batch in the embedded editor) and the Chromium
  **watch-folder** mode. The queue's `rerun` and per-job re-processing are
  built and tested, ready for the override UI; the folder scanner, name
  patterns, pause and report ship now. The watch folder is a bonus no
  competitor offers, so it is not a parity gap.
- Per-milestone certification runs `npm run quality`, semgrep and the red
  drill; e2e, Lighthouse and screenshots are deferred to M19.

## [1.5.0] - 2026-09-07

M13: photo metadata â€” EXIF tokens, a keep/strip export policy, and preserved DPI.

### Added

- Text marks can print camera metadata through new tokens: `{taken}`,
  `{camera}`, `{lens}`, `{iso}`, `{aperture}`, `{shutter}`, `{focal}`,
  `{location}` (GPS), plus `{index}`, `{count}`, `{width}` and `{height}`.
  `{date}` and `{time}` now prefer the capture date when the photo has one.
  An "Insert detail" menu in the designer inserts a token at the caret. When a
  token has no value it is removed and any separator it left behind is tidied
  (`{camera} Â· {lens}` with no lens becomes `Canon EOS R6`).
- An export **Metadata** policy in the editor's Export tab and the bulk output
  settings: **Strip** (default â€” no camera data, no location), **Keep except
  location** (camera, lens and capture time stay; GPS removed) and **Keep
  everything**. WebP is always stripped (its keep modes are disabled with a
  note). In both keep modes the Orientation tag is reset to 1 (the pixels are
  already upright) and the pixel-dimension tags are rewritten to the output
  size; GPS is emptied for keep-except-location.
- Print density (DPI) is preserved on JPEG (JFIF APP0) and PNG (`pHYs`)
  regardless of policy â€” it is not personal.
- Metadata is read in the browser with `exifr` (never uploaded); the raw
  Exif/XMP/density bytes are written back by our own byte code
  (`src/client/engine/metadata/`). Untrusted input never throws: a fuzz test
  runs 400 random mutations of a fixture through the scanners.

### Security

- The default export policy stays **strip**. Keep modes are an explicit
  per-export choice, GPS is named in the "keep everything" option, and
  `{location}` is opt-in by typing the token. GPS removal in
  keep-except-location is proven by test and by a red drill.

### Notes

- `exifr` 7.1.3 added (MIT, no dependencies). Icon search, the editor Shuffle
  button and the "Any character" input from M12 remain carried forward.
- Per-milestone certification runs `npm run quality`, semgrep and the red
  drill; e2e, Lighthouse and screenshots are deferred to M19.

## [1.4.0] - 2026-09-07

M12: richer marks â€” text effects, shapes, frames and random placement.

### Added

- Text marks gain a Text tab with **letter spacing** (âˆ’10% to +100% of the
  font size), a **curve** slider (âˆ’100% to +100%) that bends the line into an
  arc, and four **paint effects** â€” Solid, Outline, Emboss and Engrave.
  Spacing is measured per grapheme cluster (`Intl.Segmenter`), so emoji and
  combining marks space correctly.
- A new **Shape** mark kind: rectangle, rounded rectangle, ellipse or line,
  with an aspect/length slider, an optional fill (colour and opacity) and a
  stroke (width and an optional custom colour; otherwise the auto-contrast
  ink).
- A **Frame** control in the editor's Adjust tab and the bulk tool's Photo
  adjustments: a solid border of a chosen width (up to 10% of the shorter
  side) and colour is drawn around the photo, and every mark's placement is
  offset by the border so anchors stay correct.
- A **Random** placement mode: each photo gets a per-file pseudo-random anchor
  and jitter, seeded from the file's name, size and modified time
  (`src/client/engine/random.ts`), so a batch and its preview reproduce the
  same layout.
- An **Emoji** group in the symbol picker (96 glyphs) drawn with the platform
  colour-emoji font; the ink only tints their outline and shadow.

### Changed

- `DEFAULT_TEXT_SPEC` and `DEFAULT_SHAPE_SPEC` are now typed as their narrowed
  spec members (`TextSpec`, `ShapeSpec`), removing defensive `kind ===` guards.
- `hashString` (placement seed) now hashes UTF-8 bytes (canonical FNV-1a),
  removing an unreachable branch.

### Notes

- Per-milestone certification for M12â€“M18 runs `npm run quality`, semgrep and
  the red-drill suite; e2e, Lighthouse and screenshots are deferred to M19.

## [1.3.0] - 2026-09-07

M11: photo adjustments and orientation.

### Added

- Orientation in the editor's Crop tab: rotate left and right in quarter
  turns, flip horizontally and vertically, and a straighten slider (âˆ’45Â° to
  +45Â°) that auto-crops the tilt to the largest rectangle of the original
  aspect, so an export never has empty corners.
- An Adjust tab with brightness, contrast, saturation, warmth, sepia and
  vignette sliders (each with a reset) and eight one-tap filters â€” Original,
  Mono, Sepia, Vivid, Warm, Cool, Fade and Noir â€” previewed as thumbnails of
  the current photo. A mark's auto contrast is computed from the adjusted
  pixels, so ink stays legible after a darkening filter.
- The bulk tool gains a "Photo adjustments" section: one rotation, flip and
  filter applied to every photo in the batch.
- Adjustments run as pure pixel maths in the engine (`src/client/engine/adjust.ts`):
  brightness and contrast fold into a lookup table, saturation, warmth and
  sepia into one colour matrix, and vignette is spatial. A 12-megapixel
  frame is adjusted well within a 250 ms budget (browser test logs the time).
- The engine's orientation geometry (`src/client/engine/orient.ts`) maps the
  oriented, straightened output frame back onto the source with a single
  affine, so crop, resize and adjustments compose in one draw.

### Documentation

- Specifications for milestones M11â€“M19 under `docs/plans/` (photo
  adjustments, mark engine extensions, metadata, bulk power, preset files
  and logo tools, import surfaces, video and PDF, localisation,
  performance), with an agent runbook, and their entries and open questions
  in `PLAN.md`.

## [1.2.0] - 2026-09-06

M10: parity with the market. Everything `docs/competitor-research.md` found
missing against eZy Watermark and its peers, except pricing: the product
stays free.

### Added

- Ink colour: a third contrast mode beside Auto and Light/Dark takes any
  `#rrggbb` colour from a native colour input; the outline, shadow and box
  take the tone opposite to the ink's own luminance so readability rules
  still hold.
- Multi-line text marks (up to four lines) and an optional box behind text
  and symbol marks ("Box behind the mark", with its own opacity). Placement
  measures the whole block.
- Several marks per photo: the editor holds up to eight layers, each a
  preset with its own placement and style; the list under the preset picker
  chooses the layer the handles and panels edit, later layers paint over
  earlier ones, and export, save, share and undo cover all of them. The
  engine takes an ordered list of marks and reports placement and contrast
  for each. Bulk applies several presets in the order ticked.
- Snap to grid while dragging: the mark's centre snaps to the margin lines,
  the thirds and the centre within 8 px, guides are drawn while snapped, and
  Alt (Option) frees the drag.
- Share sheet: the editor's export panel and every finished bulk file offer
  Share where the browser can share files (`navigator.canShare`), so an
  iPhone gets "Save Image" and the social apps; download stays.
- Drawn signature: a pad in the designer's logo section (four pen widths,
  undo, clear) that saves the strokes as a transparent PNG logo at 1024 px
  through the existing asset route and selects it for the preset.
- Date, time and file-name stamps: text marks accept `{date}`, `{time}` and
  `{filename}`, resolved per photo from the file's last-modified time and
  name in the designer preview, the editor and bulk.
- QR-code marks: a fourth mark kind, up to 512 characters, drawn from the
  module matrix of `qrcode-generator` 2.0.4 (MIT, no dependencies) as dark
  modules on a light field with a quiet zone, whatever the background.
- Metadata policy: exports are re-encoded from pixels and carry no EXIF (no
  GPS, camera or capture time); the orientation tag is applied to the
  pixels first. A browser test feeds a JPEG with a hand-built Exif segment
  through the bulk processor and checks the output. Documented in README,
  SECURITY.md and the threat model.
- Ten red drills for the new behaviour (layers, colour, line breaks, box,
  QR field, tokens, snap, share capability, signature padding, bulk preset
  order), each seen red before the full drill.

### Changed

- The editor's preset select reads "Add another preset" once a layer is
  present; "Revert" restores the active layer's preset.
- The designer's Text field is a textarea; extra line breaks beyond the
  fourth are folded into the last line.
- `PLATFORM_ADMIN_ROLE` moved to `src/shared/constants.ts`, where both the
  Worker and the client read it.
- Pre-commit: lint-staged runs with `--max-arg-length=4000`; its Windows
  default overflowed cmd.exe on a milestone-sized commit. Generated drill
  reports are excluded from Prettier, and Vitest's failed-test screenshots
  from git.
- CI runs Playwright with two workers (the hosted runner has two cores; four
  browsers on it timed out) and uploads `test-results/` (traces, screenshots
  and page snapshots) when the end-to-end job fails; the GitHub reporter
  writes no HTML report, so the old upload never had anything to upload.

### Fixed

- The library page (and the dashboard, landing and placement grids) could
  grow wider than a phone: an implicit `auto` grid column takes a card's
  min-content width, and a long preset description pushed the page 86 px
  past a Pixel 7, putting the tab bar off-screen. Every responsive grid now
  has an explicit single base column, and the end-to-end suite asserts on
  every page that nothing scrolls sideways.
- The editor and designer requested their first-paint image (the sample
  scene) only after the session and organization fetches; routes now declare
  it and boot preloads it for the matched URL. Mobile Lighthouse: editor 81
  to 85, designer 83 to 86, both within the budget.
- The bulk page test ticked one preset, so a batch that dropped every preset
  but the first would have passed it; found by the red drill, the test now
  ticks two in reverse order and checks the order the runtime receives.
- The bulk end-to-end fixture's two-line stamp had lost its line break to
  the shell that wrote it.
- Red drill runner: strips terminal colour codes before matching a runner's
  failure line (tsc colours its output even with `FORCE_COLOR=0`, which hid
  its "error TS" line), stamps reports with the local date instead of UTC,
  and the main-thread engine drill follows the shared bitmap release helper.

## [1.1.0] - 2026-09-06

M9: mobile and Safari certification, red drill.

### Added

- Phone layout for the signed-in app: a compact top bar (menu, brand, theme,
  account), a bottom tab bar with Library, Editor, Bulk and Gallery, and a
  "Menu" sheet with the organization switcher and every other destination.
  Safe-area insets on the header, tab bar and sheet; `scroll-padding` keeps
  focused fields and tapped tabs clear of both bars; `viewport-fit=cover`,
  theme-colour metas that follow the applied theme, an apple-touch-icon and
  a web manifest for "Add to Home Screen".
- Editor touch gestures: two fingers on the mark pinch to resize, twist to
  rotate and slide to move; mark and crop handles keep a 44 px hit area on
  coarse pointers. Synthetic multi-pointer tests cover the gesture.
- Main-thread rendering path: the engine draws through a `CanvasBackend`
  (`OffscreenCanvas` in the worker, `HTMLCanvasElement` on the page) and
  `LocalEngine` runs the same pipeline on the calling thread where workers
  cannot draw (Safari before 16.4, Playwright's Windows WebKit). Chosen by
  capability detection, loaded on demand, covered by browser tests.
- Playwright projects `iphone` (iPhone 14, WebKit), `ipad` (iPad Mini,
  WebKit) and `android` (Pixel 7, Chromium) beside `desktop-chrome`; every
  journey runs on all four with axe on every page. `navigateTo` and
  `expectNoNavLink` helpers drive whichever navigation the layout shows; a
  per-test client address fixture keeps the four projects out of one
  credential-limit bucket.
- `POST /api/dev/promote`: the console-provider-only platform-admin
  promotion the end-to-end suite and audit scripts use instead of
  `wrangler d1 execute --local`, which crashed Miniflare when four journeys
  ran it concurrently against the serving database. 404 in any other
  configuration; tested in Node and against real D1.
- The red drill: `npm run test:drill` applies every mutation in
  `scripts/red-drills.mjs` (RBAC, CSRF, rate limits, share tokens, uploads,
  configuration, cookies, placement, contrast, crop analysis, engine
  ownership, capability switch, undo, pinch, thumbnails, theme, shell, four
  gates, two end-to-end journeys), runs the test or gate that owns each,
  restores the file and fails on survivors. Its first run found three:
  viewers updating presets, JSON requests from a foreign origin, and the
  photo count quota had no failing test; all three now have one.
- `scripts/lighthouse.mjs <milestone> mobile`: Lighthouse's phone emulation
  with its own budgets (PLAN.md Â§5.5), audited through a brotli proxy
  (`scripts/lib/compressing-proxy.mjs`) because the preview serves
  uncompressed bytes and production does not; median of three runs per page.
- `scripts/screenshots.mjs <milestone> [desktop|phone|tablet|all]`: the
  visual record at 1440Ã—900, on an iPhone 14 and on an iPad Mini (WebKit).
- Dashboard tool cards; a sample-scene placeholder so the editor and
  designer paint the photo with the page instead of a spinner; a
  metric-matched fallback face for Inter so the font swap moves nothing.
- `docs/competitor-research.md`: feature matrix for eZy Watermark,
  Watermarkly, Visual Watermark, iWatermark+, uMark and three Android apps,
  the input to the M10 parity plan.

### Changed

- CSP no longer sets `upgrade-insecure-requests`: HSTS and source lists of
  `'self'` and explicit https origins already forbid http subresources, and
  WebKit applies the directive to plain-http localhost, which made the app
  unrenderable in Safari-engine tests.
- Build: the UI primitives and every icon in use are one `ui` chunk instead
  of thirty 1 kB files; the authenticated layout stays in the entry chunk;
  matched route chunks download alongside the session check; the active
  organization is requested alongside the organization list.
- `PLATFORM_ADMIN_ROLE` lives in `src/shared/constants.ts` (it was defined
  twice); `OrganizationStore` gains a `UserStore` sibling.
- Landing page: no "early access" badge, honest security copy, wrapping
  header at phone widths.
- Playwright: 60 s test timeout, 10 s expect timeout, at most four workers.
  Vitest page tests: 20 s timeout and a 4 s Testing Library async budget,
  because the whole suite under coverage on a busy workstation timed out at
  five seconds while every test passed alone.

### Fixed

- Safari: the app rendered nothing against the local preview (see CSP
  above) and the engine threw `Can't find variable: OffscreenCanvas` where
  that constructor is missing.
- The phone header overflowed sideways with nine icon links; the audit and
  organization tables were scroll regions without keyboard access; the
  gallery lightbox squeezed its title to nothing beside four buttons; the
  library card's title link overflowed its heading on an iPad; the designer
  kept showing the previous mark's frame after switching to a logo mark
  without a logo.
- The dashboard still carried the M1 "what is next" roadmap copy.
- `env.ts` refused a half-configured Turnstile but nothing tested it; now
  `env.test.ts` does.

## [1.0.1] - 2026-09-06

### Changed

- Turnstile is enabled in production: the `watermark-pro` widget (managed
  mode) protects sign-up and password reset at `watermark.blowmoney.net`.
  Verified live: sign-up without a token answers 400, with a bad token 403,
  reset without a token 400, sign-in untouched.
- `main` is protected by a GitHub ruleset: the three CI checks must pass,
  no force pushes, no deletion; repository admins may bypass.
- Runbook: the enable/disable order for Turnstile and the short
  `invalid_configuration` window between `secret put` and the deploy.
- Tag-driven deploys are live: with `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` in the repository secrets, the v1.0.1 Deploy
  workflow ran gates, migrations, deploy and the smoke check successfully.
- CSP allows Cloudflare's Web Analytics beacon (`static.cloudflareinsights.com`,
  `cloudflareinsights.com`), which the `blowmoney.net` zone injects into every
  HTML response and the policy had been blocking with a console error on
  every page. Documented as a zone-level choice in PLAN.md Â§9.

## [1.0.0] - 2026-09-06

Milestone M8: enterprise hardening and release. First stable release.

### Added

- Platform administration at `/app/admin` for users with the Better Auth
  `admin` role: search users by email, ban and unban with a mandatory reason
  (sessions revoked, sign-in refused), grant or remove the platform role,
  sign a user out everywhere, list every organization with member, photo and
  storage counts, and browse the global audit trail. Worker routes
  `GET /api/admin/organizations` and `GET /api/admin/audit` behind
  `requirePlatformAdmin`; Better Auth's admin plugin handles user management
  and every admin action is written to the audit log (`admin.user_banned`,
  `admin.user_unbanned`, `admin.role_set`, `admin.user_removed`,
  `admin.sessions_revoked`).
- Optional Cloudflare Turnstile on sign-up and password reset: when
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set the forms render the
  widget, hold their submit until it produces a token, and the Worker verifies
  the `x-captcha-response` header with Cloudflare before Better Auth runs.
  `GET /api/config` publishes the site key; the CSP allows
  `https://challenges.cloudflare.com` for scripts and frames.
- Tag-driven production deploys: `.github/workflows/deploy.yml` runs the
  quality chain and the Playwright suite on a `v*` tag, then `npm run deploy`
  in the `production` GitHub environment. GitHub dependency review on pull
  requests fails on high-severity advisories and disallowed licences. Both
  workflows share a composite action for Node, gitleaks and `npm ci`.
- `docs/threat-model.md` (assets, trust boundaries, STRIDE mitigations with
  the tests that prove them, accepted residual risks) and `docs/runbook.md`
  (deploy, rollback, secrets and rotation, logs, D1 Time Travel, R2, first
  admin promotion, incident playbook, rate limits).
- End-to-end admin journey (`e2e/admin.spec.ts`) and Lighthouse and
  screenshot coverage of the admin console; the audit scripts promote their
  throwaway user through `wrangler d1 execute --local`, the same operation
  the runbook prescribes.

### Fixed

- The admin organization overview counted members through Better Auth's
  adapter, whose `findMany` stops at 100 rows, so tenants created after the
  hundredth member showed zero members. Counts now come from a grouped D1
  query (`OrganizationStore.listSummaries`), proven in workerd.
- The "not a platform administrator" refusal on `/app/admin` rendered
  without a page heading (axe `page-has-heading-one`); the heading now
  precedes the refusal.
- `src/client/routeTree.gen.ts` is committed (it was git-ignored), because
  ESLint and `tsc` run before the build in the quality chain and a fresh
  checkout had no route tree; CI verifies the committed copy matches the
  build's output.
- `npm run cf-typegen` now passes `--env-file .env.example`, so the
  committed Worker types no longer depend on the secrets in a developer's
  `.dev.vars`; the CI typegen check had failed on the first GitHub run for
  that reason.

## [0.8.0] - 2026-09-06

Milestone M7: sharing.

### Added

- Share links: publish selected gallery photos (or one photo from the
  lightbox) under a signed, expiring (1, 7, 30 days or never), revocable
  link. Table `share` (migration `0003_shares.sql`), routes under
  `/api/orgs/:orgId/shares` behind the `share` permission, and public routes
  under `/api/share/:token` that carry no session, are rate limited per
  address, serve only the photos in the link, and refuse expired, revoked
  and tampered tokens with one neutral 404.
- Share dialog with Copy link and Shareâ€¦ (the platform share sheet through
  the Web Share API, clipboard fallback); `/app/shares` to review, copy,
  share and revoke links; the public `/share/:token` album page with a
  lightbox, downloads and a "Share this link" button.
- Audit entries `share.created` and `share.revoked`.

### Fixed

- `npm run deploy` runs the migration step non-interactively and refuses to
  deploy while remote migrations are pending; previously a closed stdin could
  skip the migration and deploy the Worker ahead of its schema.

## [0.7.0] - 2026-09-06

Milestone M6: storage and gallery.

### Added

- Stored photos: D1 table `photo` (migration `0002_photos.sql`) and routes
  under `/api/orgs/:orgId/photos` for listing (newest first, cursor pages of
  60, preset filter, name search), usage, upload, file and thumbnail
  streaming, and bulk delete of up to 200 photos, all behind the `photo`
  permission and recorded in the audit log.
- Upload limits: 40 MB per photo, 1 MB per thumbnail, 10 000 photos and 2 GB
  per organization, PNG/JPEG/WebP by file signature.
- `/app/gallery`: storage usage bar, search, preset filter, thumbnail grid
  with "Load more", multi-select with confirmed bulk delete, and a lightbox
  with download and delete.
- "Save to gallery" in the editor and "Save n to gallery" after a bulk run;
  thumbnails are built in the browser.

### Changed

- Photos remember the preset's name after the preset is deleted.

## [0.6.0] - 2026-09-06

Milestone M5: bulk processing and export.

### Added

- `/app/bulk`: apply a library preset to up to 500 photos at once. Photos
  are decoded in the browser and rendered in parallel by a pool of engine
  workers sized to the machine; smart placement and auto contrast are
  computed for every photo separately.
- Progress bar with a live summary and throughput, per-file status, error
  message and download, Cancel (finished results are kept), Retry for
  failed or cancelled photos, and Clear.
- Output as PNG, JPEG or WebP with a quality slider and an optional
  fit-to-long-edge resize (1080, 2048 or 4096 px).
- "Download n as ZIP": a streaming, stored ZIP built with fflate.
- Bulk throughput measurement in `docs/benchmarks.md`.

### Changed

- Font, icon and logo resolution for a spec lives in `MarkResources`, shared
  by the designer preview, the editor and the bulk tool.

## [0.5.0] - 2026-09-06

Milestone M4: editor.

### Added

- `/app/editor`: watermark one photo with a library preset, then adjust the
  preset for that photo only (placement, contrast, opacity, size, rotation,
  margin, tiling) without touching the library. Drag the mark, scale it from
  the corner handle, rotate it from the top handle, or use the keyboard
  (arrows, Shift, `+`/`-`, `[`/`]`).
- Crop tool with free, original, 1:1, 4:3, 3:2, 16:9, 4:5 and 9:16 ratios,
  draggable frame and handles, thirds grid, and numeric fields.
- Resize tool with a proportion lock, 25/50/75 % and fit-to-1080/2048/4096
  shortcuts, and an 8192 px output ceiling.
- Export to PNG, JPEG or WebP with a quality slider; rendered at full
  resolution in the browser and downloaded, so photos never leave the device.
- Undo and redo for every step (Ctrl/Cmd+Z, Ctrl+Shift+Z, Ctrl+Y), with a
  drag counted as one step.
- Photos open from disk or by drag-and-drop; the sample scene is the default.
- "Open in editor" on every library card; "Editor" in the navigation.

### Changed

- The engine reports the mark's box and rotation with each result.
- `PreviewRenderer` accepts source-pixel crop and resize transforms, exposes
  the subject's size and scale, and exports at full size.

## [0.4.0] - 2026-09-06

Milestone M3: watermark library, fonts, and symbols.

### Added

- Preset and logo storage: D1 tables `watermark` and `asset` (migration
  `0001_library.sql`), an R2 bucket binding, and organization-scoped routes
  under `/api/orgs/:orgId/watermarks` and `/api/orgs/:orgId/assets`, all
  behind the `watermark` permission (viewers read; editors, admins and
  owners write) and recorded in the audit log.
- Logo uploads validated by file signature rather than the declared type,
  limited to 5 MB and 50 logos per organization, served privately through
  the Worker, and protected from deletion while a preset references them.
- Font catalogue of 51 open-licensed Fontsource families across sans,
  serif, display, script and monospace, loaded on demand per family and
  weight; a symbol catalogue of eight glyph groups and 70 lucide icons.
- The preset designer: text, symbol and logo marks; smart, corner or custom
  placement; automatic or manual contrast; opacity, size, rotation, margin
  and tiling; a live preview rendered by the engine worker on a bundled
  sample scene or a photo of the user's choosing; draft retention when
  switching mark types.
- Library page listing presets with their kind, placement and contrast, with
  create, edit and delete for editing roles and a read-only view for viewers.
- `scripts/lighthouse.mjs` and `scripts/screenshots.mjs` now cover the
  library and designer.

### Changed

- TypeScript `lib` raised to ES2025 (Iterator helpers) for all projects.
- `fetchJson` now surfaces the Worker's error code and a user-facing message
  on `ApiRequestError`; `sendNoContent` handles 204 responses.
- The members page shares the `canRole` helper with the library.

## [0.3.0] - 2026-09-06

Milestone M2: watermark engine.

### Added

- Serialisable watermark specification (`src/shared/watermark.ts`): text,
  symbol (Unicode glyph or bundled icon) and image marks; anchor, smart or
  custom placement; automatic or manual contrast; opacity, rotation, scale,
  margin and tiling.
- Client-side engine in `src/client/engine/`: luminance and Sobel analysis on
  a 256px map, smart placement scored on edge density, texture, centre and
  scene-contrast saliency plus photographer convention, auto contrast with
  an outline that strengthens on mid-tones, brick-pattern tiling, canvas
  rendering, PNG/JPEG/WebP encoding with MIME verification, and a typed Web
  Worker with transferred bitmaps and in-worker font loading.
- Vitest browser project (real Chromium) for rendering, encoding and worker
  tests, included in coverage; `npm run test:browser`.
- `docs/benchmarks.md` with the M2 throughput measurement.

### Added

- `production` wrangler environment (`APP_ENV=production`,
  `APP_URL=https://watermark.blowmoney.net`, `EMAIL_PROVIDER=cloudflare`,
  own routes and bindings) and `scripts/deploy.mjs`, which builds with
  `CLOUDFLARE_ENV=production`, applies remote D1 migrations and deploys.
- First production deployment on 2026-09-06: D1 database created, secret set,
  `https://watermark.blowmoney.net` serving with the expected headers.
- Cloudflare email delivery errors now carry Cloudflare's reason in the
  logged message, since Better Auth logs rather than fails on delivery errors.

### Changed

- The top-level wrangler configuration is renamed `watermark-pro-dev` so an
  accidental environment-less deploy cannot overwrite production.

- Email Sending enabled on `watermark.blowmoney.net` (records created under
  that subdomain only); sender changed to `no-reply@watermark.blowmoney.net`.
  Delivery verified against the live Worker.
- First organization ("Blow Money") and its owner and admin were provisioned
  directly in the production database on 2026-09-06, each with a verified
  email and no password; both received a password-setup link. The audit log
  records the bootstrap as `organization.provisioned`.

## [0.2.0] - 2026-09-06

Milestone M1: foundation. Accounts, organizations, roles, audit trail, and
the design system. No watermarking yet; that begins in M2.

### Added

- Better Auth 1.7 on Cloudflare D1 via Drizzle: email + password sign-up
  with mandatory email verification, sign-in, password reset, sessions in
  HttpOnly SameSite=Lax cookies (Secure on https origins).
- Organizations with owner, admin, editor and viewer roles declared once in
  `src/shared/permissions.ts` (Better Auth access control) and enforced by
  `requireSession` / `requirePermission` middleware on every custom route.
  Invitations by email, role changes, member removal, and organization
  update/delete through Better Auth's organization endpoints.
- Append-only `audit_log` table written from Better Auth hooks for sign-ups
  and every organization, invitation and membership change, with the actor's
  name snapshotted; `GET /api/orgs/:orgId/audit` for owners and admins.
- Rate limiting through two Workers Rate Limiting bindings (strict for
  credential endpoints, general for the rest), with Better Auth reporting an
  accurate `X-Retry-After`.
- Same-origin guard on every state-changing `/api` request, closing the gap
  left by form-only CSRF checks for JSON bodies.
- Transactional email behind a provider interface: Cloudflare Email Sending
  (`send_email` binding, `no-reply@watermark.blowmoney.net`) or a console provider for
  development and tests that also exposes `GET /api/dev/mailbox`. Configuration
  validation refuses the console provider in production.
- Fail-closed validation of every variable and binding (`APP_URL`,
  `BETTER_AUTH_SECRET`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `DB`,
  `AUTH_RATE_LIMITER`, `API_RATE_LIMITER`, `SEND_EMAIL`).
- Client: landing page, sign-up, check-your-inbox, sign-in with redirect
  target, forgot/reset password, invitation acceptance, authenticated shell
  with sidebar navigation, organization switcher, account menu and theme
  toggle (system/light/dark, persisted), dashboard, members management, audit
  log viewer, organization creation with slug derivation.
- Design system on Tailwind CSS 4 tokens (brand and semantic colours, Inter
  Variable self-hosted) with Radix-based primitives: button, input, field,
  card, alert, badge, avatar, dropdown menu, select, spinner.
- Schema drift guard: a test compares the drizzle schema with the tables
  Better Auth derives from the runtime options.
- Node test harness running the real Hono app and real Better Auth on the
  in-memory adapter; Workers test project applying D1 migrations per file and
  exercising real D1 and rate-limit bindings; Playwright onboarding journey
  (sign-up â†’ verify â†’ organization â†’ invite â†’ accept â†’ viewer denied) with axe
  on every page; Lighthouse and screenshot audit scripts.
- npm scripts `db:generate`, `db:migrate:local`, `db:migrate:remote`,
  `audit:lighthouse`, `audit:screenshots`; `deploy` now applies remote
  migrations first.

### Changed

- Target Cloudflare plan is Workers Paid (owner upgraded on 2026-09-05), which
  lifts the CPU constraint on password hashing and includes Email Sending from
  `no-reply@watermark.blowmoney.net`. PLAN.md A5, A6, A13, Q7, Q8 updated.
- Production hostname is now the Custom Domain `watermark.blowmoney.net`
  (`routes` in `wrangler.jsonc`); the `workers.dev` subdomain is disabled.
  The owner supplied the domain after the 0.1.0 scaffold, which had assumed
  no custom domain.
- `npm run preview` serves on port 5173 so the preview origin matches
  `APP_URL`; Playwright never reuses an existing server.
- `/api/health` answers 500 `invalid_configuration` until every binding is
  present, so a partially configured deployment is visible immediately.

### Fixed

- Switching organizations from the shell did not refresh cached queries or
  the parent route context (caught by a shell test and the e2e journey).
- `eslint --fix` had stripped `as` assertions on `Response.json()` results
  because Cloudflare's types make `json<T>()` generic; tests now parse
  responses with Zod instead of asserting.
- Zod's JIT probe (`new Function`) was reported as a CSP violation on every
  page; Zod now runs in `jitless` mode from the first client import.

### Decisions recorded

- Node unit tests run Better Auth on the memory adapter; D1-only wiring
  (`src/worker/db/**`, `services.ts`) is excluded from coverage and verified
  by the Workers project instead, because the Workers pool cannot instrument.
- The Better Auth CLI (1.4.21) is older than Better Auth 1.7 and would have
  generated a schema without `account.issuer`; the drift test replaces it.
- `--config auto` for semgrep requires telemetry and is not used; explicit
  rulesets are.

## [0.1.0] - 2026-09-05

Milestone M0: scaffold and quality gates. No product features yet.

### Added

- Single Cloudflare Worker serving a React 19 + Vite 8 single-page application
  from Workers Static Assets and a Hono 4 JSON API under `/api`.
- `GET /api/health` returning the validated environment name.
- Runtime configuration validation (`src/worker/env.ts`) that fails closed with
  a JSON 500 and a logged reason when `APP_ENV` is missing or unknown.
- Hardened response headers on API responses (CSP `default-src 'none'`, HSTS,
  `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`) and on
  static responses via `public/_headers`.
- CSRF origin check on state-changing requests (Hono `csrf` middleware).
- TanStack Router file-based routing with a root layout shell and a home route
  that loads the health check through a schema-validated API client.
- Tailwind CSS 4 design tokens (brand palette, semantic surface/ink/line
  tokens, light and dark schemes) in `src/client/styles/app.css`.
- Quality gates wired as npm scripts and proven to fail on deliberate defects:
  Prettier, ESLint 10 (type-checked, unicorn, import-x, react-hooks,
  react-refresh), `tsc -b` across three project references, stylelint, knip,
  dpdm, jscpd, gitleaks, `npm audit`, semgrep, Vitest with coverage
  thresholds, Playwright + axe end-to-end smoke, production build.
- Vitest projects: `unit-client` (jsdom), `unit-worker` (Node), `workers`
  (real workerd via `@cloudflare/vitest-pool-workers`).
- Husky pre-commit hook running gitleaks on the staged diff and lint-staged.
- GitHub Actions workflow with quality, e2e, and semgrep jobs; actions pinned to
  commit SHAs; semgrep image pinned by digest.
- `.npmrc` with `save-exact`, `engine-strict`, and `min-release-age=7`.
- Documentation: `README.md`, `PLAN.md`, `SECURITY.md`, `CHANGELOG.md`,
  agent instruction files (`AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot
  instructions).

### Fixed

- `onError` initially converted Hono's CSRF `HTTPException` (403) into a 500;
  caught by the CSRF unit test and corrected to pass `HTTPException`
  responses through.

### Decisions recorded

- TypeScript pinned to 6.0.3 because typescript-eslint's peer range excludes
  6.1+ and TypeScript 7 would silently disable type-aware linting.
- Vitest pinned to 4.1.11 because the Workers pool does not support Vitest 5.
- `compatibility_date` pinned to 2026-08-22, the newest date the Workers pool's
  bundled workerd accepts.
- knip runs without `--strict`: in knip 6 that flag implies `--production` and
  analysed only two files while a real unused dependency went unreported.
- `eslint-plugin-jsx-a11y` and `eslint-plugin-react` deferred (ESLint 9 only);
  axe in e2e and a Lighthouse accessibility budget compensate.
