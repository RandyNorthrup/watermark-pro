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
    find: '  const geometry = outputGeometry(source, transform)\n  const scale = Math.min(1, ANALYSIS_MAX_SIDE',
    replace:
      '  const geometry = outputGeometry(source, undefined)\n  const scale = Math.min(1, ANALYSIS_MAX_SIDE',
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
    find: '  ctx.fillStyle = contrast.fill\n  ctx.fillText(char, x, y)',
    replace: '  ctx.fillStyle = INK[contrast.variant].fill\n  ctx.fillText(char, x, y)',
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
  // --- M11: orientation and colour adjustments -----------------------------
  {
    name: 'Adjust: contrast ignored',
    file: 'src/client/engine/adjust.ts',
    find: '  const gain = 1 + contrast',
    replace: '  const gain = 1',
    ...unitClient('src/client/engine/adjust.test.ts'),
  },
  {
    name: 'Adjust: analysis reads the unadjusted photo',
    file: 'src/client/engine/pipeline.ts',
    find: '  ctx.putImageData(image, 0, 0)\n  return analysePixels(image)',
    replace: '  ctx.putImageData(image, 0, 0)\n  return analyseSource(source, transform, backend)',
    ...browser('src/client/engine/adjust.browser.test.ts'),
  },
  {
    name: 'Orientation: turns do not swap width and height',
    file: 'src/client/engine/orient.ts',
    find: '  return orientation.turns % 2 === 0\n    ? { width: source.width, height: source.height }\n    : { width: source.height, height: source.width }',
    replace: '  return { width: source.width, height: source.height }',
    ...unitClient('src/client/engine/orient.test.ts'),
  },
  {
    name: 'Orientation: straighten leaves empty corners',
    file: 'src/client/engine/orient.ts',
    find: '  const k = Math.min(w / (w * cos + h * sin), h / (w * sin + h * cos))\n  return { width: w * k, height: h * k }',
    replace: '  return { width: w, height: h }',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Editor: rotating keeps a stale crop',
    file: 'src/client/editor/state.ts',
    find: '    crop: shouldKeepCrop ? document.crop : null,',
    replace: '    crop: document.crop,',
    ...unitClient('src/client/editor/state.test.ts'),
  },
  {
    name: 'Bulk: adjustments not passed to the runtime',
    file: 'src/client/components/bulk/bulk-tool.tsx',
    find: '      adjust,\n      border,\n      namePattern,',
    replace: '      adjust: IDENTITY_ADJUSTMENTS,\n      border,\n      namePattern,',
    ...unitClient('src/client/routes/app/bulk-page.test.tsx'),
  },
  {
    name: 'Filters: Vivid maps to the wrong values',
    file: 'src/shared/adjustments.ts',
    find: "  filter('vivid', 'Vivid', { contrast: 0.15, saturation: 0.35 }),",
    replace: "  filter('vivid', 'Vivid', { contrast: 0.15, saturation: -0.15 }),",
    ...unitClient('src/shared/adjustments.test.ts'),
  },
  // --- M12: text effects, shapes, frame, random placement ------------------
  {
    name: 'Text: letter spacing ignored',
    file: 'src/client/engine/text-layout.ts',
    find: '  const gap = spacing * fontSize',
    replace: '  const gap = 0',
    ...browser('src/client/engine/text-layout.browser.test.ts'),
  },
  {
    name: 'Text: curve flattened',
    file: 'src/client/engine/text-layout.ts',
    find: '  if (curve === 0) {\n    return { width: runWidth, height: block }',
    replace: '  if (curve === 0 || true) {\n    return { width: runWidth, height: block }',
    ...unitClient('src/client/engine/text-layout.test.ts'),
  },
  {
    name: 'Shape: ellipse drawn as a rectangle',
    file: 'src/client/engine/render.ts',
    find: '    path.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2)',
    replace: '    path.rect(-halfWidth, -halfHeight, geometry.width, geometry.height)',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Frame: placement not offset by the border',
    file: 'src/client/engine/pipeline.ts',
    find: '      centreX: mark.placement.centreX + framed.offset,',
    replace: '      centreX: mark.placement.centreX,',
    ...browser('src/client/engine/pipeline.browser.test.ts'),
  },
  {
    name: 'Random: same position for every seed',
    file: 'src/client/engine/layout.ts',
    find: '    const next = mulberry32(seed)',
    replace: '    const next = mulberry32(1)',
    ...unitClient('src/client/engine/layout.test.ts'),
  },
  {
    name: 'Random: jitter escapes the margin',
    file: 'src/client/engine/layout.ts',
    find: '    const x = clamp(base.x + offsetX, widthFraction / 2, 1 - widthFraction / 2)',
    replace: '    const x = base.x + offsetX * 20',
    ...unitClient('src/client/engine/layout.test.ts'),
  },
  // --- M13: metadata tokens and the export keep/strip policy ----------------
  {
    name: 'Metadata: GPS survives keep-except-location',
    file: 'src/client/engine/metadata/exif-edit.ts',
    find: '  if (pointer === null) {\n    return\n  }\n  const gpsIfd = ctx.view.getUint32(pointer.fieldOffset, ctx.isLittleEndian)',
    replace:
      '  if (pointer === null) {\n    return\n  }\n  return\n  const gpsIfd = ctx.view.getUint32(pointer.fieldOffset, ctx.isLittleEndian)',
    ...unitClient('src/client/engine/metadata/exif-edit.test.ts'),
  },
  {
    name: 'Metadata: orientation not reset to 1',
    file: 'src/client/engine/metadata/write.ts',
    find: '  setOrientation(copy, UPRIGHT)',
    replace: '  void UPRIGHT',
    ...browser('src/client/engine/metadata/metadata.browser.test.ts'),
  },
  {
    name: 'Metadata: strip still copies Exif',
    file: 'src/client/engine/metadata/write.ts',
    find: "  if (policy !== 'strip' && source.exif !== null) {\n    segments.push(app1Segment(EXIF_IDENTIFIER, editedExif(source.exif, policy, size)))",
    replace:
      '  if (source.exif !== null) {\n    segments.push(app1Segment(EXIF_IDENTIFIER, editedExif(source.exif, policy, size)))',
    ...browser('src/client/engine/metadata/metadata.browser.test.ts'),
  },
  {
    name: 'Metadata: APP1 inserted before APP0',
    file: 'src/client/engine/metadata/segments.ts',
    find: '  return concat([jpeg.slice(0, 2), ...segments, jpeg.slice(bodyStart)])',
    replace: '  return concat([jpeg.slice(0, 2), ...segments.toReversed(), jpeg.slice(bodyStart)])',
    ...unitClient('src/client/engine/metadata/segments.test.ts'),
  },
  {
    name: 'DPI: density dropped on strip',
    file: 'src/client/engine/metadata/write.ts',
    find: '  if (source.density !== null) {\n    segments.push(jfifSegment(source.density))',
    replace:
      "  if (source.density !== null && policy !== 'strip') {\n    segments.push(jfifSegment(source.density))",
    ...browser('src/client/engine/metadata/metadata.browser.test.ts'),
  },
  {
    name: 'PNG: CRC not recomputed',
    file: 'src/client/engine/metadata/segments.ts',
    find: 'data.setUint32(PNG_CHUNK_HEADER + chunkData.length, crc32(crcInput), false)',
    replace: 'data.setUint32(PNG_CHUNK_HEADER + chunkData.length, 0, false)',
    ...unitClient('src/client/engine/metadata/segments.test.ts'),
  },
  {
    name: 'Tokens: {date} ignores the capture date',
    file: 'src/shared/watermark.ts',
    find: '  const when = meta.takenAt ?? context.date',
    replace: '  const when = context.date',
    ...unitClient('src/shared/watermark-tokens.test.ts'),
  },
  {
    name: 'Tokens: empty values leave the token in place',
    file: 'src/shared/watermark.ts',
    find: '  return tidyResolvedText(resolved)',
    replace: '  return resolved',
    ...unitClient('src/shared/watermark-tokens.test.ts'),
  },
  // --- M14: folders, output names, pause, batch report ---------------------
  {
    name: 'Names: {index} not zero-padded',
    file: 'src/client/bulk/names.ts',
    find: "String(context.index).padStart(digits, '0')",
    replace: 'String(context.index)',
    ...unitClient('src/client/bulk/names.test.ts'),
  },
  {
    name: 'Names: unsafe characters kept',
    file: 'src/client/bulk/names.ts',
    find: "const safe = resolved.replaceAll(UNSAFE_CHARACTERS, '-').trim()",
    replace: 'const safe = resolved.trim()',
    ...unitClient('src/client/bulk/names.test.ts'),
  },
  {
    name: 'Folders: tree flattened in the ZIP',
    file: 'src/client/bulk/folders.ts',
    find: "const slash = relativePath.lastIndexOf('/')",
    replace: 'const slash = -1',
    ...unitClient('src/client/bulk/folders.test.ts'),
  },
  {
    name: 'Pause: new jobs still start while paused',
    file: 'src/client/bulk/queue.ts',
    find: 'if (this.#isPaused || isAborted(this.#controller.signal)) {',
    replace: 'if (isAborted(this.#controller.signal)) {',
    ...unitClient('src/client/bulk/queue.test.ts'),
  },
  {
    name: 'Report: errors with commas break the CSV',
    file: 'src/client/bulk/report.ts',
    find: String.raw`const NEEDS_QUOTING = /[",\r\n]/`,
    replace: 'const NEEDS_QUOTING = /(?!)/',
    ...unitClient('src/client/bulk/report.test.ts'),
  },
  // --- M14 (carried forward): per-photo override, watch folder -------------
  {
    name: 'Override: batch presets drawn despite an override',
    file: 'src/client/bulk/processor.ts',
    find: 'return input.override === null ? specs : input.override.layers.map((layer) => layer.spec)',
    replace: 'return specs',
    ...unitClient('src/client/bulk/processor.test.ts'),
  },
  {
    name: 'Override: adjusting a photo silently skips the re-run',
    file: 'src/client/components/bulk/use-bulk-queue.ts',
    find: 'return queueRef.current?.rerun(id) ?? Promise.resolve(EMPTY)',
    replace: 'return Promise.resolve(EMPTY)',
    ...unitClient('src/client/routes/app/bulk-page.test.tsx'),
  },
  {
    name: 'Watch: already-processed files are processed again',
    file: 'src/client/bulk/watch.ts',
    find: 'return current.filter((entry) => !seen.has(keyOf(entry)))',
    replace: 'return current',
    ...unitClient('src/client/bulk/watch.test.ts'),
  },
  // --- M15: preset files, logo tools, invisible mark -----------------------
  {
    name: 'Invisible: a hidden mark is written into a lossy JPEG',
    file: 'src/client/engine/encode.ts',
    find: "options.invisible !== undefined && options.format !== 'image/png'",
    replace: "options.invisible !== undefined && options.format === 'image/png'",
    ...unitClient('src/client/engine/encode.test.ts'),
  },
  {
    name: 'Invisible: a corrupted payload is read as valid',
    file: 'src/client/engine/invisible.ts',
    find: 'if (actualCrc >>> 0 !== crc32(checked)) {',
    replace: 'if (false) {',
    ...unitClient('src/client/engine/invisible.test.ts'),
  },
  {
    name: 'Preset import: a preset spec is not validated',
    file: 'src/shared/preset-file.ts',
    find: 'spec: watermarkSpecSchema,',
    replace: 'spec: z.unknown(),',
    ...unitClient('src/shared/preset-file.test.ts'),
  },
  {
    name: 'Logo cleanup: background removal ignores the tolerance',
    file: 'src/client/lib/logo-cleanup.ts',
    find: 'if (colourDistance(data, neighbour * CHANNELS, seedOffset) <= tolerance) {',
    replace: 'if (colourDistance(data, neighbour * CHANNELS, seedOffset) >= 0) {',
    ...unitClient('src/client/lib/logo-cleanup.test.ts'),
  },
  // --- M16: SSRF policy and the import route -------------------------------
  {
    name: 'Import SSRF: an IP-literal host is allowed',
    file: 'src/worker/url-policy.ts',
    find: "host.includes(':') || host.startsWith('[') || IPV4_LITERAL.test(host) || NUMERIC_HOST.test(host)",
    replace: 'false',
    ...unitWorker('src/worker/url-policy.test.ts'),
  },
  {
    name: 'Import SSRF: a redirect hop is not re-checked',
    file: 'src/worker/routes/imports.ts',
    find: 'current = assertImportableUrl(new URL(location, current).href)',
    replace: 'current = new URL(location, current)',
    ...unitWorker('src/worker/imports.test.ts'),
  },
  {
    name: 'Import: the streamed size cap is not enforced',
    file: 'src/worker/routes/imports.ts',
    find: 'if (total > MAX_PHOTO_BYTES) {',
    replace: 'if (false) {',
    ...unitWorker('src/worker/imports.test.ts'),
  },
  {
    name: 'Import: the fetched bytes are not sniffed',
    file: 'src/worker/routes/imports.ts',
    find: 'if (type === null) {\n      throw apiErrors.unsupportedMedia()',
    replace: 'if (false) {\n      throw apiErrors.unsupportedMedia()',
    ...unitWorker('src/worker/imports.test.ts'),
  },
  // --- M17: video watermarking ---------------------------------------------
  {
    name: 'Video: limits checked after decoding',
    file: 'src/client/video/probe.ts',
    find: 'if (limit !== null) {',
    replace: 'if (limit !== null && false) {',
    ...browser('src/client/video/probe.browser.test.ts'),
  },
  {
    name: 'Video: frames never closed',
    file: 'src/client/video/transcode.ts',
    find: '    sample.draw(ctx, 0, 0, size.width, size.height)\n    sample.close()',
    replace: '    sample.draw(ctx, 0, 0, size.width, size.height)',
    ...browser('src/client/video/transcode.browser.test.ts'),
  },
  {
    name: 'Video: mark drawn on the first frame only',
    file: 'src/client/video/transcode.ts',
    find: '    for (const mark of marks) {\n      composeMark(ctx, size, map, mark)\n    }',
    replace:
      '    if (index === 0) {\n      for (const mark of marks) {\n        composeMark(ctx, size, map, mark)\n      }\n    }',
    ...browser('src/client/video/transcode.browser.test.ts'),
  },
  {
    name: 'Video: audio dropped',
    file: 'src/client/video/transcode.ts',
    find: 'const track = await input.getPrimaryAudioTrack()',
    replace: 'const track = null',
    ...browser('src/client/video/transcode.browser.test.ts'),
  },
  // --- M17: PDF ("Documents") watermarking ---------------------------------
  {
    name: 'PDF: last page unmarked',
    file: 'src/client/pdf/watermark-pdf.ts',
    find: 'for (const page of pages) {',
    replace: 'for (const page of pages.slice(0, -1)) {',
    ...unitClient('src/client/pdf/watermark-pdf.test.ts'),
  },
  {
    name: 'PDF: page cap ignored',
    file: 'src/client/pdf/watermark-pdf.ts',
    find: 'if (pages.length > MAX_PDF_PAGES) {',
    replace: 'if (false) {',
    ...unitClient('src/client/pdf/watermark-pdf.test.ts'),
  },
  {
    name: 'PDF: smart placement used on documents',
    file: 'src/client/pdf/raster-layout.ts',
    find: "return { ...spec, placement: { mode: 'anchor', anchor: 'bottom-right' } }",
    replace: 'return spec',
    ...unitClient('src/client/pdf/raster-layout.test.ts'),
  },
  // --- M18: localisation and right-to-left ---------------------------------
  {
    name: 'i18n: RTL not applied',
    file: 'src/shared/locales.ts',
    find: "localeDirection(locale) === 'rtl'",
    replace: "localeDirection(locale) === 'ltr'",
    ...unitClient('src/shared/locales.test.ts'),
  },
  {
    name: 'i18n: physical utility slips in',
    file: 'src/client/components/app-shell.tsx',
    find: 'className="ms-auto flex items-center gap-2"',
    replace: 'className="ms-auto ml-2 flex items-center gap-2"',
    ...gate('lint', /\d+ problems?/),
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
