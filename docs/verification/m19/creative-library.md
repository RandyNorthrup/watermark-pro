# Creative library verification — 2026-09-08

This report covers the creative-library portion of the ongoing M19 change. It
does not certify the production release or the complete browser/device matrix.

## Implemented behavior

- **551 distinct font families**, including the existing 51 pinned Fontsource
  packages and 500 vendored families. Weights are not counted as families.
  Search filters the native family selector while retaining its current value.
  Changing families selects the nearest weight that the new family actually
  ships in the same state update; selecting Lobster from a 600-weight Inter
  mark now saves 400 rather than an unavailable weight.
- All 551 families have locally served license notices. The original 51
  notices are copied reproducibly by `python scripts/vendor-font-licenses.py`,
  with npm package versions, lockfile integrity and notice SHA-256 values in
  `public/fonts/licenses/packages.json`. The additional 500 retain their
  existing `public/fonts/manifest.json` provenance. The font selector links to
  the selected family's notice.
- **400 distinct Microsoft Fluent color sticker designs**, 50 in each of
  eight categories. There is one base/default design per entry; skin-tone
  variants are not counted as extra designs. Search matches names and
  keywords. Category filtering, pagination, accessible selected states, and
  48-pixel minimum grid cells keep the catalogue usable on narrow screens.
- Stickers are static same-origin SVGs. Presets store an allowlisted catalogue
  ID, never an arbitrary SVG or URL. The shared API/import schema rejects
  unknown IDs and path traversal. Rendering rasterizes the actual vector at
  2048 pixels before passing a fresh transferable bitmap to the existing
  photo, bulk, video and PDF mark pipeline. No private logo request is made
  for a bundled sticker.
- The library has a **New QR code** entry and **QR codes only** filter. Each
  named QR preset stores its own destination and can be reopened, edited and
  reused separately. QR defaults are opaque and unrotated. The existing
  renderer now has a four-module quiet zone and integer-aligned module edges.
- Designer mark tabs and editor tool tabs wrap to available width; long tool
  labels no longer depend on a five-column layout that clips their text.
- Portable preset export loads private logo bytes through the account-scoped
  offline media reader instead of a direct fetch, preserving offline export
  behavior and authorization error handling.

## Asset source and rights

Sticker source: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)
at commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`.
The [MIT license](https://github.com/microsoft/fluentui-emoji/blob/1ffb34c752ecf5d402f04cfb4b392c77f57c54bc/LICENSE)
permits reuse, modification and commercial distribution, subject to retention
of its notice. The full Microsoft copyright and permission notice ships at
`/stickers/LICENSE.txt`, linked beside the picker; provenance records the
upstream commit, source paths, Git blob hashes and SHA-256 file hashes.
Redistribution of the asset collection must preserve that notice. No Icons8
artwork is bundled. The original Lucide icon and operating-system emoji
pickers remain separate from the 400 licensed vector stickers.

`python scripts/vendor-stickers.py` was executed successfully: **400 designs,
eight categories, 9,061,221 SVG bytes**. It verifies source bytes against Git
blob SHA-1, refuses active SVG elements and external references, and emits
content-hashed same-origin files. The landing contact sheet uses 20 of these
same vectors, with unique gradient IDs, at `public/product/stickers.svg`.
Fonts retain their individual OFL or Apache notices; no font files are fetched
from a third-party origin while the application runs.

## Executed focused verification

- `npx vitest run --project unit-client
src/client/components/designer/creative-pickers.test.tsx
src/client/stickers/catalogue.test.ts src/client/fonts/catalogue.audit.test.ts
src/client/routes/app/library-pages.test.tsx src/client/lib/spec-edit.test.ts
--maxWorkers 2`: **977 passed**. Includes actual on-disk font/notice checks,
  all 400 sticker hashes and parsed SVG safety checks, search/filter/paging,
  supported font weights, portable sticker round trip and rejection, and
  separate QR destinations through the routed library UI.
- `npx vitest run --project unit-client src/client/stickers/load.test.ts
src/client/lib/mark-resources.test.ts --maxWorkers 2`: **4 passed**. Includes
  local catalogue URL resolution, decode/canvas errors, no external IDs,
  emoji font-stack handling, font deduplication and private-logo cache reset.
- `npx vitest run --project browser src/client/stickers/load.browser.test.ts
src/client/engine/qr.browser.test.ts --maxWorkers 2`: **10 passed** in real
  Chromium. Every one of the 400 SVGs decoded. A 2048-pixel cherry sticker
  produced colored output pixels through the actual PNG export pipeline,
  while unmarked corners remained white.
- QR proof uses independent `jsQR`, not the encoder's matrix. Three payloads
  (including multilingual text) decoded exactly. An unmarked image returned
  no QR. A QR at the default 18% scale on a 1200×800 image, rotated 15 degrees,
  decoded in PNG, JPEG and WebP exports. This is bounded test evidence, not a
  guarantee for every payload, output size, print surface or scanner.
- Two targeted red drills passed: restoring the unsupported font weight made
  the picker test fail; accepting arbitrary sticker IDs made the boundary
  test fail. Each source file was restored byte-for-byte, and each targeted
  test then passed. Logs are `lumafoil-font-weight-{red,green}.log` and
  `lumafoil-sticker-boundary-{red,green}.log` in the task's temporary log folder.

## Remaining release evidence

The full quality, coverage, SAST and browser/device gates remain with the root
integration task. The production-build Playwright journey in `e2e/library.spec.ts`
now covers two saved QR codes, a searched sticker, preview rendering, filtering,
reopening the original destination and axe checks, but it has not yet been run
against a fresh integrated build. Offline cache inclusion and account switching
are owned by the offline/private-account tasks. Hosted provider flows and
production deployment are outside this focused report.

## Export licence retention follow-up

The picker link alone was not treated as sufficient downstream notice delivery.
The primary Microsoft MIT licence requires retention of its copyright and
permission notice. The existing [Lucide licence](https://lucide.dev/license)
also requires notices (ISC and the applicable Feather MIT text). Neither asset
collection is described as attribution-free.

The renderer now retains the full applicable notice for bundled stickers and
icons in JPEG comments, PNG international text, and WebP XMP. The required
notice is separate from the user's choice to remove source photo metadata.
WebP's extended header, XMP flag, dimensions, padding and alpha are preserved
according to the [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).
PDF exports include a licence attachment. Video exports retain the notice in
MP4/WebM comment metadata. Photo/document ZIPs include one
`Lumafoil-artwork-licenses.txt` sidecar when their actual outputs use licensed
bundled artwork. Text-only and uploaded-logo-only exports do not receive these
Microsoft/Lucide notices. Each notice explicitly excludes ownership of the
user's original photo, video, document, logo or text.

`/stickers/USAGE.txt` and the translated picker guidance explain retention and
the fact that other editing tools or publishing platforms can strip metadata.
Users must then retain the full applicable notice alongside the redistributed
artwork by another supported means. Embedded notice retention is implemented;
legal sufficiency for every downstream publishing context is not certified.

Focused byte/ZIP/PDF tests: **10 passed**, with **99.09% statements, 96.15%
branches, 100% functions and lines** on the new notice helpers. Browser checks
proved unchanged decoded pixels for JPEG/PNG/WebP, retained WebP alpha, and
the full licence text. Both MP4 and WebM round-tripped the complete comment
notice with no Microsoft artist tag; decoded frame count was preserved. The
PDF attachment was decoded independently and matched the full notice while
the original author and title remained unchanged. The original PNG test
fixture was unsuitable for strict chunk inspection, so the existing canonical
metadata-container fixture is used for byte-structure checks; real browser
encoding supplies the independent pixel/decoding proof.

## First photo workflow follow-up

An empty personal workspace now offers **Create watermark** directly inside
the editor. It opens the existing full designer over the user's current photo,
saves a real account-scoped library preset, applies it as a layer and returns
to that photo without a workspace/library navigation. The designer code is
loaded only when opened. Read-only members do not see a creation action.

The editor/library unit suite passed **32 tests**, including creation, applying
the saved spec, keeping the chosen photo, exporting, and the negative viewer
case. A fresh isolated production build with workerd on localhost:5289 then
passed the same complete first-photo journey on **desktop Chrome, iPhone,
iPad and Android**. Each run checked axe with zero violations, no horizontal
page overflow, persisted the preset, downloaded a real 960×640 PNG and used
an independent decoder to prove that watermark pixels changed the original
solid-color photo. The test uses the automatically created personal workspace;
the earlier extra-organization setup raced a late navigation in WebKit and was
removed from this first-use scenario. The separate shared test helper issue
was reported to the account owner.

The isolated copy used a generated test-only authentication secret and its own
local D1 storage; no real `.dev.vars` or production data was copied. Desktop and
iPhone designer screenshots were visually reviewed. All four device screenshots
are retained in `temp/creative-e2e-20260908/test-results`. This focused journey
does not replace the full integrated release/device suite.

## Asset-download and XML audit follow-up — 2026-09-09

The vendoring scripts now accept only HTTPS URLs on their explicit upstream
host lists, reject credentials, unusual ports, fragments and control characters,
and never follow redirects. Both use an explicit `ssl.create_default_context()`.
Five Python test methods cover approved requests, rejected origins/schemes,
redirect/error responses, certificate and hostname verification flags, Git-cache
identity/path checks, modified blobs, and mixed-case external SVG references.
The fixture's Git object ID was independently obtained with `git hash-object`.
Live reads also verified Fontsource metadata, pinned npm metadata, and the pinned
Fluent licence object. The observed interpreter was Python 3.14.0.

WebP XMP text now uses the same established Hono escaper used by the application's
mail templates. Its basic and numeric character references are valid XML text.
Eight unit/browser tests passed, including independent XML parsing of malicious
markup-like text, full licence text recovery, and unchanged decoded image pixels.
Tests read parsed XML content instead of incorrectly requiring unescaped quotes
inside the serialized XML bytes.

Semgrep's scoped scan ran 455 applicable rules over the four changed audit
targets with zero findings after three explicitly approved, line-specific audit
exceptions. These are documented in `PLAN.md` §9; no directory/rule blanket
ignore, dependency change, or threshold reduction was used:

- The two `HTTPSConnection` calls are flagged by an
  [unconditional API-use rule](https://raw.githubusercontent.com/semgrep/semgrep-rules/develop/python/lang/security/audit/httpsconnection-detected.yaml).
  The rule's concern is historical Python behavior; the explicit context is
  verified by tests to require certificates and hostname matching, consistent
  with the [Python HTTPSConnection documentation](https://docs.python.org/3/library/http.client.html#http.client.HTTPSConnection).
- The Fluent object comparison must retain Git's SHA-1 object identity semantics,
  described by [Git's object-format documentation](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).
  Vendored asset records also contain SHA-256 digests. The
  [SHA-1 rule](https://raw.githubusercontent.com/semgrep/semgrep-rules/develop/python/lang/security/insecure-hash-algorithms.yaml)
  matches every call, including this `usedforsecurity=False` object-ID use;
  mechanically substituting SHA-256 would no longer compare the upstream Git ID.

Full repository SAST remains a separate integrated gate run by the release owner.
