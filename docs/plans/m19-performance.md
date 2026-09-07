# M19 — Performance and production hardening

## Goal

Every page paints fast on a slow phone, the budgets say ≥ 90 instead of
≥ 85, a bundle-size gate stops regressions, the app works offline for the
editor once installed, and the whole product is re-certified against the
competitor list after the feature series. This milestone is last so that
every feature is measured once, in its final shape.

Measured before this series (M10, mobile, simulated slow 4G, median of
five): landing FCP 2.7 s / LCP 2.9 s / 91; library FCP 2.7 s / LCP 3.2 s /
89; editor FCP 2.9 s / LCP 3.5 s / 85. Cause: a client-rendered SPA paints
nothing until ~220 kB gzipped JS runs; signed-in pages then wait on three
serial fetches (session → organization list → organization detail and
role) before rendering.

## Targets (`PLAN.md` §5.5 after M19)

| Metric                                      | Budget                                     |
| ------------------------------------------- | ------------------------------------------ |
| Lighthouse Performance, mobile, every page  | ≥ 90 (median of five)                      |
| Lighthouse Performance, desktop, every page | ≥ 95                                       |
| Accessibility / Best practices              | 100 / ≥ 95                                 |
| FCP mobile (simulated slow 4G)              | ≤ 1.8 s on public pages, ≤ 2.2 s signed in |
| LCP mobile                                  | ≤ 2.5 s everywhere                         |
| Initial JS for `/` (gzip)                   | ≤ 90 kB                                    |
| Initial JS for `/app/*` shell (gzip)        | ≤ 140 kB                                   |
| Route chunk, any (gzip)                     | ≤ 60 kB excluding the engine worker        |
| CLS                                         | ≤ 0.02                                     |
| TBT mobile                                  | ≤ 150 ms                                   |

## Work, in order (measure after each step; keep what helps)

### 1. Paint before JavaScript

- `index.html` carries a static, styled skeleton of the app frame: the
  header bar (brand mark inline SVG, three placeholder circles), the
  phone tab bar with its four labels, and a content area with three
  shimmering blocks, all in a `<style>` block of ≤ 2 kB with the
  theme-colour tokens duplicated from `app.css` (`--color-surface`,
  `--color-line`) and the same safe-area maths. React's first render
  replaces it (`#root` innerHTML). A `prefers-color-scheme` media query
  keeps the skeleton dark in dark mode, and the theme script from
  `lib/theme.ts` (the part that reads the stored theme) is inlined as the
  first `<script>` so the skeleton never flashes the wrong theme (CSP:
  the inline script needs a hash in `script-src`; compute it at build
  time with a small Vite plugin in `vite.config.ts` that writes the hash
  into `public/_headers` — `_headers` is a static file, so the plugin
  emits it into `dist/client/_headers` from a template).
- Public pages (`/`, `/login`, `/signup`, `/share/:token`) are
  pre-rendered to static HTML at build time with `vite-plugin-prerender`
  or, simpler and dependency-free, a script (`scripts/prerender.mjs`)
  that launches the built app in headless Chromium, captures the rendered
  HTML for those routes and writes `dist/client/<route>/index.html`.
  Hydration: TanStack Router supports `hydrate`; if hydration mismatches
  prove costly, fall back to "render into the pre-rendered markup" (React
  `createRoot` replaces it; the pre-rendered HTML is still the first
  paint). The share page is dynamic (token) so it gets the skeleton only.

### 2. Render signed-in pages before the fetch chain

- Persist the session, organization list and active organization queries
  with `@tanstack/query-persist-client-core` + `idb-keyval`-free storage
  (a 40-line `localStorage` persister; the data is small and non-secret:
  ids, names, roles) with `staleTime` 0 and `gcTime` 24 h: on a return
  visit the shell renders from cache immediately while the real requests
  revalidate; on mismatch (signed out, organization removed) the router's
  `beforeLoad` redirects as today.
- Collapse the chain: one `GET /api/me/bootstrap` (new) returns session,
  organizations, active organization and role in a single round trip;
  the client uses it for `beforeLoad`; the individual endpoints stay for
  their own pages. Better Auth's own endpoints remain the source of truth
  for mutations.
- The editor and designer routes render their frame (header, tabs, the
  sample scene) before presets arrive (`useSuspenseQuery` → `useQuery`
  with a skeleton in the preset picker), so LCP is the sample scene at
  JS-ready time.

### 3. JavaScript diet

- Measure with `scripts/bundle-report.mjs` (new: reads
  `dist/client/.vite/manifest.json`, prints gzip and brotli sizes per
  entry and per route with the initial-load set marked).
- Zod on the boot path: the client parses API responses with the shared
  schemas (25 kB gz). Keep validation but move the schemas the shell
  needs (`session`, `organization`, `publicConfig`) to a hand-written
  `validate.ts` (a 60-line structural checker for those three shapes)
  and lazy-load Zod with the first route that needs it. Do not remove
  validation.
- Radix UI chunk (54 kB gz): audit which primitives the shell needs
  (Dialog for the menu sheet, DropdownMenu for the account menu); move
  `Select`, `Slider`, `Tabs`, `RadioGroup`, `Switch` imports into the
  routes that use them so the `ui` chunk group splits into `ui-shell` and
  `ui-editor`.
- `better-auth` client (14.5 kB gz): needed on every signed-in page for
  the session; check for tree-shaking of unused plugins (organization
  and admin plugins are needed; `two-factor` etc. must not be included).
- `lucide-react`: confirm every icon import is a named import (tree-shaken)
  and that no dynamic `icons` map is bundled in the shell.
- Fonts: Inter variable is 49 kB; keep it, but `font-display: optional`
  on the landing page's first paint is not acceptable (brand); keep
  `swap` with the metric-matched fallback (already done).

### 4. Offline editor (installed app)

A real service worker (`src/client/sw.ts`, built by Vite as a separate
entry, registered from `main.tsx` in production only) with a precache of
the hashed assets manifest (generated at build: `dist/client/.vite/manifest.json`
→ list injected via a Vite plugin), network-first for HTML and API
(`no-store` responses are never cached), cache-first for hashed assets
(immutable by name), and no caching of `/api/*`. The editor, designer
preview and bulk tool then work without a network when installed; the
library needs the network and says so ("You are offline; presets from the
last visit are shown" using the persisted query cache). Update flow: a
new deploy → the worker installs the new manifest → the app shows
"Update available, reload". The share-target worker from M16 merges into
this one (single worker, scope `/`). CSP `worker-src 'self'` stays.
Threat model: the worker caches only same-origin hashed assets; a
compromised deploy is not made worse by it; `Clear-Site-Data` is sent
on sign-out (the Worker adds `Clear-Site-Data: "cache", "storage"` to the
sign-out response so a shared device does not keep the cache; verify
Better Auth allows a response hook or wrap the route).

### 5. Gates

- `scripts/bundle-budget.mjs` in `npm run quality`: fails when any
  budget in the table above is exceeded (sizes from the manifest and
  `gzip-size` computed in-process with `node:zlib`; no dependency).
- Lighthouse budgets raised in `scripts/lighthouse.mjs`; the scripts also
  assert FCP/LCP/CLS/TBT numeric budgets, not only the score.
- A Playwright "cold load" test measures `performance.getEntriesByType('navigation')`
  and `largest-contentful-paint` on `/app/editor` with a CPU throttle of
  4× (`page.emulateMedia` cannot throttle; use CDP
  `Emulation.setCPUThrottlingRate` on desktop-chrome only) and asserts
  LCP < 2.5 s; recorded, not budget-blocking in CI (noise), blocking
  locally at certification.

### 6. Production hardening (the non-perf part of "production grade")

- Dependency refresh: `npm outdated`; upgrade everything within peer
  ranges after checking release notes; re-pin; run the whole gate set.
- Observability: Workers Logs are already on (`observability.enabled`
  in `wrangler.jsonc`). Add a request id to every Worker log line
  (`crypto.randomUUID()` per request, returned as `X-Request-Id`), and
  have the client report uncaught errors and unhandled rejections to
  `POST /api/client-errors` (rate limited, 2 kB max, no PII beyond the
  message, stack top frame and route; stored 7 days in a new `client_error`
  table, listed on the admin console). No third-party error service.
- Health and uptime, without any dashboard: a scheduled trigger in
  `wrangler.jsonc` (`triggers.crons: ["*/5 * * * *"]`) runs a `scheduled`
  handler that fetches `/api/health` and does one D1 read, writes the
  result to a `health_check` table (kept 7 days) and logs a failure
  line; the admin console shows the last 24 hours.
- A11y and security re-audit: axe on every page in every language is
  already in e2e; run `npm run security:sast`, `npm audit`, and re-read
  `SECURITY.md` and the threat model against the M11–M18 additions;
  update the "Reviewed" date at the top of the threat model.
- Competitor re-check: re-run the research prompt from
  `docs/competitor-research.md` (a subagent with web access; same
  product list plus any new entrant found), update the feature matrix
  with a "Watermark Pro" column, and list anything still missing in
  PLAN §4. The README status line then says which competitor features
  the product matches and exceeds, with the date.

## Files

New: `scripts/{bundle-report,bundle-budget,prerender}.mjs`,
`src/client/sw.ts`, `src/client/lib/{query-persister,validate}.ts` (+
tests), `src/worker/routes/{bootstrap,client-errors}.ts` (+ tests),
`src/worker/db/client-error-store.ts` + migration, `e2e/performance.spec.ts`.

Modified: `index.html`, `vite.config.ts`, `public/_headers` (template),
`main.tsx`, `router.ts`, `routes/app/route.tsx`, `lib/queries.ts`,
`app-shell.tsx`, `scripts/lighthouse.mjs`, `package.json` (`quality`
gains `bundle:budget`), PLAN §5.5, §3.2, §9, README (offline, update
flow), SECURITY.md, threat model.

## Tests

Unit: `validate.ts` accepts the three shapes and rejects malformed ones
(same cases as the Zod schemas; keep both in sync with a test that feeds
the same fixtures to both); persister round-trip and expiry; bootstrap
route (RBAC: any session; shape parsed with the Zod schema in the test);
client-errors route (rate limit, size cap, no stack beyond one frame
stored); `bundle-budget.mjs` fails on a fabricated manifest over budget.

e2e: offline journey (desktop-chrome): install-free check — load
`/app/editor`, `context.setOffline(true)`, reload, the editor renders and
watermarks the sample scene; `setOffline(false)`. Cold-load metrics test
as above. Everything else re-runs.

Red drills:

| Name                                 | Mutation                                        | Command                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Budget: bundle over budget passes    | `bundle-budget.mjs` compares with `>=` reversed | gate `bundle:budget`                                                                                                                                             |
| Validate: malformed session accepted | `validate.ts` returns true for any object       | unit `validate.test`                                                                                                                                             |
| Persister: expired cache served      | expiry check removed                            | unit `query-persister.test`                                                                                                                                      |
| SW: API responses cached             | remove the `/api/` exclusion                    | unit-client `sw.test` (fake caches)                                                                                                                              |
| SW: sign-out keeps the cache         | drop `Clear-Site-Data`                          | unit-worker `auth-flow.test`                                                                                                                                     |
| Skeleton: wrong theme flashes        | remove the inline theme script                  | e2e `performance.spec` (dark-mode screenshot of the first frame: `page.emulateMedia({ colorScheme: 'dark' })`, assert the skeleton background is the dark token) |

## Deferred audits (from M12–M18)

e2e, Lighthouse and screenshots were deferred from every feature milestone
to here (Randy, 2026-09-06/07). M19 captures and budgets them all in one
pass: run the full `npm run test:e2e` (all four device projects) once, then
`scripts/screenshots.mjs m19 all` and `scripts/lighthouse.mjs m19` (and
`mobile`) over every page **including the new tools and screens each
milestone added**, and the `/app/library/new` bundle-size budget (≤ 5 kB gz
growth per feature milestone). As each milestone lands, append the screens
and flows it introduced to this list so nothing is missed:

- M11: editor Adjust tab (already captured under `docs/screenshots/m11/`).
- M12: designer **Text effects** (Solid/Outline/Emboss/Engrave, curve,
  letter spacing), the **Shape** mark tab, the **Frame** control (editor
  Adjust tab and bulk Photo adjustments), and **random placement** with
  jitter; the Emoji glyph group in the symbol picker. e2e: a text-effects /
  shape / frame / random journey. Confirm the `/app/library/new` JS grew
  ≤ 5 kB gz. (Icon search and the Shuffle button were carried forward, see
  PLAN.md M12.)
- M13: the editor Export tab and the bulk output settings with the **Metadata**
  policy radio group (strip / keep-except-location / keep, WebP disabled); the
  designer **Insert detail** token menu. e2e: upload the EXIF fixture, stamp
  `{camera} {iso}`, export JPEG "keep except location", and confirm in Node
  (via `exifr`) that Model is present and GPS is gone.
- M14: the bulk **folder input** and folder drag-and-drop; the **file-name
  pattern** field with its live example; **Pause/Resume** on a running batch;
  the **Download report** (CSV) button; the "Show all" row expansion; the
  per-photo **override** dialog (full editor embedded, "Custom" badge) and the
  desktop **watch-folder** card (delivered in 1.6.1 — see PLAN.md M14).
- M15: library Import dialog; the designer logo-prepare panel; `/app/verify`.
- M16: the import buttons (camera, "From a link") on the editor and bulk tools;
  `/privacy` and `/terms`. (The cloud pickers land in a follow-up with the OAuth
  registration; add them to this list then, and confirm best practices ≥ 95 with
  the picker CSP origins.)
- M17: `/app/video` and `/app/documents`.
- M18: every page in `ar` (right-to-left) at three widths, plus the language
  menu.

If a milestone changed a page already in the shot list, note that too so
M19 re-reviews it.

## Certification checklist

- [ ] every §5.5 budget met on every page (all tools and screens from
      M11–M18 included), mobile and desktop, median of five, recorded under
      `docs/lighthouse/m19/`
- [ ] bundle report committed under `docs/bundle/m19.md`; budget gate green
- [ ] offline journey green; update flow checked by hand on the
      production build (two deploys) and recorded in §8
- [ ] competitor re-check done; matrix updated; README status line updated
- [ ] full gate set, full drill, full device matrix, screenshots in `en`
      and `ar`
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 2.0.0, tag, deploy, release
