# Watermark Pro

Watermark photographs at scale, beautifully. Bulk jobs, a reusable watermark
library, smart placement that keeps the mark off the subject, auto-contrast, an
editor with crop and resize, storage, sharing, multi-format export, and
role-based access control. A spiritual competitor to eZy Watermark, MIT
licensed, hosted on Cloudflare Workers at `watermark.blowmoney.net`.

**Status:** milestones M1 (foundation: accounts, organizations, roles, audit
trail, design system), M2 (watermark engine: smart placement, auto contrast,
tiling, PNG/JPEG/WebP output in a Web Worker) M3 (watermark library:
preset designer with live preview, 51 bundled font families, glyph and icon
catalogue, logo uploads) M4 (single-photo editor with crop, resize,
hand placement, undo and download) M5 (bulk processing with a worker
pool, progress, cancel, retry and ZIP export) M6 (stored photos with a
searchable gallery), M7 (revocable share links with the Web Share API) and
M8 (platform admin console, Turnstile bot protection, threat model, runbook,
dependency review and tag-driven deploys), M9 (phone and tablet layouts,
touch gestures, Safari support through a main-thread engine path, the
four-device end-to-end matrix, mobile Lighthouse budgets and the red drill)
and M10 (parity with the market: ink colour, multi-line text with a box,
date and file-name stamps, QR codes, drawn signatures, several marks per
photo, snap-to-grid, the share sheet for exports and a no-metadata export
policy) are complete: 1.2.0. Next: the feature series M11–M18 (photo adjustments,
arc text and shapes, EXIF tokens and metadata policy, per-photo batch
overrides and folders, preset files and logo tools, camera/URL/cloud import,
video and PDF, twelve languages) followed by the performance milestone M19;
each has a full specification under [docs/plans/](docs/plans/). See
[PLAN.md](PLAN.md) for the roadmap and [CHANGELOG.md](CHANGELOG.md) for what
has actually shipped.

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
- [gitleaks](https://github.com/gitleaks/gitleaks) on `PATH` (8.30.1 verified).
  Used by the pre-commit hook and `npm run security:secrets`.
- [semgrep](https://semgrep.dev/) on `PATH` for `npm run security:sast`
  (1.174.0 verified; `pip install semgrep`). CI runs it regardless.
- Playwright browsers for `npm run test:e2e`:
  `npx playwright install chromium webkit` (WebKit runs the iPhone and iPad
  projects; Playwright's Windows WebKit build has no `OffscreenCanvas`, which
  exercises the main-thread engine path). CI installs both.
  If the Playwright downloader times out on your network, fetch the zip with
  `curl` and unpack it under `%LOCALAPPDATA%\ms-playwright\` with an empty
  `INSTALLATION_COMPLETE` marker file; that is what was done on the original
  development machine.
- Google Chrome (or set `CHROME_PATH`) for `npm run audit:lighthouse`.
- A Cloudflare account for deployment (`wrangler login`). Development and
  tests run fully offline in workerd.

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

Every command exits non-zero on a finding. Each one was deliberately broken
and observed to fail before being trusted; the log is in PLAN.md §8.

| Command                     | Gate                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `npm run format:check`      | Prettier (with Tailwind class sorting)                                         |
| `npm run lint`              | ESLint, type-checked, zero warnings                                            |
| `npm run lint:css`          | stylelint, zero warnings                                                       |
| `npm run typecheck`         | `tsc -b` over client, worker, and tooling projects                             |
| `npm run deadcode`          | knip: unused files, exports, dependencies                                      |
| `npm run lint:cycles`       | dpdm: circular imports                                                         |
| `npm run lint:dup`          | jscpd: copy-paste, zero tolerance                                              |
| `npm run security:secrets`  | gitleaks over git history                                                      |
| `npm run security:audit`    | `npm audit --audit-level=high`                                                 |
| `npm run security:sast`     | semgrep (`p/default`, `p/typescript`, `p/react`, `p/secrets`)                  |
| `npm run test`              | Vitest with coverage thresholds, then the workerd project                      |
| `npm run test:e2e`          | Playwright against the production build on four devices, axe on every page     |
| `npm run test:drill`        | Red drill: every mutation in `scripts/red-drills.mjs` must turn a test red     |
| `npm run audit:lighthouse`  | Lighthouse desktop and mobile budgets (PLAN.md §5.5) against a running preview |
| `npm run audit:screenshots` | Visual record of every screen, both themes, desktop, iPhone and iPad           |
| `npm run build`             | Vite production build                                                          |
| `npm run quality`           | All gates except `security:sast`, `test:e2e`, and the audits                   |

`npm run quality` omits the tools that need a browser or a machine install so
it stays runnable anywhere. CI runs `quality:ci`, the e2e job, and the semgrep
job on every push and pull request, plus GitHub dependency review on pull
requests. The Lighthouse and screenshot audits are run at UI milestones
against `npm run preview`; their output is committed under `docs/lighthouse/`
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
to skip the two end-to-end drills) is how the tests prove themselves: each
entry in `scripts/red-drills.mjs` breaks one behaviour, runs the test or
gate that owns it, and restores the file. A drill whose command stays green
fails the run. Reports are written to `docs/red-drill/`.

## Environment variables and bindings

| Name                     | Kind       | Where                                          | Purpose                                                                        |
| ------------------------ | ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `APP_ENV`                | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | `development`, `test`, `staging`, `production`                                 |
| `APP_URL`                | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Public origin; auth links and the same-origin guard                            |
| `EMAIL_PROVIDER`         | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | `console` (dev/test only) or `cloudflare`                                      |
| `EMAIL_FROM`             | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Sender address; must be on a zone in the account                               |
| `BETTER_AUTH_SECRET`     | secret     | `.dev.vars`, `wrangler secret put`             | Signs sessions and tokens; at least 32 random characters                       |
| `TURNSTILE_SITE_KEY`     | var        | `wrangler.jsonc` `vars`, `.dev.vars`           | Optional; Turnstile widget key, served to the client via `/api/config`         |
| `TURNSTILE_SECRET_KEY`   | secret     | `.dev.vars`, `wrangler secret put`             | Optional; must be set together with the site key                               |
| `GOOGLE_OAUTH_CLIENT_ID` | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Google Drive picker. Public client id, served via `/api/config`      |
| `GOOGLE_PICKER_API_KEY`  | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Google Picker API key (restrict it to the Picker API + your origins) |
| `GOOGLE_PICKER_APP_ID`   | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Google Cloud project number the Picker needs                         |
| `MICROSOFT_CLIENT_ID`    | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; OneDrive picker. Microsoft Entra SPA app client id                   |
| `DROPBOX_APP_KEY`        | var        | `wrangler.jsonc` `env.production`, `.dev.vars` | Optional; Dropbox Chooser app key                                              |
| `DB`                     | D1         | `wrangler.jsonc` `d1_databases`                | Users, organizations, members, invitations, audit log, presets                 |
| `BUCKET`                 | R2         | `wrangler.jsonc` `r2_buckets`                  | Logos, photos and thumbnails; never public, streamed via the API               |
| `AUTH_RATE_LIMITER`      | ratelimit  | `wrangler.jsonc` `ratelimits`                  | 10 requests / 60 s per IP on credential endpoints                              |
| `API_RATE_LIMITER`       | ratelimit  | `wrangler.jsonc` `ratelimits`                  | 120 requests / 60 s per IP on other auth endpoints                             |
| `SEND_EMAIL`             | send_email | `wrangler.jsonc` `send_email`                  | Cloudflare Email Sending; required when provider is `cloudflare`               |

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

Separate from organization roles, a user whose Better Auth `role` is `admin`
is a platform administrator. The first one is promoted with a single D1
update (see [docs/runbook.md](docs/runbook.md)); after that the console at
`/app/admin` can:

- search users by email, ban and unban them with a reason (a banned user's
  sessions are revoked and sign-in is refused), grant or remove the platform
  role, and sign a user out everywhere;
- list every organization with its member count, photo count and storage;
- browse the global audit trail, including the admin actions themselves.

Every admin action is recorded in the audit log with the administrator as
the actor. The Worker enforces the role on its own admin routes
(`requirePlatformAdmin`) and Better Auth's admin plugin enforces it on user
management.

### Bot protection

When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both set, sign-up
and password-reset requests must carry a Cloudflare Turnstile token in the
`x-captcha-response` header; the Worker verifies it with Cloudflare before
Better Auth handles the request. The sign-up and forgot-password pages render
the widget and keep their submit button disabled until it produces a token.
Without the keys the deployment runs without a challenge and the pages show
nothing extra. Create a widget for `watermark.blowmoney.net` in the Cloudflare
dashboard under Turnstile, put the site key in `wrangler.jsonc`
(`env.production.vars`) and the secret in
`wrangler secret put TURNSTILE_SECRET_KEY --env production`.

## Watermark library

Presets belong to an organization and are shared by all of its members. A
preset is a mark plus placement, contrast and style settings
(`src/shared/watermark.ts`):

- **Marks:** text in any of 51 bundled font families (Fontsource, OFL or
  Apache licensed, latin subset, loaded only when chosen), up to four lines,
  with `{date}`, `{time}` and `{filename}` tokens filled in per photo from
  the file's last-modified time and name; a Unicode glyph from eight groups
  (legal, stars, arrows, shapes, checks, nature, objects, currency); one of
  70 lucide icons; an uploaded logo; a signature drawn with a finger or mouse
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

Logos are PNG, JPEG or WebP up to 5 MB, at most 50 per organization. The
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
canvas), add a preset, and adjust it for this photo only: drag the mark,
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
large batch stays responsive. When it settles, download everything as one ZIP
(tree preserved), save to the gallery, share or download file by file, and
download a **CSV report** of every job. Nothing is uploaded unless you save the
results to the gallery.

One photo can be **adjusted on its own**: "Adjust" opens it in the full editor
(embedded, no export step); "Apply to this photo" re-runs just that job with
the edits, "Apply to all photos" reuses them across the batch, and "Remove
override" restores the batch settings. An adjusted row is marked **Custom**.

**Watch a folder** (desktop browsers with the File System Access API): pick an
input and an output folder and any new photo dropped into the input is
watermarked with the ticked presets and written to the output while the page
stays open — a hands-free hot folder no competitor offers.

## Video

Watermark MP4, WebM and MOV in the browser with WebCodecs — the same presets,
placement and contrast as photos, on every frame, with the audio kept. Files up
to 2 GB, 600 s and 3840 px are accepted; anything larger is refused before a
single frame is decoded. "Quality" is a bitrate ladder (Low 2, Standard 6, High
12 Mbit/s at 1080p, scaled by pixel count) and the output fits Original, 1080p
or 720p. The container follows whichever codec the browser can encode — MP4
(H.264/HEVC) or WebM (VP9/AV1) — and is shown before you start ("Saves as MP4
(H.264)"). Audio is copied without re-encoding when it fits the container
(AAC→MP4, Opus→WebM), otherwise re-encoded at 128 kbit/s. Everything runs in a
dedicated Web Worker; nothing is uploaded and the gallery does not store videos.
Browsers without a WebCodecs `VideoEncoder` (Firefox ≤ 129, older Safari) see an
unsupported message; Chrome, Edge and Safari 17+ can encode.

## Documents

Watermark every page of a PDF with the same presets as photos. Drop or pick up
to 50 PDFs (≤ 50 MB, ≤ 200 pages each); the ticked layers are rasterised once
per distinct page size at 150 dpi and drawn on every page with `pdf-lib`. Smart
placement reads a photo, so on a blank page it falls back to a bottom-right
anchor (the tool says so); choose a corner or a custom position instead. Output
is `<name>-watermarked.pdf`, one per input or a ZIP for several, with the Info
dictionary kept, `Producer` set to "Watermark Pro" and `ModDate` refreshed.
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
only**: a JPEG or WebP re-encode would destroy it, so the option is refused for
lossy formats, and a message too large for the photo blocks the export instead
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

Limits: 40 MB per photo, PNG, JPEG or WebP, 10 000 photos and 2 GB per
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
secret) and carry their expiry, so nothing secret is stored and a link can be
shown again later; revocation is recorded in the database. Public routes are
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

Every string comes from the i18next catalogues under `src/client/locales/`, and
an ESLint gate (`no-literal-string`) stops an untranslated string reaching a
component. **To add a language:** copy `locales/en/common.json`, translate it
(the terms in `locales/GLOSSARY.md` must stay consistent; keep every
`{{placeholder}}` and provide the plural forms `Intl.PluralRules(<locale>)`
lists), add the code to `SUPPORTED_LOCALES` in `src/shared/locales.ts`, then run
`npm run quality` — the completeness test and `i18n:check` verify it. See
`docs/i18n/` for the translation-quality record. Date and number formatting and
the error/email text are not yet localised (PLAN §4).

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

Production is the `production` environment in `wrangler.jsonc`. Releases
are deployed from CI when a version tag is pushed:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/deploy.yml` runs the full quality chain and the Playwright
suite on the tagged commit, then `npm run deploy` in the `production` GitHub
environment. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers
Scripts, D1, R2, Email Sending and Zone DNS edit rights for the account) and
`CLOUDFLARE_ACCOUNT_ID`. The same command works from an authenticated
workstation:

```bash
npm run deploy   # CLOUDFLARE_ENV=production vite build → remote D1 migrations → wrangler deploy
```

The deploy script applies migrations non-interactively and refuses to upload
the Worker while any migration is still pending, so the schema is never
behind the code that needs it. Rollback, secret rotation, D1 Time Travel, log
tailing and the incident playbook are in [docs/runbook.md](docs/runbook.md).

One-time setup, already done for this account on 2026-09-06: `wrangler d1
create watermark-pro` (id in `wrangler.jsonc`) and
`wrangler secret put BETTER_AUTH_SECRET --env production`. The Worker is
routed to the Custom Domain `watermark.blowmoney.net`; wrangler created the
DNS record and certificate on the first deploy. The `workers.dev` subdomain is
disabled.

The top-level configuration is the local-development one and is named
`watermark-pro-dev` on purpose: a stray `wrangler deploy` without the
environment creates an unrouted Worker instead of overwriting production.

Useful production commands:

```bash
npx wrangler tail --env production --format pretty
npx wrangler d1 migrations list watermark-pro --remote --env production
```

Email Sending is enabled for `watermark.blowmoney.net`
(`wrangler email sending list blowmoney.net`); the sender is
`no-reply@watermark.blowmoney.net`. If a sender domain is ever changed it must
be enabled the same way first, otherwise sign-ups still succeed but the
verification email is logged as rejected instead of delivered.

## Security

See [SECURITY.md](SECURITY.md) for the reporting process and the list of
controls, and [docs/threat-model.md](docs/threat-model.md) for the STRIDE
review of every trust boundary. Headline items: strict CSP on both API and
static responses (the only third-party origin is `challenges.cloudflare.com`
for Turnstile), a same-origin guard on every state-changing request, HttpOnly
SameSite session cookies, mandatory email verification, rate limiting on
credential and public share endpoints, optional Turnstile on sign-up and
password reset, server-side RBAC on every route, a platform admin role with
audited bans and role changes, an append-only audit trail, signed share
tokens, fail-closed configuration validation, secret scanning in the hook and
in CI, dependency audit and dependency review on pull requests, semgrep, exact
pins with a seven-day release age, GitHub Actions pinned to commit SHAs, and
exports that carry no EXIF (see "Exports and metadata").

## Troubleshooting

- **`tsc -b` reports stale errors after renaming files.** Delete
  `node_modules/.tmp` (build info cache) and rerun.
- **The `workers` test project fails with "compatibility date not supported".**
  `compatibility_date` in `wrangler.jsonc` must not exceed the newest date the
  Workers pool's bundled workerd supports (2026-08-22 for pool 0.22.0).
- **Sign-up returns 403 locally.** The request origin must equal `APP_URL`;
  serve the app from `http://localhost:5273`.
- **Sign-up returns 500 `invalid_configuration`.** `.dev.vars` is missing or
  `BETTER_AUTH_SECRET` is shorter than 32 characters.
- **Tables do not exist.** Run `npm run db:migrate:local`.
- **`npm run security:sast` says semgrep is not found.** Add your Python
  `Scripts` directory to `PATH` (on Windows,
  `%APPDATA%\Python\Python3xx\Scripts`).
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
