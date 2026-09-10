# Lumafoil

Watermark photos, videos, and PDFs with text, logos, signatures, QR codes, and
reusable presets. Process files on your device, save finished photos to a private
gallery, and share selected results when you choose.

The hosted service is configured for **lumafoil.com** and **invitation-only**
admission; final cutover is pending. Admitted users can
invite people through a personal invitation link or an email invitation; new
users receive their own private workspace. Invitations do not grant access to
the inviter's photos or presets. Only the sole site administrator can view
aggregate account numbers; workspace ownership does not grant that access.

Want to run your own instance? The source is **free under the MIT license**.
Start with [the self-hosting guide](docs/self-hosting.md). Bundled fonts and
stickers retain their included open-source licenses; hosting and provider
services have their own costs.

- **Creative tools:** 551 distinct font families, 400 colour vector stickers,
  drawn signatures, text effects, shapes, tiling, multiple marks and saved QR codes.
- **Photo workflow:** single-image editing, batch processing, crop/resize,
  brightness/contrast/saturation controls, and JPEG/PNG/WebP export.
- **Save and share:** reusable preset import/export, gallery storage,
  expiring/revocable gallery links and optional cloud-file connections.
- **Offline work:** prepare the app, edit presets and save photos without a
  connection, then synchronize with visible retry and conflict recovery.
- **Accounts:** invite-only email registration and optional Google/Microsoft
  sign-in, explicit provider linking, private workspaces, and separate deliberate
  collaboration workspaces.
- **Interface:** twelve languages, Arabic right-to-left layout, light/dark
  themes and responsive phone/tablet/desktop controls.

**Release status:** M19 production-readiness work is in progress. Focused
implementation evidence is recorded under [docs/verification/m19](docs/verification/m19/).
Final full-suite coverage, browser/device, performance, security, hosted OAuth
and domain-cutover evidence remains required before release certification.
Historical milestone results do not certify the current checkout.

Offline access requires an already prepared account and its cached resources.
Online startup validates the live session before showing private data; sign-out,
server access denial, or an account change cannot authorize a cached fallback.
Administration, account management and cloud connections require a network.

The [competitor audit](docs/competitor-research.md) distinguishes working
capabilities, vendor claims, limitations and untested comparisons. Earlier
claims of superiority on every feature axis were withdrawn. See
[PLAN.md](PLAN.md) and [CHANGELOG.md](CHANGELOG.md) for the roadmap and release history.

## Stack

| Layer           | Choice                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Runtime         | Cloudflare Workers (one Worker: Static Assets for the SPA, Hono API)   |
| Language        | TypeScript 6.0.3 (pinned; see PLAN.md §3.1)                            |
| Frontend        | React 19, Vite 8, TanStack Router + Query, Tailwind CSS 4, Radix UI    |
| API             | Hono 4, Zod 4                                                          |
| Auth and RBAC   | Better Auth 1.7 (organization + admin plugins) on Cloudflare D1        |
| Data            | Cloudflare D1 via Drizzle ORM; Workers Rate Limiting; Email Sending    |
| Tests           | Vitest 4 (jsdom, Node, and real workerd), Playwright + axe, Lighthouse |
| Package manager | npm 11                                                                 |

## Requirements

- Node.js 24 (see `.nvmrc`) and npm 11.10 or newer (`min-release-age` support).
- Git.
- Python 3 for the standard-library asset-download and recovery-SQL preparation
  tests in `npm run test:assets` and the full quality gate (3.14 verified locally).
- [gitleaks](https://github.com/gitleaks/gitleaks) on `PATH` (8.30.1 verified).
  Used by the pre-commit hook and `npm run security:secrets`.
- [semgrep](https://semgrep.dev/) for `npm run security:sast`
  (1.174.0 verified). The wrapper accepts the executable on `PATH` or the
  installed package through Python's console entry point. CI runs it regardless.
- Playwright browsers for `npm run test:e2e`:
  `npx playwright install chromium webkit` (WebKit runs the iPhone and iPad
  projects). The image engine selects its worker or main-thread fallback by
  runtime capability. CI installs both.
  If the Playwright downloader times out on your network, fetch the zip with
  `curl` and unpack it under `%LOCALAPPDATA%\ms-playwright\` with an empty
  `INSTALLATION_COMPLETE` marker file; that is what was done on the original
  development machine.
- The installed Playwright Chromium build is used by `npm run audit:lighthouse`.
- A Cloudflare account for deployment (`wrangler login`). Local Worker, D1 and
  R2 execution uses workerd without a deployed instance. Dependency installation,
  vulnerability checks and real provider workflows require network access.

## Installation

```bash
npm ci
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET (see the file)
npm run db:migrate:local         # creates the local D1 database
```

`npm ci` also installs the Husky pre-commit hook.

## Development

```bash
npm run dev              # Vite dev server on :5273; Worker runs in workerd with HMR
npm run preview          # serve the production build through workerd on :5273
npm run build            # production build into dist/
npm run cf-typegen       # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run db:generate      # write a new migration after editing src/worker/db/schema.ts
npm run db:migrate:local # apply migrations to the local D1 database
```

Both the dev server and the preview use port 5273 because the Worker only
accepts state-changing requests from the origin in `APP_URL`. Stop one before
starting the other. (The local origin is 5273, not Vite's default 5173, so it
does not clash with another local project already on 5173; `APP_URL` and both
scripts move together if you change it.)

With the default `EMAIL_PROVIDER=console`, verification, reset, and invitation
emails are printed to the Worker log (the terminal running `npm run dev`), so
copy the link from there. Under `npm run preview` the same messages are also
kept in memory and exposed at `GET /api/dev/mailbox`, which the e2e suite and
the audit scripts use; in `vite dev` the plugin rebuilds the Worker's
environment per request, so that in-memory mailbox does not accumulate. The
route exists only with the console provider, which configuration validation
refuses in production.

## Quality gates

Each gate exits non-zero on its defined failures. Historical and focused
negative-control results live in PLAN.md §8 and `docs/red-drill/`; the final
current-source drill run remains a separate certification obligation.

| Command                     | Gate                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run format:check`      | Prettier (with Tailwind class sorting)                                                                  |
| `npm run lint`              | ESLint, type-checked, zero warnings                                                                     |
| `npm run lint:css`          | stylelint, zero warnings                                                                                |
| `npm run typecheck`         | `tsc -b` over client, worker, and tooling projects                                                      |
| `npm run deadcode`          | knip: unused files, exports, dependencies                                                               |
| `npm run lint:cycles`       | dpdm: circular imports                                                                                  |
| `npm run lint:dup`          | jscpd: copy-paste, zero tolerance                                                                       |
| `npm run security:secrets`  | Publication audit of history, working/index candidates and archives                                     |
| `npm run security:audit`    | `npm audit --audit-level=high`                                                                          |
| `npm run security:sast`     | semgrep (`p/default`, `p/typescript`, `p/react`, `p/secrets`)                                           |
| `npm run test`              | Vitest coverage/workerd plus bootstrap, performance, publication and asset tests                        |
| `npm run test:e2e`          | Playwright against the production build on four devices, axe on every page                              |
| `npm run test:drill`        | Red drill: every mutation in `scripts/red-drills.mjs` must turn a test red                              |
| `npm run audit:lighthouse`  | Lighthouse desktop/mobile budgets for the configured page inventory on the isolated gate                |
| `npm run audit:screenshots` | Required surface inventory, English/Arabic, both themes, desktop/iPhone/iPad/Android; axe and reflow    |
| `npm run build`             | Vite production build                                                                                   |
| `npm run quality`           | Formatting, lint, types, dead code, catalogue, cycle/duplicate, secret/dependency, test and build chain |

`npm run quality` includes real Chromium tests and installed security/asset
tools. Full Playwright, SAST, red-drill, Lighthouse and screenshot commands are
separate gates. CI runs `quality:ci`, the e2e job, and the semgrep
job on every push and pull request, plus GitHub dependency review on pull
requests. The Lighthouse and screenshot audits are run at UI milestones
against `node scripts/gate-server.mjs`, which builds the application and serves
it with isolated local D1/R2 state; their output is committed under `docs/lighthouse/`
and `docs/screenshots/`.

Other test commands: `npm run test:unit` (jsdom + Node projects),
`npm run test:browser` (engine tests in real Chromium via Vitest browser
mode; includes the throughput benchmark recorded in `docs/benchmarks.md`),
`npm run test:workers` (workerd with real D1 and rate-limit bindings),
`npm run test:watch`.

The end-to-end suite runs every journey on four Playwright projects:
`desktop-chrome`, `iphone` (iPhone 14, WebKit), `ipad` (iPad Mini, WebKit)
and `android` (Pixel 7, Chromium). Pass `--project iphone` to run one.
WebKit needs `npx playwright install webkit` once.

The red drill (`npm run test:drill`, or `node scripts/red-drill.mjs --unit`
to skip end-to-end drills) is how the tests prove themselves: each
entry in `scripts/red-drills.mjs` breaks one behaviour, runs the test or
gate that owns it, and restores the file. A drill whose command stays green
fails the run. Reports are written to `docs/red-drill/`.

## Environment variables and bindings

| Name                           | Kind       | Where                                          | Purpose                                                                                                          |
| ------------------------------ | ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                      | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | `development`, `test`, `staging`, `production`                                                                   |
| `APP_URL`                      | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Public origin; auth links and the same-origin guard                                                              |
| `EMAIL_PROVIDER`               | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | `console` (dev/test only) or `cloudflare`                                                                        |
| `EMAIL_FROM`                   | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Sender address; must be on a zone in the account                                                                 |
| `BETTER_AUTH_SECRET`           | secret     | `.dev.vars`, `wrangler secret put`             | Signs sessions and tokens; at least 32 random characters                                                         |
| `TURNSTILE_SITE_KEY`           | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Optional; Turnstile widget key, served to the client via `/api/config`                                           |
| `TURNSTILE_SECRET_KEY`         | secret     | `.dev.vars`, `wrangler secret put`             | Optional; must be set together with the site key                                                                 |
| `GOOGLE_OAUTH_CLIENT_ID`       | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Google Drive picker. Public client id, served via `/api/config`                                        |
| `GOOGLE_PICKER_API_KEY`        | secret     | `.dev.vars`, `wrangler secret put`             | Optional; browser-visible Picker key stored encrypted in the Worker; restrict APIs/hosts, never commit its value |
| `GOOGLE_PICKER_APP_ID`         | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Google Cloud project number the Picker needs                                                           |
| `MICROSOFT_CLIENT_ID`          | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; OneDrive picker. Microsoft Entra SPA app client id                                                     |
| `DROPBOX_APP_KEY`              | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Dropbox Chooser app key                                                                                |
| `GOOGLE_AUTH_CLIENT_ID`        | secret     | `.dev.vars`, `wrangler secret put`             | Optional account-sign-in Web client; separate from Drive                                                         |
| `GOOGLE_AUTH_CLIENT_SECRET`    | secret     | `.dev.vars`, `wrangler secret put`             | Required with the Google account client ID                                                                       |
| `MICROSOFT_AUTH_CLIENT_ID`     | secret     | `.dev.vars`, `wrangler secret put`             | Optional account-sign-in Web client; separate from OneDrive                                                      |
| `MICROSOFT_AUTH_CLIENT_SECRET` | secret     | `.dev.vars`, `wrangler secret put`             | Required with the Microsoft account client ID                                                                    |
| `MICROSOFT_AUTH_TENANT_ID`     | secret     | `.dev.vars`, `wrangler secret put`             | Optional Microsoft identity tenant selection                                                                     |
| `DB`                           | D1         | `wrangler.jsonc` `d1_databases`                | Users, organizations, members, invitations, audit log, presets                                                   |
| `BUCKET`                       | R2         | `wrangler.jsonc` `r2_buckets`                  | Logos, photos and thumbnails; never public, streamed via the API                                                 |
| `AUTH_RATE_LIMITER`            | ratelimit  | `wrangler.jsonc` `ratelimits`                  | 10 requests / 60 s per IP on credential endpoints                                                                |
| `API_RATE_LIMITER`             | ratelimit  | `wrangler.jsonc` `ratelimits`                  | 120 requests / 60 s per IP on other auth endpoints                                                               |
| `SEND_EMAIL`                   | send_email | `wrangler.jsonc` `send_email`                  | Cloudflare Email Sending; required when provider is `cloudflare`                                                 |

Hosted account-sign-in client identifiers and tenant selection use encrypted
Worker bindings too. These identifiers are public metadata; their storage choice
does not make them authentication credentials.

Every variable and binding is validated on the first request an isolate
handles (`src/worker/env.ts`); a misconfigured Worker answers 500 with
`invalid_configuration` and logs the reason. `.dev.vars.example` is the
authoritative list of local overrides.

## Roles

Organizations are the tenancy boundary. Each member has one role:

| Role   | Watermarks, photos, jobs, sharing | Members and invitations | Organization settings | Audit log |
| ------ | --------------------------------- | ----------------------- | --------------------- | --------- |
| owner  | full                              | full                    | update and delete     | read      |
| admin  | full                              | full                    | update                | read      |
| editor | full                              | none                    | none                  | none      |
| viewer | read                              | none                    | none                  | none      |

Permissions are declared once in `src/shared/permissions.ts` and enforced by
the Worker (`requirePermission`); the client uses the same table only to hide
controls.

### Platform administrators

Exactly one account holds site administration: its ID must match the database
owner anchor and its Better Auth role must be `admin`. The guarded bootstrap
procedure is documented in [docs/runbook.md](docs/runbook.md). The console at
`/app/admin` can:

- search users by email, ban and unban them with a reason (a banned user's
  sessions are revoked and sign-in is refused), and sign a user out everywhere;
- list every organization with its member count, photo count and storage;
- browse the global audit trail, account totals, health and sanitized client-error records.

Normal APIs cannot add another site administrator, demote/delete the anchored
owner, impersonate another user, or replace another account's email or password.

Every admin action is recorded in the audit log with the administrator as
the actor. The Worker enforces both role and owner identity on its admin routes
and guards Better Auth's administrative endpoints with the same owner boundary.

### Bot protection

When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both set, sign-up
and password-reset requests must carry a Cloudflare Turnstile token in the
`x-captcha-response` header; the Worker verifies it with Cloudflare before
Better Auth handles the request. The sign-up and forgot-password pages render
the widget and keep their submit button disabled until it produces a token.
Without the keys the deployment runs without a challenge and the pages show
nothing extra. Create a widget for `lumafoil.com` in the Cloudflare
dashboard under Turnstile, put the site key in `wrangler.jsonc`
(`env.production.vars`) and the secret in
`wrangler secret put TURNSTILE_SECRET_KEY --env production`.

## Watermark library

Presets belong to an organization and are shared by all of its members. A
preset is a mark plus placement, contrast and style settings
(`src/shared/watermark.ts`):

- **Marks:** text in any of 551 bundled font families (Fontsource, OFL or
  Apache licensed, latin subset, loaded only when chosen), up to four lines,
  with `{date}`, `{time}` and `{filename}` tokens filled in per photo from
  capture metadata or the file's last-modified time and name; a Unicode glyph
  from nine groups (including Emoji); one of 70 lucide icons or 400 bundled
  colour stickers; an uploaded logo; a signature drawn with a finger or mouse
  on the designer's pad (saved as a transparent PNG logo); or a QR code
  (up to 512 characters, always dark on a light field so it scans).
- **Placement:** smart (the engine scores each corner and edge of every
  photo), a fixed corner, or a custom position.
- **Contrast:** automatic light or dark ink with an outline that only appears
  on mid-tone backgrounds; a manual light or dark variant; or any colour,
  with the outline in the opposite tone and an adjustable strength.
- **Style:** opacity, size relative to the photo width, rotation, margin,
  tiling with adjustable spacing, and for text and symbols an optional box
  behind the mark with its own opacity.

Logos are PNG, JPEG or WebP up to 5 MiB, at most 50 per organization. The
Worker checks the file signature rather than the declared type, stores the
bytes in R2 under a key that includes the organization id, serves them only
to signed-in members through `/api/orgs/:orgId/assets/:id/file`, and refuses
to delete a logo while a preset still references it (HTTP 409). A drawn
signature is exported at 1024 px on its long side with a small margin and
uploaded through the same route. When a logo is chosen a **Prepare** step can
remove a flat background (an adjustable-tolerance corner flood with a
one-pixel feather) and trim transparent margins, then uploads a clean PNG.

Presets **export** to a portable `.wmp.json` file (logos embedded) and
**import** back — one preset or the whole library. Import validates every
preset against the same schema the app uses and renames a name clash rather
than overwriting, so a file from another workspace lands safely.

The designer previews every change through the same Web Worker that will
process real photos, on a bundled sample scene or on a photo you pick; the
photo never leaves the browser.

## Editor

`/app/editor` watermarks one photo at a time. Open a photo (or drop it on the
canvas), create a watermark in place or add a saved preset, and adjust it for
this photo only: drag the mark,
scale it from the corner handle, rotate it from the top handle, pinch and
twist on a touch screen, or use the keyboard (arrow keys nudge, Shift for
larger steps, `+`/`-` resize, `[`/`]` rotate). While dragging, the mark's
centre snaps to the margin lines, the thirds and the centre, with guides
drawn while it is snapped; hold Alt (Option on a Mac) to place it freely.
The library preset is never changed; "Revert" restores it.

Add up to eight presets to one photo. Each is a layer with its own
placement and style; the list under the preset picker selects the layer the
handles and the panels edit, and later layers paint over earlier ones.

Rotate in quarter turns, flip, and straighten with a slider that
auto-crops the tilt away so no empty corners are ever exported. The Crop
tab works in the oriented frame: crop with a free frame or a fixed ratio
(original, 1:1, 4:3, 3:2, 16:9, 4:5, 9:16). The Adjust tab has brightness,
contrast, saturation, warmth, sepia and vignette sliders and eight one-tap
filters (Mono, Sepia, Vivid, Warm, Cool, Fade, Noir and Original), each
previewed on your own photo; the mark's auto contrast reads the adjusted
photo, so ink stays legible after a filter. Resize with a proportion lock
or the percentage and long-edge shortcuts, then download as PNG, JPEG or
WebP at full resolution, or hand the file to the device's share sheet (on
an iPhone that is where "Save Image" and the social apps live; the button
appears only where the browser can share files). Every step is undoable
(Ctrl/Cmd+Z, Ctrl+Shift+Z or Ctrl+Y). Rendering and export happen in a Web
Worker in your browser, or on the main thread where the browser has no
`OffscreenCanvas`; nothing is uploaded.

## Bulk watermarking

`/app/bulk` applies one or more presets to a whole shoot (up to 500 photos).
Drop the photos in or pick them — or drop a **folder**, or use "Add a folder"
where the browser supports it, and the sub-folder tree is preserved in the
ZIP. Non-image files are skipped and counted. Tick the presets (they are
applied in the order ticked, later ones over earlier ones), choose the output
format, quality, metadata policy and optionally a maximum long edge. A **File
names** field sets the output naming with a live example and the tokens
`{name}`, `{index}`, `{count}`, `{date}`, `{preset}`, `{width}` and `{height}`.
A "Photo adjustments" section applies one rotation, flip, filter and frame to
every photo.

Press Start; the browser decodes each photo and a pool of engine workers (one
per core, up to eight) renders them in parallel with smart placement and auto
contrast worked out per photo and per mark. A running batch can be **paused**
and resumed. The list shows the first 60 photos with a "Show all" control so a
large batch avoids rendering every row at once. When it settles, download everything as one ZIP
(tree preserved), save to the gallery, share or download file by file, and
download a **CSV report** of every job. Nothing is uploaded unless you save the
results to the gallery or explicitly send them to a configured cloud provider.

One photo can be **adjusted on its own**: "Adjust" opens it in the full editor
(embedded, no export step); "Apply to this photo" re-runs just that job with
the edits, "Apply to all photos" reuses them across the batch, and "Remove
override" restores the batch settings. An adjusted row is marked **Custom**.

**Watch a folder** (desktop browsers with the File System Access API): pick an
input and an output folder and any new photo dropped into the input is
watermarked with the ticked presets and written to the output while the page
stays open.

## Video

Watermark MP4, WebM and MOV in the browser with WebCodecs — the same presets,
placement and contrast as photos, on every frame. Audio preservation depends on
the source codec and available encoders. Files up to 2 GiB, 600 s and 3840 px
pass the size limits; supported container and codec decoding is also required.
Anything larger is refused before a
single frame is decoded. "Quality" is a bitrate ladder (Low 2, Standard 6, High
12 Mbit/s at 1080p, scaled by pixel count) and the output fits Original, 1080p
or 720p. The container follows whichever codec the browser can encode — MP4
(H.264/HEVC) or WebM (VP9/AV1) — and is shown before you start ("Saves as MP4
(H.264)"). Audio is copied without re-encoding when it fits the container
(AAC→MP4, Opus→WebM), otherwise re-encoded at 128 kbit/s when the target audio
encoder is available. Otherwise output has no audio track, as shown before
processing. Everything runs in a
dedicated Web Worker; nothing is uploaded and the gallery does not store videos.
Browsers without `VideoEncoder` or an encodable supported codec see an
unsupported message. Support is detected at runtime; a browser name or version
alone does not guarantee encoding on a particular device.

## Documents

Watermark every page of a PDF with the same presets as photos. Drop or pick up
to 50 PDFs (≤ 50 MiB, ≤ 200 pages each); the ticked layers are rasterised once
per distinct page size at 150 dpi and drawn on every page with `pdf-lib`. Smart
placement reads a photo, so on a blank page it falls back to a bottom-right
anchor (the tool says so); choose a corner or a custom position instead. Output
is `<name>-watermarked.pdf`, one per input or a ZIP for several, with the Info
dictionary kept, `Producer` set to "Lumafoil" and `ModDate` refreshed.
Encrypted PDFs are refused. Everything runs in the browser; nothing is uploaded.

## Exports and metadata

Every export, from the editor or the bulk tool, is re-encoded from pixels by
the browser's canvas. A **Metadata** setting under the format chooses what of
the source's EXIF/XMP travels with the file:

- **Strip** (default): no camera data and no location. Safest for sharing.
- **Keep except location**: camera, lens, capture time and settings stay; the
  GPS position is removed.
- **Keep everything**: including the GPS position, if the photo has one.

| Output | strip |          keep-except-location           |          keep           |
| ------ | :---: | :-------------------------------------: | :---------------------: |
| JPEG   |   ✓   | ✓ (APP1 Exif, GPS emptied; XMP dropped) |   ✓ (APP1 Exif + XMP)   |
| PNG    |   ✓   |            ✓ (`eXIf` chunk)             | ✓ (`eXIf` + `iTXt` XMP) |
| WebP   |   ✓   |  — (WebP exports are always stripped)   |            —            |

In both keep modes the orientation tag is reset to 1 (the pixels are already
upright, so phone photos come out right) and the pixel-dimension tags are
rewritten to the output size. Print density (DPI) is preserved in every mode
— JPEG through a JFIF APP0, PNG through a `pHYs` chunk — because it is not
personal. Metadata is read and written entirely in the browser (`exifr` plus
`src/client/engine/metadata/`); nothing is uploaded for it. The gallery stores
whatever the export carried.

### Invisible mark

A PNG export (from the editor or the bulk tool) can carry an **invisible
mark**: a short message hidden in the pixels themselves — the least significant
bit of the blue channel along a seeded walk, protected by a CRC so a corrupted
read fails rather than lies. It defaults to the workspace name. It is **PNG
only**: lossy re-encoding can destroy it, so this export option is offered only
for PNG. A message too large for the photo blocks the export instead
of being truncated. Open **/app/verify** (or "Check a photo" in the gallery)
and choose a PNG to read the message back, or confirm a photo carries no mark.
The mark is honest steganography, not DRM — anyone re-saving the PNG as JPEG
strips it, by design.

### Tokens

Text marks can print per-photo details. Insert a token from the "Insert
detail" menu in the designer, or type it:

| Token                                         | Value                                                         |
| --------------------------------------------- | ------------------------------------------------------------- |
| `{date}`, `{time}`                            | capture date/time, else the file's modified time              |
| `{taken}`                                     | capture date and time (empty when the photo has no EXIF date) |
| `{filename}`                                  | file name without its extension                               |
| `{camera}`, `{lens}`                          | camera model and lens                                         |
| `{iso}`, `{aperture}`, `{shutter}`, `{focal}` | exposure settings                                             |
| `{location}`                                  | GPS position, e.g. `51.5074° N, 0.1278° W`                    |
| `{index}`, `{count}`                          | position in the batch and batch size                          |
| `{width}`, `{height}`                         | output pixel size                                             |

A token with no value is removed and any separator it left behind is tidied.
`{location}` prints the photo's GPS position onto the picture; it is opt-in by
typing the token, and no default preset uses it.

## Gallery

`/app/gallery` keeps watermarked photos in the organization's storage. Save a
photo from the editor's Export tab or a whole batch from the bulk tool; the
browser builds a thumbnail and uploads both. Photos are listed newest first
with search, a preset filter and paging; select several and delete them after
a confirmation, or open one to download or delete it. Viewers can browse and
download; editors and above can save and delete.

Limits: 40 MiB per photo, PNG, JPEG or WebP, 10 000 photos and 2 GiB per
organization. Files live in R2 under organization-scoped keys and are served
only to signed-in members.

## Sharing

Select photos in the gallery (or open one) and choose Share to publish them
under a link that expires after 1, 7 or 30 days, or never. The link can be
copied or handed to the device's share sheet. Anyone with it sees the album
at `/share/<token>` and can download the photos; nothing else in the
organization is reachable from it. `/app/shares` lists every link with its
status and revokes it instantly. Editors and above can share; viewers cannot.

Tokens are signed (HMAC-SHA-256 with a key derived from the application
secret) and carry their expiry. The database stores share metadata and
revocation state rather than the bearer token; the server can reconstruct the
link for authorized members. Public routes are
rate limited per address and answer every refusal with the same 404.

## Languages

The interface is available in twelve languages: English, Spanish, German,
French, Italian, Brazilian Portuguese, Dutch, Japanese, Korean, Simplified
Chinese, Russian, and Arabic (right-to-left). The language picker (the
`Languages` icon in the header and on the signed-out pages) applies a choice
immediately, remembers it in the browser, and — when you are signed in — saves
it to your account so it follows you across devices. Before you pick, the app
chooses from your saved preference, then your browser's languages, then English;
`<html lang>`/`dir` follow the locale, and Arabic mirrors the layout.

Interface catalogues live under `src/client/locales/`; an ESLint
`no-literal-string` rule checks the components in its configured scope.
Some runtime errors and email text remain English. **To add a language:** copy
`locales/en/common.json`, translate it
(the terms in `locales/GLOSSARY.md` must stay consistent; keep every
`{{placeholder}}` and provide the plural forms `Intl.PluralRules(<locale>)`
lists), add the code to `SUPPORTED_LOCALES` in `src/shared/locales.ts`, then run
`npm run quality` — the completeness test and `i18n:check` verify it. See
`docs/i18n/` for the translation-quality record. Locale-aware date/number helpers
exist; final layout and language acceptance still require the device matrix.

## Project structure

```
src/client/       React SPA: routes/ (file-based), components/ (ui/ primitives, designer/, editor/, bulk/, gallery/),
                  editor/ (crop, resize and undo logic), bulk/ (job queue, worker pool, ZIP), lib/, styles/,
                  fonts/ (catalogue + loader), symbols/ (glyphs + icons),
                  engine/ (watermark engine: pure analysis + canvas rendering, runs in a Web Worker)
src/worker/       Hono API on Workers: auth/ (Better Auth), db/ (drizzle schema, D1 stores),
                  email/ (providers), middleware/, routes/, services.ts, env.ts
src/shared/       constants, permissions, validation and API schemas used by both sides
migrations/       D1 migrations generated by drizzle-kit
e2e/              Playwright specs (smoke, onboarding, library, editor, bulk, gallery, sharing and admin journeys)
scripts/          deploy, Lighthouse and screenshot audits
docs/             threat-model.md, runbook.md, benchmarks.md, lighthouse/ reports and screenshots/ per milestone
public/           static files, including _headers for security headers
```

TypeScript is split into three projects (`tsconfig.client.json`,
`tsconfig.worker.json`, `tsconfig.node.json`) so browser code, Worker code,
and Node tooling each get the right library types. `src/shared` is compiled
under both the DOM and Workers projects and must not touch either runtime.

`worker-configuration.d.ts` is generated by `npm run cf-typegen` and committed;
CI fails if it is stale. `src/client/routeTree.gen.ts` is regenerated by the
router plugin on every dev/build/test run and is committed for the same
reason: a fresh checkout must lint and type-check before anything has been
built. CI fails if the committed tree differs from what the build produced.

## Deployment

Production is the `production` environment in `wrangler.jsonc`. A version tag
runs the release workflow. Its generated-file checks, full quality chain,
Playwright/axe suite and shared pinned SAST workflow must pass on that tagged
commit before `npm run deploy` runs in the `production` GitHub
environment. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers
Scripts, D1, R2, Email Sending and Zone DNS edit rights for the account) and
`CLOUDFLARE_ACCOUNT_ID`. The same command works from an authenticated
workstation:

```bash
npm run deploy
```

The deploy script builds the production Worker, static locale pages, dependency
notices and source offer, then verifies artifacts and applies pending migrations
before uploading. The initial private-workspace cutover has additional guarded
operator steps: complete them before publishing. Backup, preservation checks,
rollback compatibility, secret rotation and recovery procedures are in
[docs/runbook.md](docs/runbook.md).

The configured custom domain is `lumafoil.com`; M19's hostname/TLS/application
cutover remains pending until its final gates pass. The Cloudflare zone, mail and
provider registrations are configured. Current evidence and remaining steps are
recorded in [the domain migration review](docs/verification/m19/domain-migration.md).
The `workers.dev` subdomain is disabled.

Use the deployment script to select production. A bare `wrangler deploy` follows
the latest Vite deployment redirect; the top-level development name alone does
not guarantee which already-built environment it will upload.

Useful production commands:

```bash
npx wrangler tail --env production --format pretty
npx wrangler d1 migrations list watermark-pro --remote --env production
```

Email Sending is enabled for `lumafoil.com`, with sender
`no-reply@lumafoil.com`. The separate `support@lumafoil.com` shared mailbox has
verified inbound and Send As delivery. Hosted verification/reset links remain
part of the final domain-cutover tests.

## Security

See [SECURITY.md](SECURITY.md) for the reporting process and the list of
controls, and [docs/threat-model.md](docs/threat-model.md) for the STRIDE
review of every trust boundary. Controls include explicit CSP origins for
Turnstile and cloud pickers, same-origin checks for mutations, HttpOnly SameSite
session cookies, mandatory verification and invitation admission, server-side
roles and account bindings, and exactly one anchored site administrator.
Offline data and asynchronous results are scoped to their originating account;
server authorization is rechecked before synchronization. Quotas are reserved
atomically, and failed uploads have durable cleanup.

Publication checks cover working/index/history candidates and archives without
printing credentials. GitHub secret scanning and push protection are enabled;
OAuth credentials and the Picker key use encrypted Worker bindings. Dependency
audits, pinned SAST, exact package versions and pinned Actions remain enforced.
Exports strip original metadata by default; explicit retention choices and
required artwork notices are described in "Exports and metadata".

## Troubleshooting

- **`tsc -b` reports stale errors after renaming files.** Delete
  `node_modules/.tmp` (build info cache) and rerun.
- **The `workers` test project fails with "compatibility date not supported".**
  Check the configured compatibility date against the workerd version bundled
  with the installed Workers pool; upgrade and verify the pinned pair together.
- **Sign-up returns 403 locally.** The request origin must equal `APP_URL`;
  serve the app from `http://localhost:5273`.
- **Sign-up returns 500 `invalid_configuration`.** `.dev.vars` is missing or
  `BETTER_AUTH_SECRET` is shorter than 32 characters.
- **Tables do not exist.** Run `npm run db:migrate:local`.
- **`npm run security:sast` says semgrep is not found.** Install Semgrep into
  the Python environment used by the `python` command, or make its executable
  available on `PATH`. The wrapper does not change machine-wide settings.
- **`npm install` refuses a brand-new package version.** That is
  `min-release-age=7` in `.npmrc` doing its job; wait, or pin an older version.
- **CI fails on "Verify generated Worker types are current".** Run
  `npm run cf-typegen` and commit `worker-configuration.d.ts`. The command
  reads `.env.example` instead of `.dev.vars`, so local secrets never change
  the generated file.
- **knip reports nothing at all.** Do not add `--strict`; in knip 6 it implies
  `--production` and skips everything without a production suffix.
- **Playwright says port 5273 is in use.** A previous preview is still running;
  stop it (the e2e suite never reuses an existing server on purpose).
