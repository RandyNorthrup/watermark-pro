# Inline media editors — verification record

Date: 2026-09-12. This is an integration record, not a deployment certificate.
The release owner runs the combined quality, SAST, browser and hosted gates.

## Durable checks

`scripts/fixtures/capture-media-workflows.mjs` exercises the built application
at the isolated loopback gate. It creates disposable verified accounts with
separate private workspaces and claims first-use tips as a returning-user
fixture. It never changes production accounts or uses production storage.

The fixture checks folder creation and template saves, canvas selection and
thick-stroke containment, scroll handoff at toolbox boundaries, PDF page
navigation and export, native video playback and timestamp poses, and mixed
image/PDF/video processing. It saves screenshots, accessibility results and a
per-workflow report in the ignored `temp/media-browser-qa` directory. Each
workflow reports its own failure; the script exits unsuccessfully if any
workflow fails. Marketing screenshots are not replaced by this fixture.

Existing Documents and Video E2E tests now follow their inline editors. PDF
checks retain independent assertions for original page dimensions, vector
content, metadata and visible nonempty watermark pixels. Video checks require
native playback before validating keyframes/fades and the exported tracks,
dimensions, duration, codec and audio.

The new route behavior passed 28 focused tests across Documents, Video, folder
pages and the folder-navigation race. These cover page navigation, inline
editing, ordered layers, export reuse/invalidation, sharing, decoder/encoder
failures, cancellation, changed source/spec/account, and late asynchronous
completion. Node route tests replace native decoder/viewer boundaries; real
pixels and codecs remain the responsibility of the browser checks.

## First built-browser pass

The first pass used desktop Chromium and a Pixel 7 Chromium profile. It found
two real integration blockers despite passing lower-level media tests:

- The PDF.js worker and companion files were not emitted into the build.
  Requesting the worker returned the SPA document instead of JavaScript. Both
  the PDF reader and PDF processing in Bulk failed. The release owner fixed
  the build plugin's early `index.html` guard and added independent built-asset
  verification. The release-candidate browser pass now closes this finding.
- Native video playback was blocked by the document CSP: `media-src` was
  missing, so local blob URLs fell back to `default-src 'self'`. Export and
  timeline controls worked, but the preview was blank and displayed an error.
  This is not recorded as a successful video workflow. The fixture now requires
  decoded native frames, advancing playback and no playback alert; the release
  owner corrected the document policy. The release-candidate pass now confirms
  decoded native frames, advancing playback and no playback alert.

The same first pass verified folder/template destination persistence after the
folder view committed; Image selection by click/tap, outside dismissal and
Escape; thick-stroke containment; and zero axe violations on the inspected
folder, Image and timeline surfaces. Desktop wheel handoff moved the enclosing
page through its real 146-pixel scroll range. The phone handoff check was
expanded to observe the document scrolling element and still needs its fresh
run. Bulk's photo and video jobs completed, while the PDF job failed for the
missing worker; a successful mixed ZIP is still required.

The folder pass also exposed a fast-interaction race: the New Folder dialog
could close before navigation committed, allowing an immediate template click
to capture the previous root destination. Folder creation now awaits navigation
before dismissal, with a delayed-navigation regression test. PDF loading also
no longer exposes a meaningless zoom percentage based on placeholder 1×1
dimensions.

## Release-candidate browser results

The final durable fixture passed all five workflows on desktop Chromium and
Pixel 7 Chromium: folders/templates, Image, Documents, Video, and mixed Bulk.
Every inspected surface had zero axe violations, no horizontal page overflow,
and no uncaught browser errors. Native PDF page navigation/export and the mixed
PNG/PDF/video ZIP now pass. Native video playback, pause/seek, two timestamp
poses, both fades and exported dimensions/audio/duration pass on both devices.

Image checks hold the pointer beyond each photo edge, rotate the watermark,
resize it beyond the available area, then crop to 1:1 and zoom to 35%. The
frame and both visible control boxes remain inside the actual image rectangle.
The selection border/shadow are inset; controls project inward near an edge;
invisible hit padding is clipped to the image. Image and overlays use one CSS
rectangle so a separate observer cannot retain stale bounds after zoom/crop.
Both desktop and phone now pass real scroll handoff at toolbox boundaries.

The template preview clipping found during product capture is also corrected.
Intrinsic SVG bounds fit the full rotated text uniformly into narrow tiles.
A native SVG test checks all 18 labels at 82- and 140-pixel widths, and a
negative control removing the fit constraints produces actual text overflow.

Additional focused evidence includes 41 Editor/overlay tests, 10 real native
VideoViewer/resource browser tests, and 20 Bulk page tests. The native tests
exercise decoder playback, actual canvas pixels, resource failures/retries,
workspace changes, and bitmap disposal; they do not replace the player with a
stub. Bulk tests cover mixed output types, image-only Gallery saves and their
destination, directory drops, sharing errors, and missing image dimensions.

## Remaining release boundary

The canonical four-device run exposed a cold Image export race: immediately
opening a saved preset could enable Save before the lazy sample subject was
ready. Export now shares the initial sample decode before capturing its source
request, and Download, Save and Share wait for metadata intake, the current
decoded subject and its first frame. Failed or replaced real-photo requests
still reject exports instead of returning the previous subject. The focused
renderer/hook/Editor run passed 16 native browser tests and 23 UI tests. Removing
the sample initialization reproduced the stale-subject exception; removing the
UI readiness check reproduced enabled export buttons during pending metadata.
Both files were restored byte-for-byte and both targeted regression checks
passed again (`temp/readiness-red-*.log`, `temp/readiness-restored-*.log`). The
current built gate predates this fix, so rebuilt E2E confirmation remains open.

The same canonical run identified obsolete E2E targeting after the UI refactor:
Grid versus Snap To Grid, Save versus Save Location, duplicate preset links in
Recents and Library, the Workspaces table label, and the new default PNG format.
Selectors now target exact names or their intended region. Manual invite signup
journeys use the existing returning-user tip setup; dedicated guide verification
still tests fresh users. The Gallery journey retains its locator deadlines and
all upload/download/deletion assertions, with a documented larger total budget
for its four accessibility scans on mobile. The three-preset QR/sticker journey
and two-account admission/join/role journey receive the same individually
documented total-budget treatment after traces showed progress until the test
deadline. Offline Gallery now scrolls its lazy thumbnail into view before
asserting decoded pixels, matching a user's browse action after the added
Recents and folder toolbar. Recent Work reuses the established exact-worker and
visible app-readiness check before disconnecting; its rebuilt offline replay
remains to be verified.

The iPad administration journey also found that successful workspace creation
and activation could wait on unrelated old-workspace preparation queries before
navigating. The submission now uses the canonical shell-only reset, checks
activation failures, handles thrown transport errors, and fences later steps
against account changes or a closed form. Eight focused workspace submission
tests pass, including navigation while an independent active query remains
pending, retained form values on creation/activation errors, rejected activation,
and account switches during each server step. Reintroducing global awaited
invalidation reproduced the navigation hang; exact restoration made the same
case pass (`temp/workspace-navigation-red.log`,
`temp/workspace-navigation-restored.log`). Rebuilt E2E remains required.
The same global wait was removed from both workspace invitation acceptance
routes while retaining their activation failures and account guards. The final
combined app-page, workspace-access and auth-error run passes 39 tests, including
real pending-background-query assertions for both invitation flows
(`temp/workspace-transitions-unit.log`). No permission/refusal assertion was
removed.

The source-state integration pass on 2026-09-12 fixed three additional behaviors:
saving an animated draft now transfers its timeline to the saved layer;
replacing a video resets clip-specific intervals/keyframes and old-clip undo;
and editing after Clear creates a visible new draft. The combined focused run
passed 23 scene, Video route and landing checks (`temp/media-state-integration.log`).
Reintroducing the two video defects caused the exact expected failures: Fade In
fell from 1 to 0 after saving, and a replacement clip retained Start 8 instead of 0. Source was restored byte-for-byte, and both regression cases then passed in
`temp/media-state-regression-restored.log`. The red wrapper's initial log matcher
did not handle multiline diagnostics, so that wrapper itself reported an error;
the actual failing assertions were inspected independently. These fixes remain
unpublished pending the combined release.

Full canonical E2E, final quality/SAST completion, hosted checks and deployment
remain the release owner's gates. Product screenshots are recaptured from the
final UI artifact. First-use guide content and targets are reconciled only
after the final UI is stable. No deployment was performed by the media
verification agent.
