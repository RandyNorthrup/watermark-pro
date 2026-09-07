# M15 — Preset files, logo tools, invisible mark

## Goal

Watermarkly, Visual Watermark and iWatermark+ export templates as files
to hand to a colleague; Watermarkly removes a logo's background
automatically (eZy is criticised for lacking it); iWatermark+ (StegoMark)
and uMark on Mac embed an invisible mark. After M15 presets travel as a
file with their logos inside, a logo's flat background can be removed and
its transparent margins trimmed on upload, and a PNG export can carry an
invisible, verifiable mark.

Research: `docs/competitor-research.md` §1.7 (templates), §1.1 (image
watermark, invisible), §3.2.

## Behaviour

### Preset files

- Library: a "Export" action on the page header (exports every preset) and
  per preset in its row menu; both produce `presets-<org slug>-<date>.wmp.json`.
- Library: "Import presets" opens a file picker for `.wmp.json`; a dialog
  lists the presets found with checkboxes (all ticked), flags name
  collisions ("A preset named Studio signature exists; the import will be
  named Studio signature (2)"), and imports on confirm. Logos inside the
  file are uploaded as new assets through the existing
  `POST /api/orgs/:orgId/assets` (signature-checked by the Worker as any
  upload); presets referencing them get the new asset ids. The import is
  audited like any preset creation (one audit row per preset, as today).
- Format, versioned:

```json
{
  "format": "watermark-pro/presets",
  "version": 1,
  "exportedAt": "2026-09-07T01:00:00.000Z",
  "presets": [
    { "name": "Studio signature", "spec": { …WatermarkSpec… },
      "logo": { "name": "logo.png", "contentType": "image/png", "width": 800, "height": 300, "base64": "…" } }
  ]
}
```

Validation on import with `presetFileSchema` (Zod, `src/shared/preset-file.ts`):
`format` and `version` literal, ≤ `MAX_PRESET_FILE_PRESETS = 100`
presets, every `spec` through `watermarkSpecSchema`, logos ≤
`MAX_LOGO_BYTES` (existing 5 MB) after base64 decode, content type in the
logo allow-list, file ≤ `MAX_PRESET_FILE_BYTES = 40 MB`. The Worker is
not involved in parsing the file: the browser validates and then uses
the ordinary routes, so the server's checks apply unchanged.

### Logo tools (designer, Logo tab)

After a file is chosen and before upload, a "Prepare logo" panel with a
live before/after:

- Remove background: switch, default off; tolerance slider 0 … 60 (colour
  distance, default `DEFAULT_BACKGROUND_TOLERANCE = 24`). Algorithm:
  flood fill from the four corners over pixels whose RGB distance to that
  corner's colour is ≤ tolerance (8-connected); matched pixels become
  transparent; a one-pixel feather halves the alpha of matched pixels
  adjacent to unmatched ones. Corners whose colour differs from the
  others by more than the tolerance are each their own seed. Works on any
  flat background, not just white.
- Trim transparent margins: switch, default on when the image has an
  alpha channel; crops to the bounding box of pixels with alpha > 8.
- Result uploaded as PNG (`image/png`) with the original name; the panel
  shows the resulting size.

Implementation `src/client/lib/logo-cleanup.ts`, pure functions on
`ImageData`: `removeBackground(image, tolerance)`, `trimTransparent(image)`,
`alphaBounds(image)`. Processing runs on the main thread for logos ≤ 5 MB
(a 2000×2000 logo floods in ~50 ms); no worker.

### Invisible mark

- Export tab (editor) and bulk output settings: "Invisible mark" switch,
  PNG only (disabled with the note "Only PNG exports can carry an invisible
  mark; JPEG and WebP re-compression destroys it" for other formats), and
  a message field defaulting to the organization name, ≤
  `MAX_INVISIBLE_MESSAGE_LENGTH = 64` characters.
- Encoding: the mark is written into the pixel data of the final canvas
  _before_ PNG encoding (PNG is lossless, so the bits survive), in the
  least significant bit of the blue channel of pixels chosen by a seeded
  pseudo-random walk over the image (seed derived from a fixed application
  constant `INVISIBLE_MARK_SEED` XOR the message length, so a casual LSB
  reader does not see a contiguous message, while our verifier can). Payload: magic
  `WMP1` (4 bytes), length (2 bytes), UTF-8 message, CRC-32 (4 bytes).
  Capacity check: the image must have at least `payloadBits × 4` pixels;
  otherwise the switch is disabled ("Photo too small for an invisible
  mark").
- Verify: a "Check a photo" button in the gallery's header opens a
  dialog with a drop zone (the route `/app/verify` exists for the deep
  link from the export hint and renders the same dialog content as a
  page; it is not in the sidebar, the menu sheet or the tab bar). Drop a
  PNG; the page reads the walk, checks magic and CRC and shows "This
  photo carries the invisible mark: «message»" or "No invisible mark
  found". Everything in the browser.
- Honesty in the UI: "Survives copying and cropping? No. It survives
  saving as PNG and nothing else. Use it to tell your own originals from
  re-encoded copies."

Implementation `src/client/engine/invisible.ts`: `embedInvisibleMark(data,
width, height, message)`, `readInvisibleMark(data, width, height): string | null`,
`invisibleCapacity(width, height)`; the walk uses `mulberry32` from M12
and Fisher–Yates over pixel indices is too big for 12 MP, so use a
linear-congruential stride: index_i = (start + i × stride) mod pixels with
`stride` a large prime coprime to the pixel count (choose from a constant
table of primes the first that does not divide the count).

## Data model

- `src/shared/preset-file.ts`: schema and constants (shared so a future
  Worker-side import could reuse it).
- `EncodeOptions` gains `invisible?: { message: string }` (only honoured for
  `image/png`; `encodeCanvas` throws `RangeError` otherwise, the UI never
  sends it).
- `EditorDocument` unchanged; the switch is export state.
- `BulkSettings.output.invisible`.

## Files

New: `src/shared/preset-file.ts` (+ test), `src/client/lib/preset-file.ts`
(build/parse in the browser: base64 via `FileReader`/`atob`, size checks;

- test), `src/client/components/presets/import-dialog.tsx`,
  `src/client/lib/logo-cleanup.ts` (+ `logo-cleanup.test.ts` in jsdom on
  hand-built `ImageData`-like objects: `{ data, width, height }`),
  `src/client/components/designer/logo-prepare.tsx`,
  `src/client/engine/invisible.ts` (+ Node test: embed then read on a random
  buffer; corrupt one payload bit → null; capacity), `src/client/routes/app/verify.tsx`
  (+ page test), `src/client/components/verify/verify-tool.tsx`.

Modified: `library/index.tsx` (Export / Import actions), `logo-picker.tsx`
(prepare panel between choose and upload), `encode.ts`, `pipeline.ts` (call
`embedInvisibleMark` on the final `ImageData` before `encodeCanvas` when
requested), `export-panel.tsx`, `bulk-tool.tsx`, `gallery.tsx` (the Check a photo
button), `e2e/library.spec.ts`, README, CHANGELOG, SECURITY.md.

## Tests

Unit: schema accepts a valid file and refuses wrong `format`, too many
presets, an oversized logo, an unknown content type; `buildPresetFile`
round-trips through `parsePresetFile`; name-collision renaming;
`removeBackground` clears a white frame around a red square and keeps the
square, feathers the edge (alpha 128 on the ring), handles a non-white
background, respects tolerance (a light-grey frame stays at tolerance 4 and
goes at 24); `trimTransparent`; invisible embed/read/corrupt/capacity.

Browser: a logo PNG through `removeBackground` then `createImageBitmap`
decodes with transparent corners; a PNG export with an invisible mark
decodes (through `createImageBitmap` → canvas → `getImageData`) and
`readInvisibleMark` returns the message; the same export re-encoded as JPEG
returns null (proves the honesty claim).

Page: library Export downloads a `.wmp.json` whose parsed content has the
presets; Import with a fixture file lists two presets, one flagged as a
collision, and the fake library API receives one asset upload and two
preset creations with the renamed one; the Logo tab prepare panel toggles
and the uploaded blob type is PNG; Verify page shows the message for a
fixture and "No invisible mark found" for a plain PNG (fixtures built in
the test with `embedInvisibleMark` and encoded through the fake canvas
backend — the fake's `encode` must return the bytes it was given, extend
`fake-canvas-backend.ts` with a `capturePixels` mode).

e2e (`e2e/library.spec.ts`, desktop-chrome and iphone): export presets,
import the downloaded file into a second organization (create it in the
test), the presets appear; (`e2e/editor.spec.ts`, desktop-chrome) export a
PNG with the invisible mark, open `/app/verify`, upload the download,
expect the message.

Red drills:

| Name                                       | Mutation                                          | Command                          |
| ------------------------------------------ | ------------------------------------------------- | -------------------------------- |
| Preset file: specs not validated on import | `parsePresetFile` skips `watermarkSpecSchema`     | unit `preset-file.test`          |
| Preset file: logo size cap ignored         | remove the byte check                             | unit `preset-file.test`          |
| Import: colliding names overwrite          | renaming removed                                  | unit-client `library-pages.test` |
| Logo: background removal ignores tolerance | tolerance forced to 255                           | unit `logo-cleanup.test`         |
| Logo: trim keeps transparent margins       | `alphaBounds` returns the full box                | unit `logo-cleanup.test`         |
| Invisible: CRC not checked on read         | `readInvisibleMark` skips the CRC compare         | unit `invisible.test`            |
| Invisible: mark written for JPEG output    | `encodeCanvas` accepts `invisible` for any format | unit `encode.test`               |
| Verify: plain PNG reported as marked       | `readInvisibleMark` returns "" instead of null    | unit-client `verify-page.test`   |

## Docs

README: "Watermark library" (export/import, logo preparation), new
"Invisible mark and Verify" section with the honesty paragraph;
SECURITY.md: preset import is parsed client-side against the shared
schema and uploaded through the audited routes; the invisible mark is not
a security control (it is not robust to re-encoding) and is described as
such; threat model: "Preset file import" row (malicious file → Zod +
size caps + server-side signature check on logos).

## Security and privacy

- Preset files can carry arbitrary bytes in `base64`: decoded size is
  checked before decoding (base64 length × 3/4) and again after; the
  Worker sniffs the bytes as for any upload.
- Import never executes anything from the file; specs are data validated
  by the same schema the API uses.
- The invisible mark is steganography with a fixed application seed, not
  cryptography; the UI copy says what it can and cannot do.

## Certification checklist

- [ ] gates, eight drills red, Lighthouse (including `/app/verify`: add it
      to `scripts/lighthouse.mjs` and `scripts/screenshots.mjs`),
      screenshots
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 1.7.0, tag, deploy, release
