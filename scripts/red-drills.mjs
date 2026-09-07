/**
 * The red drill manifest (PLAN.md §3.2, "Red drill"). Each drill breaks one
 * behaviour on purpose, in one file, and names the command that must then
 * fail. A drill whose command still passes is a "survivor": a test that
 * would not notice the defect it exists to catch. `scripts/red-drill.mjs`
 * applies every drill in turn, restores the file, and refuses a green run
 * with any survivors.
 *
 * `find` must occur exactly once in `file` so a drifted source line fails
 * loudly instead of silently mutating nothing. Keep `find` on the smallest
 * distinctive fragment; keep `replace` a plausible mistake, not nonsense,
 * so a survivor means something.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Commands are Node entry files plus arguments, run by `scripts/red-drill.mjs`
 * with the current Node binary and no shell: `npm run` and `npx` are
 * `.cmd` shims on Windows, which need a shell, and a shell is what the
 * security scanners rightly object to.
 */
const VITEST = ['node_modules/vitest/vitest.mjs', 'run']
const PLAYWRIGHT = ['node_modules/@playwright/test/cli.js', 'test', '--reporter=line']
/**
 * npm's own CLI: the one running this script under `npm run test:drill`, or
 * the copy that ships beside the Node binary otherwise.
 */
const NPM_CLI =
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
if (!existsSync(NPM_CLI)) {
  throw new Error(`npm CLI not found at ${NPM_CLI}; run the drill through npm run test:drill`)
}
const NPM = [NPM_CLI, 'run']

/**
 * A red result must be the test or gate rejecting the defect, not the
 * command falling over: each runner names the line it prints for a real
 * failure, and the drill runner insists on seeing it.
 */
const VITEST_FAILED = /Tests\s+\d+ failed/
const PLAYWRIGHT_FAILED = /^\s*\d+ failed/m

const vitest = (project, file) => ({
  command: [...VITEST, '--project', project, file],
  failure: VITEST_FAILED,
})
const unitWorker = (file) => vitest('unit-worker', file)
const unitClient = (file) => vitest('unit-client', file)
const browser = (file) => vitest('browser', file)
const workers = (file) => vitest('workers', file)
/** The file goes before `--project`, which is variadic and would swallow it. */
const e2e = (project, file) => ({
  command: [...PLAYWRIGHT, file, '--project', project],
  failure: PLAYWRIGHT_FAILED,
})
const gate = (script, failure) => ({ command: [...NPM, script], failure })

export const DRILLS = [
  // --- Worker: authorization, origin, secrets, limits -----------------------
  {
    name: 'RBAC: viewers may edit presets',
    file: 'src/worker/routes/library.ts',
    find: "requirePermission({ watermark: ['update'] })",
    replace: "requirePermission({ watermark: ['read'] })",
    ...unitWorker('src/worker/library.test.ts'),
  },
  {
    name: 'RBAC: non-members pass the permission check',
    file: 'src/worker/middleware/permission.ts',
    find: '      isAllowed = false\n',
    replace: '      isAllowed = true\n',
    ...unitWorker('src/worker/library.test.ts'),
  },
  {
    name: 'Platform admin: any signed-in user reaches the admin API',
    file: 'src/worker/middleware/platform-admin.ts',
    find: 'if (user.role !== PLATFORM_ADMIN_ROLE) {',
    replace: 'if (user.role === PLATFORM_ADMIN_ROLE) {',
    ...unitWorker('src/worker/admin.test.ts'),
  },
  {
    name: 'CSRF: same-origin guard accepts every origin',
    file: 'src/worker/middleware/same-origin.ts',
    find: 'if (origin !== expected) {',
    replace: 'if (origin !== expected && origin === undefined) {',
    ...unitWorker('src/worker/index.test.ts'),
  },
  {
    name: 'Rate limit: credential routes use the lenient limiter',
    file: 'src/worker/auth/rate-limit.ts',
    find: 'const limiter = isSensitive ? strict : general',
    replace: 'const limiter = general',
    ...workers('src/worker/auth-flow.workers.test.ts'),
  },
  {
    name: 'Share token: expired links stay valid',
    file: 'src/worker/share-token.ts',
    find: 'if (expiresAt !== NEVER_EXPIRES && expiresAt <= now) {',
    replace: 'if (expiresAt !== NEVER_EXPIRES && expiresAt < 0) {',
    ...unitWorker('src/worker/share-token.test.ts'),
  },
  {
    name: 'Share token: signature failures are ignored',
    file: 'src/worker/share-token.ts',
    find: '  if (!isValid) {\n    return null\n  }\n',
    replace: '  if (!isValid && signature.byteLength === 0) {\n    return null\n  }\n',
    ...unitWorker('src/worker/share-token.test.ts'),
  },
  {
    name: 'Share: revoked links keep serving',
    file: 'src/worker/routes/shares.ts',
    find: 'const isLive = record?.revokedAt === null && record.expiresAt === claims.expiresAt',
    replace: 'const isLive = record !== null && record.expiresAt === claims.expiresAt',
    ...unitWorker('src/worker/shares.test.ts'),
  },
  {
    name: 'Uploads: declared size limit not enforced',
    file: 'src/worker/routes/photos.ts',
    find: 'if (declaredLength > MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES) {',
    replace: 'if (declaredLength < 0) {',
    ...unitWorker('src/worker/photos.test.ts'),
  },
  {
    name: 'Uploads: photo count quota not enforced',
    file: 'src/worker/routes/photos.ts',
    find: 'if (usage.count >= MAX_PHOTOS_PER_ORGANIZATION) {',
    replace: 'if (usage.count > MAX_PHOTOS_PER_ORGANIZATION * 2) {',
    ...unitWorker('src/worker/photos.test.ts'),
  },
  {
    name: 'Uploads: declared type trusted instead of the bytes',
    file: 'src/worker/uploads.ts',
    find: 'export function sniffImageType(bytes: Uint8Array): ImageType | null {\n',
    replace:
      "export function sniffImageType(bytes: Uint8Array): ImageType | null {\n  return 'image/png'\n",
    ...unitWorker('src/worker/uploads.test.ts'),
  },
  {
    name: 'Config: Turnstile accepted half-configured',
    file: 'src/worker/env.ts',
    find: '(env) => (env.TURNSTILE_SITE_KEY === undefined) === (env.TURNSTILE_SECRET_KEY === undefined),',
    replace:
      '(env) => env.TURNSTILE_SITE_KEY === undefined || env.TURNSTILE_SECRET_KEY === undefined || true,',
    ...unitWorker('src/worker/env.test.ts'),
  },
  {
    name: 'Cookies: session cookie readable from script',
    file: 'src/worker/auth/options.ts',
    find: 'httpOnly: true,',
    replace: 'httpOnly: false,',
    ...unitWorker('src/worker/auth-flow.test.ts'),
  },
  // --- Client: engine, editor, bulk, shell ---------------------------------
  {
    name: 'Placement: busy regions preferred over flat ones',
    file: 'src/client/engine/placement.ts',
    find: 'PLACEMENT_WEIGHTS.edges * edgeStats.mean +',
    replace: 'PLACEMENT_WEIGHTS.edges * (1 - edgeStats.mean) +',
    ...unitClient('src/client/engine/placement.test.ts'),
  },
  {
    name: 'Contrast: dark ink on dark regions',
    file: 'src/client/engine/contrast.ts',
    find: "meanLuminance > LUMINANCE_MIDPOINT ? 'dark' : 'light'",
    replace: "meanLuminance > LUMINANCE_MIDPOINT ? 'light' : 'dark'",
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Engine: analysis ignores the crop',
    file: 'src/client/engine/pipeline.ts',
    find: '  const crop = cropOf(source, transform)\n  const output = transform?.resize',
    replace:
      '  const crop = { x: 0, y: 0, width: source.width, height: source.height }\n  const output = transform?.resize',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Main-thread engine: bitmaps never released',
    file: 'src/client/engine/local-engine.ts',
    find: '      this.#busy -= 1\n      closeInputBitmaps(input)\n',
    replace: '      this.#busy -= 1\n',
    ...browser('src/client/engine/local-engine.browser.test.ts'),
  },
  {
    name: 'Capability switch: worker engine without OffscreenCanvas',
    file: 'src/client/lib/canvas-backend.ts',
    find: 'return hasOffscreenCanvas() ? new WatermarkWorker() : new DeferredLocalEngine()',
    replace: 'return new WatermarkWorker()',
    ...browser('src/client/lib/canvas-backend.browser.test.ts'),
  },
  {
    name: 'Editor: undo history unbounded',
    file: 'src/client/editor/state.ts',
    find: 'return past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past',
    replace: 'return past',
    ...unitClient('src/client/editor/state.test.ts'),
  },
  {
    name: 'Editor: pinch ignores the twist',
    file: 'src/client/components/editor/mark-overlay.tsx',
    find: 'rotation: normaliseRotation(drag.rotation - twist),',
    replace: 'rotation: normaliseRotation(drag.rotation),',
    ...unitClient('src/client/components/editor/overlays.test.tsx'),
  },
  {
    name: 'Thumbnails: full-size images stored as thumbnails',
    file: 'src/client/lib/thumbnail.ts',
    find: 'const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(bitmap.width, bitmap.height))',
    replace: 'const scale = 1',
    ...browser('src/client/lib/thumbnail.browser.test.ts'),
  },
  {
    name: 'Theme: browser chrome not tinted',
    file: 'src/client/lib/theme.ts',
    find: "meta.setAttribute('content', CHROME_COLOURS[resolved])",
    replace: "meta.setAttribute('data-content', CHROME_COLOURS[resolved])",
    ...unitClient('src/client/lib/theme.test.ts'),
  },
  {
    name: 'Shell: gallery missing from the phone tab bar',
    file: 'src/client/components/app-shell.tsx',
    find: "['/app/library', '/app/editor', '/app/bulk', '/app/gallery'].includes(item.to),",
    replace: "['/app/library', '/app/editor', '/app/bulk'].includes(item.to),",
    ...unitClient('src/client/routes/app/shell.test.tsx'),
  },
  // --- M10 parity features -------------------------------------------------
  {
    name: 'Layers: only the first mark is drawn',
    file: 'src/client/engine/pipeline.ts',
    find: 'const marks = request.marks.map((mark) => composeMark(canvas.context, canvas, map, mark))',
    replace:
      'const marks = request.marks.slice(0, 1).map((mark) => composeMark(canvas.context, canvas, map, mark))',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Colour: chosen ink ignored for text',
    file: 'src/client/engine/render.ts',
    find: '    ctx.fillStyle = contrast.fill',
    replace: '    ctx.fillStyle = INK[contrast.variant].fill',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Text: line breaks flattened',
    file: 'src/client/engine/render.ts',
    find: String.raw`    return spec.text.split('\n')`,
    replace: String.raw`    return [spec.text.replaceAll('\n', ' ')]`,
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Backdrop: box never drawn',
    file: 'src/client/engine/render.ts',
    find: '      drawBackdrop(ctx, geometry, spec.style.backdrop.opacity, contrast)',
    replace: '      void contrast',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'QR: no light field behind the modules',
    file: 'src/client/engine/render.ts',
    find: '  ctx.fillStyle = QR_INK.backdrop',
    replace: "  ctx.fillStyle = 'transparent'",
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Tokens: placeholders left in the text',
    file: 'src/shared/watermark.ts',
    find: '    resolved = resolved.split(token).join(values[token])',
    replace: '    void values[token]',
    ...unitClient('src/shared/watermark.test.ts'),
  },
  {
    name: 'Snap: dragged centre never snaps',
    file: 'src/client/components/editor/mark-overlay.tsx',
    find: '  return best === null ? { value, line: null } : { value: best, line: best }',
    replace: '  return { value, line: best }',
    ...unitClient('src/client/components/editor/overlays.test.tsx'),
  },
  {
    name: 'Share sheet: file sharing offered where the browser refuses files',
    file: 'src/client/lib/share-file.ts',
    find: '  return api.canShare({ files: [probeFile(type)] })',
    replace: '  return typeof probeFile(type) === "object"',
    ...unitClient('src/client/lib/share-file.test.ts'),
  },
  {
    name: 'Signature: saved logo has no padding around the ink',
    file: 'src/client/editor/signature.ts',
    find: '  const padding = Math.max(bounds.width, bounds.height) * SIGNATURE_PADDING_RATIO',
    replace: '  const padding = 0',
    ...unitClient('src/client/editor/signature.test.ts'),
  },
  {
    name: 'Bulk: only the first ticked preset is applied',
    file: 'src/client/components/bulk/bulk-tool.tsx',
    find: '    await start(specs, settings())\n    setTiming',
    replace: '    await start(specs.slice(0, 1), settings())\n    setTiming',
    ...unitClient('src/client/routes/app/bulk-page.test.tsx'),
  },
  // --- Gates: each must refuse the defect it exists for ---------------------
  {
    name: 'Gate: ESLint rejects `any`',
    file: 'src/shared/constants.ts',
    find: 'export const APP_NAME',
    replace: 'export const LOOSE: any = 1\nexport const APP_NAME',
    ...gate('lint', /\d+ problems?/),
  },
  {
    name: 'Gate: tsc rejects a type error',
    file: 'src/shared/constants.ts',
    find: 'export const APP_NAME',
    replace: 'export const WRONG: number = "text"\nexport const APP_NAME',
    ...gate('typecheck', /error TS\d+/),
  },
  {
    name: 'Gate: knip rejects an unused export',
    file: 'src/shared/constants.ts',
    find: 'export const APP_NAME',
    replace: 'export const NEVER_IMPORTED = 1\nexport const APP_NAME',
    ...gate('deadcode', /Unused exports/),
  },
  {
    name: 'Gate: dpdm rejects an import cycle',
    file: 'src/client/lib/cn.ts',
    find: "import { clsx, type ClassValue } from 'clsx'",
    replace: "import '../components/ui/card'\nimport { clsx, type ClassValue } from 'clsx'",
    ...gate('lint:cycles', /circular/i),
  },
  // --- End to end: the journeys notice a broken product -------------------
  {
    name: 'E2E: security headers dropped from static responses',
    file: 'public/_headers',
    find: '  Content-Security-Policy: default-src',
    replace: '  Content-Security-Policy-Report-Only: default-src',
    ...e2e('desktop-chrome', 'e2e/smoke.spec.ts'),
  },
  {
    name: 'E2E (iPhone): phone menu button missing',
    file: 'src/client/components/app-shell.tsx',
    find: '<Button type="button" variant="ghost" size="icon" aria-label="Menu">',
    replace: '<Button type="button" variant="ghost" size="icon" aria-label="Navigation">',
    ...e2e('iphone', 'e2e/library.spec.ts'),
  },
  {
    // An implicit `auto` grid column grows to a card's min-content width, so
    // a long nowrap description pushes the page wider than a phone.
    name: 'E2E (Android): library cards overflow the phone width',
    file: 'src/client/routes/app/library/index.tsx',
    find: 'className="grid grid-cols-1 gap-4 sm:grid-cols-2"',
    replace: 'className="grid gap-4 sm:grid-cols-2"',
    ...e2e('android', 'e2e/bulk.spec.ts'),
  },
  {
    name: 'E2E: editor no longer preloads its first paint at boot',
    file: 'src/client/routes/app/editor.tsx',
    find: '  staticData: { preloadImages: [SAMPLE_SCENE_PATH] },\n',
    replace: '  staticData: { preloadImages: [] },\n',
    ...e2e('desktop-chrome', 'e2e/editor.spec.ts'),
  },
]
