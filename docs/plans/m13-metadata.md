# M13 — Metadata: EXIF tokens, keep/strip policy, capture date, DPI

## Goal

iWatermark+ and uMark print camera metadata (camera, lens, ISO, aperture,
shutter, focal length, capture date, GPS) as visible text; uMark offers
"keep all / keep all except location / strip" on export and preserves DPI;
Watermarkly has a keep/strip toggle. We strip everything, always, and
`{date}` uses the file's modification time. After M13 text marks can
carry every common camera field, `{date}` means the capture date when the
photo has one, exports can keep their metadata with GPS removed or keep
it all (strip stays the default), and print density survives.

Research: `docs/competitor-research.md` §1.1 (metadata as text), §1.6
(output & metadata), §3.2.

## Behaviour

### Reading metadata

When a photo is opened in the editor or added to a batch, its EXIF is read
once (in the browser, never uploaded) and kept with the file:

```ts
export interface PhotoMetadata {
  takenAt: Date | null
  camera: string | null // "Make Model", Make dropped when Model already starts with it
  lens: string | null
  iso: number | null
  aperture: number | null // f-number
  shutter: number | null // seconds, e.g. 0.004
  focalLength: number | null // mm
  location: { latitude: number; longitude: number } | null
  orientation: number | null // 1–8; informational: the browser applies it when decoding
  density: { x: number; y: number; unit: 'inch' | 'cm' } | null
  /** The raw Exif TIFF payload (APP1 body after "Exif\0\0"), for keep modes. */
  exif: Uint8Array | null
  /** Raw XMP packet, if present. */
  xmp: Uint8Array | null
}
```

Parsing uses `exifr` 7.1.3 (MIT, no dependencies, browser build) for the
fields, with `pick` limited to the tags above and `gps: true`; raw
segments come from our own scanner (`segments.ts`, below) because exifr
does not return them. Pin exactly; add the §3.1 row. Reading is done in
`src/client/lib/photo-metadata.ts` (`readPhotoMetadata(file): Promise<PhotoMetadata>`),
which never throws: a file without EXIF or with a corrupt block returns
all-null fields (log at debug level; the user sees no error).

### Tokens

`TEXT_TOKENS` grows to:

| Token                 | Value                                                                         | Empty when   |
| --------------------- | ----------------------------------------------------------------------------- | ------------ |
| `{date}`              | capture date, else last-modified, locale medium date                          | never        |
| `{time}`              | same source, locale short time                                                | never        |
| `{taken}`             | capture date and time, locale medium/short                                    | no EXIF date |
| `{filename}`          | file name without extension                                                   | never        |
| `{camera}`            | e.g. "Canon EOS R6"                                                           | no EXIF      |
| `{lens}`              | e.g. "RF24-70mm F2.8 L IS USM"                                                | no lens tag  |
| `{iso}`               | "ISO 400"                                                                     | no tag       |
| `{aperture}`          | "f/2.8"                                                                       | no tag       |
| `{shutter}`           | "1/250 s" (≥ 1 s: "2 s"; fractions rounded to the nearest common denominator) | no tag       |
| `{focal}`             | "50 mm"                                                                       | no tag       |
| `{location}`          | "51.5074° N, 0.1278° W" (4 decimals)                                          | no GPS       |
| `{index}`             | 1-based position in the batch ("1"); editor: "1"                              | never        |
| `{count}`             | batch size; editor: "1"                                                       | never        |
| `{width}`, `{height}` | output pixel size                                                             | never        |

An empty value removes the token and collapses a doubled space or a
trailing " · " / " - " separator left behind (`tidyResolvedText`, unit
tested: "{camera} · {lens}" with no lens becomes "Canon EOS R6"). The
designer's token hint lists all of them with a "Insert" menu (a
`DropdownMenu` of tokens that inserts at the caret).

`{location}` prints a position on the photo. That is the user's explicit
choice (they typed the token); the default presets never include it, and
the token hint carries the sentence "Location prints the photo's GPS
position on the picture."

### Export metadata policy

`EncodeOptions` gains `metadata: 'strip' | 'keep-except-location' | 'keep'`
(default `strip`; constant `DEFAULT_METADATA_POLICY`). Shown as a
three-choice group under the format in the editor's Export tab and the
bulk output settings, with the help text:

- Strip (default): "No camera data, no location. Safest for sharing."
- Keep except location: "Camera, lens and capture time stay; GPS is
  removed."
- Keep everything: "Including the GPS position, if the photo has one."

Support matrix (documented in README; the choice is disabled with a note
where a format cannot carry it):

| Output | strip | keep-except-location                                     | keep                                    |
| ------ | ----- | -------------------------------------------------------- | --------------------------------------- |
| JPEG   | ✓     | ✓ (APP1 Exif with GPS IFD emptied; XMP dropped)          | ✓ (APP1 Exif + APP1 XMP copied)         |
| PNG    | ✓     | ✓ (`eXIf` chunk)                                         | ✓ (`eXIf` + `iTXt` "XML:com.adobe.xmp") |
| WebP   | ✓     | ✗ (control disabled: "WebP exports are always stripped") | ✗                                       |

In both keep modes the Orientation tag is rewritten to 1 in place, because
the pixels are already upright (the browser applied the orientation when
decoding), and the `PixelXDimension`/`PixelYDimension` tags, when present,
are rewritten in place to the output size. Nothing else in the block is
touched; nothing is added.

Gallery saves carry whatever the export carried (the policy is part of the
export); the stored photo's metadata is then whatever the user chose.

### DPI

Print density is preserved regardless of policy (it is not personal):
JPEG output gets a JFIF APP0 with the source's density, PNG output a
`pHYs` chunk; WebP has no density field. Sources: JFIF APP0, EXIF
`XResolution`/`YResolution`/`ResolutionUnit`, PNG `pHYs`. When the source
has none, nothing is written (the browser's encoder default stays).

## Data model

- `src/shared/watermark.ts`: `TEXT_TOKENS`, `TextTokenContext` gains
  optional `metadata: PhotoMetadata | null`, `index`, `count`, `output:
Size`; `resolveTextTokens` and `tidyResolvedText`.
- `src/client/engine/encode.ts`: `EncodeOptions.metadata` (default
  strip), `METADATA_POLICIES`, `DEFAULT_METADATA_POLICY`,
  `supportsMetadata(format)`.
- `ApplyRequest` gains `metadata?: { exif, xmp, density }` (the raw bits the
  engine needs to write back; the pipeline never parses fields itself).
- `EditorDocument`: nothing (the policy is an export setting held by the
  export panel; `BulkSettings.output.metadata` for bulk).
- `src/client/bulk/queue.ts` job input becomes `{ file: File; metadata:
PhotoMetadata }`, read when files are added (in a small concurrent pool
  of four so 500 files do not read at once).

## Algorithms (`src/client/engine/metadata/`)

Pure byte code, unit-tested in Node with hand-built fixtures (extend the
`withExifOrientation` builder from `bulk.browser.test.ts` into a shared
`test-support/exif-fixtures.ts` that can build IFD0 with arbitrary tags, a
GPS IFD, an XMP packet, a JFIF APP0 and PNG chunks).

`segments.ts`:

- `jpegSegments(bytes): { marker: number; start: number; length: number }[]`
  walks SOI → SOS.
- `extractJpegMetadata(bytes): { exif, xmp, density }`.
- `pngChunks(bytes)`, `extractPngMetadata(bytes)` (`eXIf`, `iTXt` XMP,
  `pHYs`).
- `insertJpegSegments(jpeg, segments: Uint8Array[])`: after SOI, before
  anything else (JFIF APP0 must come first per the JFIF spec: write APP0
  first, then APP1 Exif, then APP1 XMP).
- `insertPngChunks(png, chunks)`: after IHDR (CRC computed; `crc32` in
  `crc32.ts`, table-based, tested against the known value for "123456789"
  = `0xCBF43926`).

`exif-edit.ts` (in-place edits on the TIFF payload; both byte orders):

- `readIfd0(tiff)`, `findTag(tiff, ifdOffset, tag)`.
- `setOrientation(tiff, 1)`: SHORT value written in place.
- `setPixelDimensions(tiff, size)`: only when the tags exist (Exif IFD
  0xA002/0xA003), in place.
- `removeLocation(tiff)`: find IFD0 tag 0x8825 (GPS IFD pointer); set the
  GPS IFD's entry count to 0 and overwrite its entries with zeros; also
  zero the pointer's value so readers do not follow it. Offsets of other
  data do not change (the drill target: a mutated version that skips the
  zeroing must fail the "no GPS after keep-except-location" test).
- `readDensity(tiff)`.

`write.ts`: `withMetadata(blob, format, request: ApplyRequest['metadata'], policy, outputSize): Promise<Blob>`
called by `applyWatermark` after `encodeCanvas`, a no-op for `strip`
except density. Runs in the worker (Blob → ArrayBuffer → patch → Blob).

## Files

New: `src/client/lib/photo-metadata.ts` (+ test with a real small JPEG
fixture containing EXIF committed under `src/client/test-support/fixtures/`;
size < 20 kB; provenance note in the test), `src/client/engine/metadata/{segments,exif-edit,crc32,write}.ts`
(+ tests), `src/client/test-support/exif-fixtures.ts`,
`src/client/components/editor/metadata-policy.tsx` (the choice group,
reused by bulk), `src/client/components/designer/token-menu.tsx`.

Modified: `watermark.ts`, `spec-tokens.ts` (`specForPhoto(spec, file,
metadata, position)`), `encode.ts`, `pipeline.ts`, `protocol.ts`
(`ApplyMessage.metadata`), `engine.ts` (`toApplyRequest`),
`worker-client.ts` (transfer the buffers), `preview.ts`, `editor.tsx`
(reads metadata on open; passes it to previews and exports),
`export-panel.tsx`, `bulk-tool.tsx`, `use-bulk-queue.ts`, `processor.ts`,
`watermark-designer.tsx` (token menu), `README`, `SECURITY.md`, threat
model row (the M10 row becomes "strip by default; keep modes are an
explicit per-export choice; GPS removal proven by test").

## Tests

Unit: every token with and without data; `tidyResolvedText`;
`jpegSegments` on a fixture with APP0 + APP1 + APP1 XMP + SOS;
`extractPngMetadata`; `insertJpegSegments` order (APP0 first);
`crc32`; `setOrientation`, `setPixelDimensions`, `removeLocation` on both
byte orders; `readDensity`; `withMetadata` for the nine policy × format
cells (WebP keep modes throw `RangeError`, the UI never offers them).

Browser: a JPEG built with Orientation 6 + a GPS IFD + a JFIF density of
300 dpi through the bulk processor with each policy: strip → no APP1, APP0
density 300; keep-except-location → APP1 present, orientation 1, GPS IFD
count 0 and pointer 0 (parse with `exifr` and assert `latitude` undefined),
`PixelXDimension` equals the output width; keep → GPS still readable by
exifr and equal to the fixture. PNG output the same through `eXIf`.

Page: editor Export tab shows the three choices, WebP disables two with the
note; bulk passes `output.metadata` to the runtime; the designer token
menu inserts `{camera}` at the caret.

e2e (`e2e/editor.spec.ts`, desktop-chrome and iphone): upload the EXIF
fixture, preset text "{camera} {iso}", export JPEG with "keep except
location"; in Node parse the download with `exifr`: `Model` present, no
GPS; the rendered text region is not background (existing
`expectRendered`).

Red drills:

| Name                                          | Mutation                                       | Command                                                                   |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Metadata: GPS survives keep-except-location   | `removeLocation` returns without zeroing       | unit `exif-edit.test`                                                     |
| Metadata: orientation not reset to 1          | `setOrientation` skipped in `withMetadata`     | browser `metadata.browser.test`                                           |
| Metadata: strip still copies Exif             | `withMetadata` treats strip as keep            | browser `metadata.browser.test`                                           |
| Metadata: APP1 inserted before APP0           | reverse the insertion order                    | unit `segments.test`                                                      |
| Tokens: `{date}` ignores the capture date     | `resolveTextTokens` uses `lastModified` always | unit `watermark.test`                                                     |
| Tokens: empty values leave the token in place | skip `tidyResolvedText`                        | unit `watermark.test`                                                     |
| DPI: density dropped on strip                 | density written only for keep modes            | browser `metadata.browser.test`                                           |
| PNG: CRC not recomputed                       | `insertPngChunks` writes CRC 0                 | unit `segments.test` (decode with `pngjs`-free check: compare to `crc32`) |

## Docs

README "Exports and metadata" rewritten: strip is the default; the two
keep modes; the matrix; DPI; the tokens table moves here from "Watermark
library" (with a pointer). SECURITY.md control text updated; threat-model
row updated. PLAN §3.1 row for `exifr`.

## Security and privacy

- Reading EXIF happens in the browser; nothing is uploaded for it.
- The default policy stays strip; keep modes are per-export, explicit,
  and the UI names GPS in the "keep everything" option.
- `{location}` is opt-in by typing the token; documented.
- Parsing untrusted EXIF: exifr is given `chunked: false` and a
  `maxBytes` cap; our scanners bounds-check every offset and treat any
  out-of-range value as "no metadata" (fuzz test: 200 random mutations of
  the fixture must not throw).

## Certification checklist

- [ ] gates, eight drills red, Lighthouse, screenshots (Export tab with the
      policy group; designer token menu)
- [ ] fuzz test in place and green
- [ ] version 1.5.0, tag, deploy, release
