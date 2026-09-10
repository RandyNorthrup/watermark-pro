# M17 — Video and PDF watermarking

## Goal

Watermarkly (web) and iWatermark+ watermark video in the same app; eZy,
Visual Watermark and uMark ship separate video products; Watermarkly,
Visual Watermark and uMark watermark PDFs. After M17 the same presets go
onto MP4/WebM/MOV video (in the browser, with WebCodecs, audio passed
through) and onto every page of a PDF, both from a new "Video" tool and a
"Documents" tool, with the same placement, contrast and layer model.

Research: `docs/competitor-research.md` §1.10 (Video), §3.2 (PDF).

This milestone starts with a one-day spike that de-risks the pipeline
(codecs, muxing, audio passthrough, CI). It is not a go/no-go: video ships
in M17 (Randy, 2026-09-06). If a browser cannot encode a codec, the
product picks another (see "Codec choice"); if a browser has no
`VideoEncoder` at all, that browser gets the unsupported message and the
others get the feature.

## M17.0 Spike (one day, no product code)

A browser test under `src/client/video/spike.browser.test.ts` (Chromium)
that:

1. Generates a 3-second 640×360 test video in the test itself with
   `VideoEncoder` (H.264 `avc1.42001f`) and `mediabunny`'s `Output` +
   `Mp4OutputFormat` + `BufferTarget`, 30 frames from a canvas.
2. Reads it back with `mediabunny`'s `Input` (`ALL_FORMATS`,
   `BlobSource`), decodes frames through its `VideoSampleSink`, draws a
   text mark on each frame through the existing engine (`composeMark` on
   the frame canvas with a placement computed once from the first frame),
   re-encodes, and copies the audio track (none in the fixture; a second
   fixture with a generated sine-wave `AudioEncoder` track verifies
   passthrough).
3. Asserts the output decodes, has 90 frames, and the marked region
   differs from the source.

Pass criteria: green in Chromium locally and in CI (Linux Chromium has
software H.264 through OpenH264 in Playwright's build; if `avc1` is not
supported there, VP9 `vp09.00.10.08` in WebM is the path CI exercises).
The iPhone check: a Playwright probe on the `iphone` project
(`e2e/video-capabilities.spec.ts`) logs `VideoEncoder.isConfigSupported`
for each codec (logged, not asserted: Playwright's WebKit build may
differ from Safari), plus a manual check by Randy on his phone against
the production build, recorded in PLAN §8. Whatever the spike finds
changes the implementation, not the decision to ship.

### Codec choice

At run time, in order, with `VideoEncoder.isConfigSupported`:
`avc1.640028` (H.264 High) in MP4 → `hvc1` (HEVC) in MP4 (Safari) →
`vp09.00.40.08` (VP9) in WebM → `av01.0.08M.08` (AV1) in WebM. The first
supported pair wins; the output container follows the codec, and the UI
shows which one it will produce before the user starts ("Saves as MP4
(H.264)"). Audio: copied when the input codec fits the output container
(AAC → MP4, Opus → WebM), else re-encoded with `AudioEncoder` (AAC for
MP4, Opus for WebM); if neither the copy nor the encoder is available
the output is silent and the UI says so before starting. Every branch
has a browser test with a fake `isConfigSupported`.

Dependency: `mediabunny` 1.55.6 (MPL-2.0, allowed by the dependency-review
list; peer: none; declares WebCodecs types). Verify the version, pin, §3.1
row. Do not add `mp4-muxer`/`webm-muxer` (superseded by mediabunny).

## Behaviour: Video

- New tool "Video" (`/app/video`; sidebar and menu sheet; not in the phone
  tab bar). Drop or pick one video (MP4, WebM, MOV) up to
  `MAX_VIDEO_BYTES = 2 GB`, `MAX_VIDEO_SECONDS = 600` and `MAX_VIDEO_SIDE =
3840`; anything larger is refused with a message before decoding.
- Preview: the first frame (or a scrubbed frame) is shown through the
  editor's preview path with the chosen layers; the marks keep one fixed
  placement for the whole video (smart placement is computed on the frame
  at 1 s, or the first frame for shorter clips; the user can switch to
  Corner/Custom as usual). Text tokens resolve once per video ({date} is
  the file's date).
- Output: same container as input when possible (MP4 → MP4 H.264, WebM →
  WebM VP9, MOV → MP4), "Quality" as a bitrate ladder (Low 2 Mbit/s,
  Standard 6, High 12 at 1080p, scaled by pixel count), resolution
  "Original" or "Fit 1080p / 720p". Audio is copied without re-encoding
  when the codec fits the container, else re-encoded to AAC (MP4) or Opus
  (WebM) at 128 kbit/s.
- Progress with frame count and ETA, Cancel, and the result downloads or
  goes to the share sheet. Nothing is uploaded; the gallery does not take
  videos in this milestone (a note says so; storage of videos is a later
  decision because of R2 cost).
- Processing runs in a dedicated Web Worker (`src/client/video/worker.ts`)
  with WebCodecs and mediabunny; the engine's `composeMark` runs there on
  an `OffscreenCanvas`. Browsers without `VideoEncoder` (Firefox ≤ 129,
  older Safari) see the page with "Your browser cannot encode video;
  Chrome, Edge or Safari 17 can", detected up front.

## Behaviour: PDF

- New tool "Documents" (`/app/documents`). Drop or pick PDFs (≤
  `MAX_PDF_BYTES = 50 MB`, ≤ `MAX_PDF_PAGES = 200` each, up to 50 files).
- The chosen layers are rasterised once per distinct page size to a
  transparent PNG at 150 dpi (`PDF_RASTER_DPI = 150`) through the engine
  (smart placement over a flat white "page" is meaningless, so on PDFs the
  smart mode falls back to bottom-right and the UI says "Smart placement
  is for photos; choose a corner or a custom position for documents"), and
  drawn onto every page with `pdf-lib`'s `page.drawImage` at the page
  size. Tiling works as on photos.
- Output: `<name>-watermarked.pdf`, one per input, ZIP for several;
  metadata: the PDF's Info dictionary is kept, `ModDate` updated,
  `Producer` set to "Watermark Pro".
- `pdf-lib` 1.17.1 (MIT; last release 2021, stable, widely used; note in
  §3.1 that it is unmaintained and that `@cantoo/pdf-lib` is the
  maintained fork to move to if a fix is ever needed). Everything runs in
  the browser; encrypted PDFs are refused with a message.

## Files

New: `src/client/video/{capabilities,probe,transcode,worker,worker-client}.ts`
(+ browser tests), `src/client/components/video/video-tool.tsx`,
`src/client/routes/app/video.tsx` (+ page test with a fake transcoder),
`src/client/pdf/{watermark-pdf,raster}.ts` (+ Node test with a generated
two-page PDF: `pdf-lib` creates it, the code marks it, `pdf-lib` reads it
back and asserts an image XObject on every page), `src/client/components/documents/documents-tool.tsx`,
`src/client/routes/app/documents.tsx` (+ page test), `e2e/video.spec.ts`
(desktop-chrome and android only: a 2-second generated MP4 fixture
committed under `e2e/fixtures/`, < 200 kB), `e2e/documents.spec.ts` (all
projects; a generated PDF fixture built in the test with `pdf-lib` in
Node).

Modified: `app-shell.tsx` (two entries), `scripts/lighthouse.mjs` and
`scripts/screenshots.mjs` (two pages), README, CHANGELOG, `vite.config.ts`
(a `video` chunk group for mediabunny so it is loaded only on that
route), `knip.jsonc` if the worker entry needs listing.

## Tests

Browser: capabilities detection; probe reports duration, size, codec and
refuses over-limit files before decoding; transcode of the 3 s fixture
with a text mark: frame count, marked region, audio track present when the
input had one; cancel mid-way resolves with `CancelledError` and releases
the encoder (no dangling `VideoFrame`: assert `frame.close()` was called
via a counting wrapper).

Node: PDF marking as above; page-size grouping (two sizes → two rasters);
encrypted PDF refused; page cap.

Page: video route shows the unsupported message when `VideoEncoder` is
absent (jsdom) and the tool when a fake capability says yes; documents
route lists files, runs the fake, downloads.

e2e: video journey on desktop-chrome and android (WebCodecs present):
upload the fixture, choose a preset, start, wait for "Done", download,
check the file starts with the MP4 `ftyp` box; documents journey on all
four: upload the PDF, start, download, `pdf-lib` loads it and every page
has an XObject.

Red drills:

| Name                                      | Mutation                        | Command                          |
| ----------------------------------------- | ------------------------------- | -------------------------------- |
| Video: limits checked after decoding      | probe skips the duration check  | browser `probe.browser.test`     |
| Video: frames never closed                | remove `frame.close()`          | browser `transcode.browser.test` |
| Video: mark drawn on the first frame only | compose only when `index === 0` | browser `transcode.browser.test` |
| Video: audio dropped                      | skip the audio track            | browser `transcode.browser.test` |
| PDF: last page unmarked                   | loop to `pages.length - 1`      | unit `watermark-pdf.test`        |
| PDF: page cap ignored                     | remove the cap                  | unit `watermark-pdf.test`        |
| PDF: smart placement used on documents    | fallback removed                | unit `raster.test`               |

## Docs

README: "Video" and "Documents" sections with browser support and limits;
SECURITY.md: both run in the browser; PDF parsing is `pdf-lib` on
untrusted input inside the page (no Worker exposure); threat model row.

## Certification checklist

- [ ] M17.0 spike result recorded in PLAN §8 (Chromium, CI, iPhone)
- [ ] gates, seven drills red, Lighthouse (two new pages), screenshots
- [ ] a 60-second 1080p phone video transcodes on the development machine
      in under 2× its duration (recorded in §8)
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 1.9.0, tag, deploy, release
