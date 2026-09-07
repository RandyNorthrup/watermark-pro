# Feature plans M11–M19: how to work them

These documents are written for an implementing agent that has not seen this
repository before. Read them in this order: `AGENTS.md`, `CLAUDE.md`,
`PLAN.md` §1–§5 and §7, this file, then the milestone you are on. Every
milestone here has one file, `docs/plans/mNN-*.md`, that is the full
specification: behaviour, data model, algorithms, files, tests, red drills,
docs, security notes and the certification checklist. `PLAN.md` §6 carries the
short entry and the tick-boxes; tick them there.

Goal of the whole series (Randy, 2026-09-06): implement every feature the
market research in `docs/competitor-research.md` found missing, then exceed
the competitors, then and only then do the performance milestone (M19), so
nothing is optimised twice. Pricing is out of scope; the product stays free.

## Order and dependencies

| Milestone | Title                                             | Depends on | Spec                             |
| --------- | ------------------------------------------------- | ---------- | -------------------------------- |
| M11       | Photo adjustments and orientation                 | —          | `m11-photo-adjustments.md`       |
| M12       | Mark engine: arc text, effects, shapes, borders   | M11        | `m12-mark-engine.md`             |
| M13       | Metadata: EXIF tokens, keep/strip policy, DPI     | M11        | `m13-metadata.md`                |
| M14       | Bulk power: per-photo override, folders, renaming | M11, M13   | `m14-bulk-power.md`              |
| M15       | Preset files, logo tools, invisible mark          | M12, M13   | `m15-presets-logos-invisible.md` |
| M16       | Import and share surfaces                         | M14        | `m16-import-and-share.md`        |
| M17       | Video and PDF watermarking                        | M12, M13   | `m17-video-and-pdf.md`           |
| M18       | Localisation                                      | all above  | `m18-localisation.md`            |
| M19       | Performance and production hardening              | all above  | `m19-performance.md`             |

Do them in this order. Certify each (its checklist in `PLAN.md`) before
starting the next. Where a spec says "ask Randy", stop and ask in one line;
everything else is yours to decide within the spec.

## The loop for one milestone

1. Read the spec end to end. List the constants it names; they go in
   `src/shared/constants.ts` (shared), `src/shared/watermark.ts` (spec
   schema limits) or a module-level `const` with a doc comment (module-local).
2. Dependencies first. For each new package: `npm info <pkg> version
peerDependencies license`, confirm the peer range against what is
   installed (`npm ls <peer>`), install with an exact pin (`npm install
<pkg>@<version> --save-exact`), and add the row to `PLAN.md` §3.1. Never
   `--legacy-peer-deps`. `min-release-age=7` in `.npmrc` will refuse a version
   younger than a week; take the previous one and note it.
3. Schema and shared types, with backward compatibility: every new field on
   a stored shape (`watermarkSpecSchema`, `EditorDocument`, bulk settings)
   gets a `.default(...)` or is optional, so presets saved before the field
   existed still parse. Add a unit test in `src/shared/watermark.test.ts`
   that parses an old-shape object.
4. Engine, then library/UI, then bulk, then e2e, in that order, running the
   nearest test file after each step:
   - engine: `node node_modules/vitest/vitest.mjs run --project browser <file>`
   - worker: `--project unit-worker` (Node, memory stores) and
     `--project workers` (real D1/R2 in workerd; `*.workers.test.ts`)
   - pages: `--project unit-client` (jsdom; page tests render the real
     router with the fakes in `src/client/test-support/`)
5. Red drills: add one entry per new behaviour to `scripts/red-drills.mjs`
   (see "Writing a drill" below) and run each alone:
   `node scripts/red-drill.mjs "<part of the name>"`. It must print `red`.
   `SURVIVED` means the test does not catch the defect; fix the test.
   `errored` means the command broke rather than failed; fix the drill.
6. Docs in the same change: README section, `CHANGELOG.md` entry under
   `[Unreleased]`, `PLAN.md` §6 checklist and §8 log rows for every bug a
   test or drill caught, `SECURITY.md` and `docs/threat-model.md` when a
   trust boundary changes, `PLAN.md` §9 for any escape hatch.
7. Certification, in this order, all on the final tree:
   1. `npm run quality` (format, lint, css, types, dead code, cycles, dup,
      secrets, audit, all Vitest projects with coverage, build)
   2. semgrep: `npm run security:sast` (on Randy's machine semgrep lives in
      `%APPDATA%\Python\Python314\Scripts`, append it to `PATH` first)
   3. `npm run test:e2e` (all four device projects; port 5173 must be free)
   4. `npm run build && npm run preview` in the background, then
      `node scripts/screenshots.mjs <milestone> all` and
      `CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" LIGHTHOUSE_RUNS=5 node scripts/lighthouse.mjs <milestone>`
      and the same with `mobile`; stop the preview afterwards
   5. `node scripts/red-drill.mjs` (every drill; report lands in
      `docs/red-drill/<local date>.md`)
   6. Fill the numbers into the `PLAN.md` checklist; tick the boxes only for
      what actually ran and passed. A gate that did not run is written as
      "not run" with the reason.
8. Commit (from PowerShell or Bash; the pre-commit hook runs gitleaks and
   lint-staged), push `main`, wait for CI, tag `vX.Y.Z` (minor bump per
   milestone), and create the GitHub release from the CHANGELOG entry. The
   tag runs the deploy workflow.

## Repository facts you will need

- Engine (`src/client/engine/`): pure TypeScript, no React. `pipeline.ts`
  is the entry: `prepareCanvas` (crop + resize onto a fresh canvas),
  `analyseSource` (256 px luminance map for placement and contrast),
  `composeMark` (one mark), `applyWatermark` (everything, returns
  `ApplyResult { blob, width, height, marks }`). Drawing is in `render.ts`
  through the `Canvas2D` type (`canvas.ts`), which is satisfied by both
  `OffscreenCanvasRenderingContext2D` (worker) and the DOM context
  (main-thread `LocalEngine`, used where `OffscreenCanvas` is missing:
  Safari before 16.4 and Playwright's Windows WebKit). Never use an API that
  only one of the two contexts has; `ctx.filter`, `ctx.letterSpacing` and
  `ctx.fontKerning` are not available in every WebKit, so pixel and glyph
  work is done by hand.
- The worker protocol (`protocol.ts`) and `engine.ts` (`ApplyInput`,
  `toApplyRequest`, `closeInputBitmaps`) are the only way in. New per-photo
  settings travel in `Transform` (`pipeline.ts`), new per-mark settings in
  `WatermarkSpec` (`src/shared/watermark.ts`, Zod, shared with the Worker).
- Editor: `src/client/editor/state.ts` (`EditorDocument { crop, resize,
layers }`, reducer with undo history), `src/client/components/editor/*`
  (`editor.tsx` orchestrates; `use-renderer.ts` renders previews through
  `lib/preview.ts` `PreviewRenderer`; `mark-overlay.tsx` and
  `crop-overlay.tsx` are the pointer surfaces; `export-panel.tsx` downloads,
  shares and saves).
- Designer: `src/client/components/designer/*` edits one `WatermarkSpec`
  (`watermark-designer.tsx` tabs: Text / Symbol / Logo / QR code; `style-panel.tsx`,
  `placement-panel.tsx`, `preview-panel.tsx`). Spec edit helpers in
  `src/client/lib/spec-edit.ts`.
- Bulk: `src/client/bulk/{queue,processor,runtime,worker-pool,zip}.ts` and
  `src/client/components/bulk/{bulk-tool.tsx,use-bulk-queue.ts}`.
  `BulkRuntime.run(file, specs, settings, signal)`; `BulkSettings { output,
fitLongestSide }`.
- Text tokens: `resolveTextTokens` in `src/shared/watermark.ts`,
  applied per photo by `src/client/lib/spec-tokens.ts` (`specForPhoto`).
- Worker API: Hono routes in `src/worker/routes/*.ts`; stores behind
  interfaces in `src/worker/stores.ts` with D1 implementations in
  `src/worker/db/` and memory implementations in
  `src/worker/test-support/memory-stores.ts` (Node tests run real Better Auth
  on the memory adapter). Every route needs positive and negative RBAC
  tests (`requirePermission({ watermark: ['update'] })` etc., see
  `src/worker/auth/permissions.ts`). Request/response shapes are Zod schemas
  in `src/shared/api.ts`. Never `(await response.json()) as T` in tests;
  parse with the schema.
- Database changes: edit `src/worker/db/schema.ts`, `npm run db:generate`,
  commit the migration, `npm run db:migrate:local`. `worker-configuration.d.ts`
  is regenerated by `npm run cf-typegen` after `wrangler.jsonc` changes.
- Routes: files under `src/client/routes/` (TanStack Router file routes);
  `src/client/routeTree.gen.ts` is regenerated by every dev/build/test run
  and is committed. New app pages go in the sidebar/menu lists in
  `src/client/components/app-shell.tsx`; the phone tab bar keeps four items.
- Page tests: `src/client/routes/app/*-page.test.tsx` mock
  `../../lib/auth-client` with `test-support/fake-auth-module`, the library
  API with `installLibraryApi`, the bulk runtime, thumbnails and downloads.
  `renderApp('/app/...')` renders the real router. Add fakes next to the
  existing ones rather than mocking inside a test.
- e2e (`e2e/*.spec.ts`): import `test`/`expect` from `./support`.
  `createWorkspace` signs up, verifies through the dev mailbox and creates an
  organization; `navigateTo(page, 'Bulk')` clicks whichever navigation the
  layout shows; `expectAccessible(page)` runs axe and asserts no horizontal
  scroll; `pngFixture`, `downloadBytes`, `pngSize` build and inspect files.
  Every journey runs on `desktop-chrome`, `iphone`, `ipad`, `android`; keep
  each under the 60 s test budget (WebKit is slow; keep fixtures small).
- Screenshots and Lighthouse scripts sign up their own users and create
  their own data; `scripts/lighthouse.mjs` proxies the preview through
  `scripts/lib/compressing-proxy.mjs` for brotli. Budgets are in `PLAN.md`
  §5.5; until M19 they stay at desktop 90/95/95 and mobile 85/95/95, and a
  page that drops below them blocks certification of the milestone that
  caused it.

## Writing a drill

An entry in `scripts/red-drills.mjs`:

```js
{
  name: 'Adjustments: brightness ignored',
  file: 'src/client/engine/adjust.ts',
  find: '  const offset = brightness * BRIGHTNESS_RANGE\n',
  replace: '  const offset = 0\n',
  ...browser('src/client/engine/adjust.browser.test.ts'),
},
```

`find` must occur exactly once in `file` (the runner refuses otherwise);
`replace` should be a plausible mistake, not nonsense. Use `unitClient`,
`unitWorker`, `browser`, `workers`, `gate` or `e2e(project, file)` from the
top of the manifest. Escape backslashes with `String.raw` when the fragment
contains `\n` as source text. An e2e drill rebuilds and serves the app, so
it costs a minute; prefer a unit or browser drill when one exists.

## Things that bit us (do not rediscover them)

- Port 5173 is the only origin the same-origin guard accepts. Playwright
  starts its own preview on it; kill any stray `vite preview` first
  (`Get-NetTCPConnection -LocalPort 5173` in PowerShell).
- Playwright's Windows WebKit has no `OffscreenCanvas` and no
  `navigator.share`; Linux WebKit in CI has both. Code paths must work in
  both; tests must not assume either.
- The Bash tool used by Claude Code mangles backslashes and `\n` inside
  heredocs. Write files with the Write/Edit tools, not `cat <<EOF`.
- `unicorn` rules are strict: boolean names start with `is`/`has`/`can`,
  no top-level side effects in modules, `String.raw` for escaped
  backslashes, no nested calls deeper than three, no `await` member access.
  Run `npx eslint <file>` early.
- `react-refresh/only-export-components`: component files export
  components (and constants); helpers go in `src/client/lib/`.
- `knip` flags unused exports, files and dependencies. Add a dependency
  only when it is imported; add `ignoreDependencies` in `knip.jsonc` only
  with a §9 row.
- Coverage thresholds are 90/90/90/85 across jsdom + Node; browser and
  workerd projects do not count. Put logic in modules the jsdom or Node
  projects can import (pure functions), keep DOM/canvas glue thin.
- Lighthouse mobile is noisy on a busy machine; `LIGHTHOUSE_RUNS=5` takes
  the median. Do not tune budgets to the noise.
- CI's hosted runner has two cores; Playwright runs two workers there. A
  journey that needs more than ~40 s locally will time out in CI.
- The pre-commit hook runs lint-staged with `--max-arg-length=4000`; very
  large commits are fine, but commit per milestone, not per series.
