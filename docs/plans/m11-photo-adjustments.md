# M11 — Photo adjustments and orientation

## Goal

eZy Watermark offers "crop, aspect ratio, align/rotate, filters" before the
mark goes on; iWatermark+, uMark and the Android apps rotate and flip. We
have crop and resize only. After M11 the editor and the bulk tool rotate,
flip and straighten a photo and adjust brightness, contrast, saturation,
warmth, sepia and vignette, with eight named filters built from those
controls, everywhere the engine draws: preview, export, bulk, gallery save.

Research: `docs/competitor-research.md` §1.5 (Editing), §4 (eZy flow).

## Behaviour

### Orientation

- Rotate left / rotate right (90° steps), flip horizontal, flip vertical.
- Straighten: a slider from −45° to +45° in 0.1° steps. The photo rotates
  around its centre and is automatically cropped to the largest rectangle
  of the original aspect ratio that fits inside the rotated image, so no
  empty corners are ever shown or exported.
- Orientation applies before crop. Changing rotation or flip resets the
  crop to "whole photo" (a crop drawn on the old orientation is
  meaningless); changing straighten keeps the crop if it still fits,
  otherwise resets it. The Crop tab shows the oriented, straightened photo.
- Resize applies after crop, unchanged.

### Adjustments

Six sliders, each with a numeric readout and a "Reset" per slider:

| Control    | Range         | Default | Effect                                        |
| ---------- | ------------- | ------- | --------------------------------------------- |
| Brightness | −100 … +100 % | 0       | additive: `v + b × 128`                       |
| Contrast   | −100 … +100 % | 0       | `(v − 128) × (1 + c) + 128`                   |
| Saturation | −100 … +100 % | 0       | `L + (v − L) × (1 + s)`; −100 % is greyscale  |
| Warmth     | −100 … +100 % | 0       | `R + 20 × w`, `B − 20 × w` (cool is negative) |
| Sepia      | 0 … 100 %     | 0       | blend towards the sepia matrix by `t`         |
| Vignette   | 0 … 100 %     | 0       | multiply by `1 − v × smoothstep(0.3, 1, r)`   |

`v` is a channel value 0–255, `L` the Rec. 709 luma
(`0.2126 R + 0.7152 G + 0.0722 B`, the constants already in
`src/client/engine/analysis.ts`; export them), `r` the distance from the
image centre normalised so a corner is 1. Order of application is the table
order. Values are stored as fractions (−1…1, 0…1), shown as percentages.

Sepia matrix (standard):

```
R' = 0.393 R + 0.769 G + 0.189 B
G' = 0.349 R + 0.686 G + 0.168 B
B' = 0.272 R + 0.534 G + 0.131 B
```

blended: `out = in × (1 − t) + sepia × t`.

### Filters

Named presets that set the six adjustment values at once. Selecting one
sets the sliders; moving a slider afterwards shows the filter as "Custom".

| Filter   | Brightness | Contrast | Saturation | Warmth | Sepia | Vignette |
| -------- | ---------- | -------- | ---------- | ------ | ----- | -------- |
| Original | 0          | 0        | 0          | 0      | 0     | 0        |
| Mono     | 0          | 0.1      | −1         | 0      | 0     | 0        |
| Sepia    | 0          | 0        | −0.3       | 0      | 0.8   | 0        |
| Vivid    | 0          | 0.15     | 0.35       | 0      | 0     | 0        |
| Warm     | 0.05       | 0        | 0.1        | 0.4    | 0     | 0        |
| Cool     | 0          | 0        | 0          | −0.4   | 0     | 0        |
| Fade     | 0.1        | −0.25    | −0.15      | 0      | 0     | 0        |
| Noir     | −0.05      | 0.35     | −1         | 0      | 0     | 0.5      |

Thumbnails: the Adjust tab shows the eight filters as small previews of the
current photo (or the sample scene) rendered at 96 px on the long side
through the same pixel code (main-thread backend is fine at that size).

### Where it shows

- Editor: a new tab "Adjust" between Crop and Resize (`editor.tsx` `TABS`).
  Orientation buttons (four icon buttons: `RotateCcw`, `RotateCw`,
  `FlipHorizontal2`, `FlipVertical2` from lucide) and the straighten slider
  sit at the top of the Crop tab, because they change what can be cropped;
  the six sliders and the filter strip are the Adjust tab. Everything is
  undoable through the existing history.
- Bulk: a collapsible "Photo adjustments" section under the output settings
  with the same controls minus straighten and crop (batches keep a single
  orientation and filter for every photo). Auto-orientation from EXIF is
  still applied first, as today.
- Gallery save and share use the export pipeline and therefore include the
  adjustments.

## Data model

### Engine (`src/client/engine/pipeline.ts`)

```ts
export interface Orientation {
  /** Quarter turns clockwise. */
  turns: 0 | 1 | 2 | 3
  flipX: boolean
  flipY: boolean
  /** Degrees, clockwise positive, applied after turns and flips. */
  straighten: number
}

export interface Adjustments {
  brightness: number // −1…1
  contrast: number // −1…1
  saturation: number // −1…1
  warmth: number // −1…1
  sepia: number // 0…1
  vignette: number // 0…1
}

export interface Transform {
  orientation?: Orientation
  crop?: CropRect // in oriented, straightened pixel space
  resize?: Size
  adjust?: Adjustments
}
```

Constants (`src/shared/adjustments.ts`, shared so the Worker can validate
saved values later): `IDENTITY_ORIENTATION`, `IDENTITY_ADJUSTMENTS`,
`MAX_STRAIGHTEN_DEGREES = 45`, `STRAIGHTEN_STEP_DEGREES = 0.1`,
`BRIGHTNESS_RANGE = 128`, `WARMTH_RANGE = 20`, `VIGNETTE_INNER = 0.3`,
`SEPIA_MATRIX`, `FILTERS` (the table above as `readonly { id, label,
adjust }[]`), `adjustmentsSchema` (Zod, every field bounded),
`orientationSchema`, `isIdentityAdjustments(a)`, `isIdentityOrientation(o)`,
`filterFor(adjust): FilterId | 'custom'`.

### Editor document (`src/client/editor/state.ts`)

```ts
export interface EditorDocument {
  orientation: Orientation
  crop: CropRect | null
  resize: Size | null
  adjust: Adjustments
  layers: Layer[]
}
```

`EMPTY_DOCUMENT` gets the identity values. New actions: `{ type: 'orient',
orientation }` (resets `crop` to `null` when `turns`/flips change; keeps it
when only `straighten` changes and it still fits, see `fitsAfterStraighten`),
`{ type: 'adjust', adjust }`. Both go through the existing history.

### Bulk settings (`src/client/bulk/processor.ts`)

```ts
export interface BulkSettings {
  output: EncodeOptions
  fitLongestSide: number | null
  orientation: Pick<Orientation, 'turns' | 'flipX' | 'flipY'>
  adjust: Adjustments
}
```

`BulkProcessor.process` builds the `Transform` from these (straighten 0).

### Worker protocol

`ApplyMessage.transform` already carries `Transform`; nothing else changes.
`Orientation` and `Adjustments` are plain data and structured-clone safely.

## Algorithms

### Orientation geometry (`src/client/engine/orient.ts`)

```ts
/** Size of the photo after quarter turns (flips and straighten keep the size). */
export function orientedSize(source: Size, orientation: Orientation): Size

/**
 * Largest rectangle with the oriented aspect that fits inside the photo
 * rotated by `straighten` degrees; centred. k = min(W/(W c + H s), H/(W s + H c))
 * with c = |cos θ|, s = |sin θ|. Returns the full size at θ = 0.
 */
export function straightenedSize(oriented: Size, straightenDegrees: number): Size

/**
 * The affine that maps oriented-and-straightened pixel space (the space
 * crops are expressed in) back onto the source bitmap, as the six
 * `setTransform` arguments. Composition, from source to target:
 *   translate to centre → flipX/flipY (scale −1) → rotate turns × 90° →
 *   rotate straighten → translate so the straightened crop origin is (0,0).
 */
export function sourceToOriented(source: Size, orientation: Orientation): DOMMatrix2DInit
```

`prepareCanvas` becomes: compute `straightened = straightenedSize(orientedSize(source, o), o.straighten)`;
`crop = transform.crop ?? whole straightened`; `size = resize ?? crop`;
create the canvas; `ctx.setTransform(scale(size/crop) · translate(−crop.x, −crop.y) · sourceToOriented)`;
`ctx.drawImage(source, 0, 0)`; reset the transform. One draw, no
intermediate canvas. `analyseSource` uses the same matrix scaled down to
`ANALYSIS_MAX_SIDE`. Put the matrix maths in `orient.ts` and unit-test it in
Node with known points (a 400×200 source turned once is 200×400; the top-left
source pixel lands at the top-right after one clockwise turn; flipX mirrors
x; straighten 90° equals one turn within 1e-9 for a square, and for a 400×200
photo `straightenedSize(…, 10)` is `{ width: 306.4…, height: 153.2… }`
(k = 0.766) — compute the exact expected values in the test from the formula,
not from the implementation).

### Pixel adjustments (`src/client/engine/adjust.ts`)

Pure function on `Uint8ClampedArray`, no canvas:

```ts
export function adjustPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adjust: Adjustments,
): void
```

Implementation notes for speed (12 MP in a worker must stay under ~250 ms):

1. Brightness + contrast are per-channel and identical for R, G, B: build
   one 256-entry `Uint8ClampedArray` LUT once.
2. Saturation, warmth and sepia are linear: fold them into one 3×3 matrix
   plus a 3-vector offset (`colourMatrix(adjust)`), computed once; apply per
   pixel with nine multiplies.
3. Vignette is spatial: compute `f(r)` per pixel from `dx²+dy²` with the
   corner distance precomputed; skip entirely when `vignette === 0`.
4. Skip the whole call when `isIdentityAdjustments(adjust)`.
5. Alpha is untouched.

`applyWatermark` and `PreviewRenderer` call it on the prepared canvas:
`const image = ctx.getImageData(0, 0, w, h); adjustPixels(image.data, w, h, adjust); ctx.putImageData(image, 0, 0)`.
When adjustments are present the luminance map for placement and contrast
must come from the adjusted pixels: add `analysePixels(image: ImageData): LuminanceMap`
next to `analyseSource` (downsample by box averaging to `ANALYSIS_MAX_SIDE`)
and use it in that case, so a mark placed on a darkened photo picks light ink.

### Filter thumbnails (`src/client/lib/filter-thumbnails.ts`)

`renderFilterThumbnails(source: ImageBitmap | null, backend): Promise<Map<FilterId, string>>`
draws the source (or `createSamplePhoto`) at `FILTER_THUMBNAIL_SIDE = 96`
once, then for each filter copies the pixels, runs `adjustPixels`, encodes
JPEG quality 0.7 and returns object URLs; revoke them on unmount.

## Files

New:

- `src/shared/adjustments.ts` (+ `adjustments.test.ts`): constants, schemas,
  `FILTERS`, `filterFor`, identity helpers.
- `src/client/engine/orient.ts` (+ `orient.test.ts`, Node).
- `src/client/engine/adjust.ts` (+ `adjust.test.ts`, Node: LUT and matrix
  on hand-made 2×2 pixel arrays; `adjust.browser.test.ts`: full pipeline
  with a gradient fixture, asserts mean luminance moves the expected way and
  that vignette darkens corners more than the centre).
- `src/client/components/editor/adjust-panel.tsx`: sliders (reuse
  `ui/slider-field.tsx`), filter strip (`role="radiogroup"`, each filter a
  `role="radio"` button with the thumbnail and label), Reset all.
- `src/client/components/editor/orientation-controls.tsx`: the four buttons
  and the straighten slider; used at the top of `crop-panel.tsx` and in the
  bulk section.
- `src/client/lib/filter-thumbnails.ts` (+ browser test).

Modified:

- `src/client/engine/pipeline.ts`: `Transform`, `prepareCanvas`,
  `analyseSource`, `analysePixels`, `applyWatermark` order:
  prepare → adjust → analyse → marks → encode.
- `src/client/lib/preview.ts`: `scaleTransform` scales the crop only (the
  orientation and adjustments are scale-free); the preview applies
  adjustments too.
- `src/client/editor/state.ts`: document fields and actions;
  `src/client/editor/state.test.ts`.
- `src/client/components/editor/editor.tsx`: tab, wiring, undo labels;
  `crop-panel.tsx`: orientation controls on top, crop maths in oriented
  space (`image-size.ts` gives the source size; use `straightenedSize` for
  the frame's bounds); `crop-overlay.tsx` unchanged in behaviour.
- `src/client/components/bulk/bulk-tool.tsx`: "Photo adjustments" section;
  `use-bulk-queue.ts` passes the settings; `bulk/processor.ts`,
  `bulk/runtime.ts` build the transform.
- `src/client/components/editor/export-panel.tsx`: nothing, it already
  exports the document's transform; verify the transform builder includes
  the new fields (`documentTransform(document)` helper in
  `src/client/editor/transform.ts`, new, tested).
- `src/client/test-support/fake-preview.ts` and `fake-bulk-runtime.ts`:
  record the transform/settings so page tests can assert them.

## Tests

Unit (Node/jsdom):

- `adjustments.test.ts`: schema bounds, `filterFor` round-trips every filter
  and returns `'custom'` for a nudged value, identity helpers.
- `orient.test.ts`: the cases listed above; `straightenedSize` is symmetric
  in the sign of the angle; k is 1 at 0° and decreasing.
- `adjust.test.ts`: brightness +1 turns 0 into 128 and 200 into 255
  (clamped); contrast −1 flattens everything to 128; saturation −1 gives
  R = G = B = L; warmth +1 adds 20 to R and removes 20 from B; sepia 1 on
  pure white gives (255, 255, 239) after clamping (0.937 × 255 for blue);
  compute every expected value from the formulas in the test, not from the
  implementation; alpha never changes; identity leaves bytes equal.
- `state.test.ts`: `orient` with turns resets the crop; `straighten` keeps a
  crop that fits and resets one that does not; both undo.
- `transform.test.ts`: `documentTransform` omits identity fields.

Browser (Chromium, `--project browser`):

- `adjust.browser.test.ts`: a 1600×1200 gradient through `applyWatermark`
  with Noir: output mean luma lower than input, corners darker than centre,
  and the placed mark's contrast is `light` where it was `dark` before (the
  drill target).
- `pipeline.browser.test.ts`: one clockwise turn of a 400×200 fixture gives
  a 200×400 output with the fixture's top-left colour at the top-right;
  flipX mirrors; straighten 10° output size matches `straightenedSize`
  within one pixel and the corners are not transparent/black (sample four
  corner pixels, expect the fixture's gradient colours).
- `filter-thumbnails.browser.test.ts`: eight URLs, Mono thumbnail is grey
  (R = G = B within 2 for a sampled pixel).

Page (jsdom):

- `editor-page.test.tsx`: Adjust tab renders the six sliders and eight
  filters; choosing Vivid sets the sliders (readouts) and the fake preview
  receives `transform.adjust` equal to `FILTERS.vivid`; nudging Saturation
  shows "Custom"; Rotate right then Undo restores; the export passes the
  transform (assert on `fakePreview.exports[0].transform`).
- `bulk-page.test.tsx`: enabling the section and choosing Sepia + rotate
  left makes `runs[0].settings.adjust` and `.orientation` match.

e2e (`e2e/editor.spec.ts`, all four projects): after placing the mark,
open Adjust, choose Mono, straighten to 5°, rotate right, then download;
decode the PNG in Node and assert (a) the size is the straightened, turned
size within one pixel, (b) a sampled pixel has R = G = B within 3. Keep the
fixture small (640×400) so WebKit stays under budget.

Red drills (add to `scripts/red-drills.mjs`):

| Name                                            | File                            | Mutation                                        | Command                            |
| ----------------------------------------------- | ------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Adjust: contrast ignored                        | `engine/adjust.ts`              | contrast factor forced to 1                     | browser `adjust.browser.test.ts`   |
| Adjust: analysis reads the unadjusted photo     | `engine/pipeline.ts`            | use `analyseSource` even when adjustments exist | browser `adjust.browser.test.ts`   |
| Orientation: turns do not swap width and height | `engine/orient.ts`              | `orientedSize` returns the source size          | unit `orient.test.ts`              |
| Orientation: straighten leaves empty corners    | `engine/orient.ts`              | `straightenedSize` returns the oriented size    | browser `pipeline.browser.test.ts` |
| Editor: rotating keeps a stale crop             | `editor/state.ts`               | `orient` keeps `crop`                           | unit `state.test.ts`               |
| Bulk: adjustments not passed to the runtime     | `components/bulk/bulk-tool.tsx` | settings built with `IDENTITY_ADJUSTMENTS`      | unit-client `bulk-page.test.tsx`   |
| Filters: Vivid maps to the wrong values         | `shared/adjustments.ts`         | swap Vivid's saturation with Fade's             | unit `adjustments.test.ts`         |

## Docs

- README "Editor": orientation, straighten with auto-crop, Adjust tab,
  filters; "Bulk watermarking": the adjustments section.
- CHANGELOG `[Unreleased]` → becomes 1.3.0 at certification.
- PLAN §5.2: the pipeline order sentence gains "orientation, crop, resize,
  adjustments, analysis, marks".
- Screenshots: `docs/screenshots/m11/` must include the Adjust tab
  (`scripts/screenshots.mjs` needs an `editor-adjust` capture next to
  `editor-crop`).

## Security and privacy

No new trust boundary. Adjustments are pure client-side pixel maths;
nothing is uploaded. The straighten auto-crop guarantees no undefined
pixels reach an export.

## Performance

`adjustPixels` on a 4000×3000 photo must complete in under 250 ms in the
Chromium browser test on the development machine (assert with
`performance.now()` and a generous budget of 1000 ms in the test so CI does
not flake; log the measured time). Preview renders stay under the existing
frame budget because previews are downscaled first.

## Certification checklist (copy into PLAN.md §6 M11)

- [ ] all gates in §3.2 pass (`npm run quality`, `security:sast`, `test:e2e` on all four projects)
- [ ] the seven new drills red; full drill run red, report under `docs/red-drill/`
- [ ] Lighthouse desktop and mobile on all thirteen pages within §5.5 budgets (`docs/lighthouse/m11/`)
- [ ] screenshots incl. the Adjust tab, light and dark, three widths, under `docs/screenshots/m11/`, reviewed
- [ ] `adjustPixels` timing logged in the browser test output and under budget
- [ ] bugs found by tests fixed before certification (see §8)
- [ ] version 1.3.0, tag `v1.3.0`, deploy green, release notes
