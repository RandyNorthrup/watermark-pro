# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Entries record what happened, not
what was planned; superseded entries stay.

## [Unreleased]

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
- Share dialog with Copy link and Share… (the platform share sheet through
  the Web Share API, clipboard fallback); `/app/shares` to review, copy,
  share and revoke links; the public `/share/:token` album page with a
  lightbox, downloads and a "Share this link" button.
- Audit entries `share.created` and `share.revoked`.

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
  (sign-up → verify → organization → invite → accept → viewer denied) with axe
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
