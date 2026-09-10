# Coverage exclusion audit — 2026-09-09

This read-only audit used temporary Vitest configurations. The canonical
configuration and coverage floors were not edited. Tests remained canonical;
no replacement tests, fake coverage counters, or instrumentation suppressions
were added for the measurement.

## Direct renderer proof

A browser-only run executed 29 canonical tests from pipeline, text-layout and QR
files. All 29 tests passed. With only the renderer exclusion removed in the
temporary configuration, V8 reported 173/221 executed statements and 17/18 called
functions. Actual counters included `drawMark:113`, `drawQr:7`, `drawQrRow:199`,
`paintGlyph:104`, and `measureAspect:25`; `drawArcLine` remained zero. This is
executed-code evidence, not merely a source-file entry in a report.

The claim that browser canvas code cannot report coverage is no longer true for
the current toolchain. The targeted report was 78.28% statements, 69.14% branches,
94.44% functions and 78.34% lines. Its nonzero exit reflects unchanged global
coverage floors applied to this deliberately narrow diagnostic target. It does
not establish a new per-file floor or represent the repository-wide result.

## Wider canonical-test sample

A second diagnostic run passed 180 tests across 25 files, covering existing cloud
SDK/network fixtures, canvas/PDF/video browser tests, and library/video UI tests.
The table records positive counters over instrumented counters, not percentages.
The report JSON is `temp/exclusions-browser-coverage/coverage-final.json`.

| Source                                             | Statements hit | Functions hit | Branches hit |
| -------------------------------------------------- | -------------: | ------------: | -----------: |
| `src/client/components/designer/logo-prepare.tsx`  |          68/85 |         16/17 |        17/32 |
| `src/client/components/import/onedrive-dialog.tsx` |          0/109 |          0/22 |         0/30 |
| `src/client/components/video/video-tool.tsx`       |         47/146 |          8/47 |        19/79 |
| `src/client/engine/render.ts`                      |        177/221 |         17/18 |        69/94 |
| `src/client/engine/worker.ts`                      |           0/10 |           0/3 |          0/2 |
| `src/client/lib/read-invisible.ts`                 |           0/12 |           0/1 |          0/2 |
| `src/client/lib/imports/dropbox-chooser.ts`        |          11/65 |          4/16 |         0/16 |
| `src/client/lib/imports/dropbox-save.ts`           |        103/124 |         16/20 |        32/42 |
| `src/client/lib/imports/google-drive-save.ts`      |          54/72 |         11/14 |        10/22 |
| `src/client/lib/imports/google-picker.ts`          |         15/108 |          6/26 |         4/39 |
| `src/client/lib/imports/onedrive.ts`               |         84/106 |         10/12 |        27/40 |
| `src/client/pdf/raster.ts`                         |          18/18 |           4/4 |          1/1 |
| `src/client/video/capabilities.ts`                 |          13/29 |           4/9 |         2/12 |
| `src/client/video/frame.ts`                        |            3/4 |           1/1 |          1/2 |
| `src/client/video/probe.ts`                        |          28/33 |           6/6 |         8/13 |
| `src/client/video/transcode.ts`                    |          65/77 |           7/7 |        20/29 |
| `src/client/video/worker-client.ts`                |           0/49 |          0/12 |         0/20 |
| `src/client/video/worker.ts`                       |           0/22 |           0/5 |          0/8 |

The temporary config intentionally included the old exclusions as targets. Its
combined 53.17% statement result is a diagnostic for those selected files, not a
new global quality threshold. An earlier broader directory selection included
three newly stale `importFromUrl` fixtures that omitted the now-required account
identity; that attempt's 220-test result was 217 passed/3 failed. The final sample
selected the actual exclusion subjects explicitly and passed all 180 tests.

## Classification and meaningful remaining gaps

- Remove the technical-inability rationale for renderer, logo preparation,
  provider modules, video main-thread components/helpers and PDF rasterization.
  These all produced positive executed counters. The PDF rasterizer recorded
  every statement and all four functions, including real rasterization.
- `onedrive-dialog.tsx`, `read-invisible.ts`, and `video/worker-client.ts` remained
  zero in this sample because the selected tests did not call them or substituted
  their boundary. They are ordinary main-thread code; source architecture gives
  no basis for an instrumentation exception. Tests need to cover their behavior,
  rather than preserving an exclusion to hide missing execution.
- Keep the actual worker-entry distinction. The real `WatermarkWorker` pipeline
  tests transfer a bitmap, wait for a result, and exercise worker-side failure,
  yet `engine/worker.ts` stays at zero. The video worker entry has the same
  execution boundary, although this selected video sample called the main-thread
  transcode function directly. Worker functionality still requires separate
  browser/E2E evidence; zero worker counters do not certify it.
- Small bootstrap/session-client seams can still be assigned to documented E2E
  coverage, but that is a test-strategy decision, not a claim that all browser
  modules are uninstrumentable. This audit did not certify those existing seams.
- The sample never executed `drawArcLine`, the file decoder in `read-invisible`,
  the OneDrive dialog, or the video worker client. It also did not call the actual
  `saveToGoogleDrive`, `saveToDropbox`, or `saveToOneDrive` entry functions, even
  though many of their helpers were well tested. Helper coverage alone cannot
  certify the whole save flow.
- A concrete correctness issue was found in `readInvisibleFromFile`: unavailable
  Canvas2D returned the same null result as an image with no hidden mark. The
  release owner assigned a typed failure fix plus an independent positive/no-mark/
  unavailable-canvas browser test. Actual provider save entry-point tests were
  also assigned. Those follow-up changes are separate from this diagnostic run.

The release owner will reconcile canonical exclusions and rerun actual global
coverage with its existing 90/90/90/85 floors. No floor reduction is proposed.

## Concrete follow-ups completed after the audit

The image-file reader now throws `InvisibleReadError` if a 2D context is
unavailable. Three native browser tests distinguish a marked PNG, an unmarked
PNG, malformed image bytes, and the unavailable-context failure, including
closing the decoded bitmap on failure. Combined with the existing Verify UI
tests, seven tests passed. A disposable mutation restored the former `null`
fallback; the unavailable-context assertion failed, and exact restoration passed.

Provider save entry points now have tests driving their actual implementations:
GIS script-load/token callbacks, the Dropbox PKCE popup and token exchange, and
the MSAL boundary fixture. Save functions and token-acquisition wrappers are not
mocked. Tests verify returned provider IDs and renamed filenames, multipart/raw
upload bytes, folder creation/reuse, OneDrive session completion, partial-batch
failure without sending later files, cancellation, and rejecting an app-account
change after lazy export. A six-file provider run passed 56 tests; actual counters
were `saveToGoogleDrive:5`, `ensureSaveFolder:2`, `saveToDropbox:4`, `uploadOne:3`,
and `saveToOneDrive:4`. The selected three-file branch aggregate was 83.65%; this
remains a scoped diagnostic, not a claim about the new canonical global result.

An additional curved-text browser test compares exported pixel centroids at both
ends of the text with the middle. Positive and negative curvature must bend in
opposite directions, while a zero-curvature control stays straight. The test
passed. A disposable mutation forced the straight-text branch for curved input;
the direction assertion failed, and exact restoration passed. This tests a real
previously unexercised rendering behavior rather than merely calling a function
to increase coverage.

Logs and exact-restoration records are under
`temp/recent-privacy-red-20260909`; no live source was mutated for either drill.

## Canonical integration and behavioral gaps

The canonical configuration now includes ordinary main-thread canvas, cloud,
media, locale and PDF modules. Its remaining exceptions are startup/generated
seams, the dedicated worker entries and workerd-only binding wiring. The global
floors remain 90% lines, statements and functions, and 85% branches. Source
comments that described main-thread media/PDF modules as coverage-excluded have
been corrected to describe the native browser tests and measured execution.

The first complete passing test phase after this change ran 2,227 tests across
199 files. It measured 9,440/10,363 statements (91.09%), 4,620/5,545 branches
(83.31%), 2,148/2,382 functions (90.17%) and 9,079/9,931 lines (91.42%). The branch
gate correctly failed; the later workerd and script stages did not run in that
attempt. The preceding attempt had four real cross-account response failures
(500 instead of the expected neutral 403); the session middleware was corrected
and independent mutation-preservation assertions were added before this result.

Additional tests exercise the actual Google and Dropbox picker entry points.
They replace SDK globals/script-load events and HTTP responses at the external
boundary, while leaving token acquisition, picker orchestration, ownership
checks, download conversion and URL validation intact. They cover successful
file bytes and ordering, cancellation, missing configuration/SDK APIs, script
and module failures, token rejection, unexpected download hosts, failed batch
downloads, and stale account callbacks/results. The four-file picker diagnostic
passed 43 tests and measured 50/55 branches, 170/173 statements and 41/42 functions
before the subsequent Dropbox retry fix. This remains a scoped diagnostic, not
the final global coverage result.

Nine OneDrive dialog tests drive the real rendered dialog, folder breadcrumbs,
selection changes, retries and visible download errors. The Graph/auth boundary
is controlled so tests can resolve sign-in, folder listings and downloads after
an account change; none may import old-account files or redisplay old rows.

Nine video worker-client tests exercise the real wrapper against a Worker
message boundary: transfer lists, job IDs, progress, stale messages, overlapping
requests, cancellation acknowledgement, failure/crash handling and disposal.
Two new regressions failed before their fixes: a synchronous `postMessage`
failure left the wrapper permanently busy, and starting work after termination
posted to a dead worker with no possible response. The wrapper now releases a
failed transfer and returns a typed error, and refuses starts after termination.
The full nine-test file passed after the corrections.

The Dropbox entry tests also exposed a transient-load failure that remained
cached for the whole page lifetime. The failing script is now removed and its
pending cache entry is cleared on rejection. Concurrent callers still share
one attempt; the regression fails the former implementation when the next user
retry reuses its rejected promise, then passes after the fix. All 14 Dropbox
entry tests pass after the change.

Local logs are `temp/lumafoil-tests-coverage-final-2.log`,
`temp/lumafoil-picker-coverage.log`, `temp/lumafoil-coverage-gaps-tests.log`,
`temp/lumafoil-video-worker-client-{red,green}.log`, and
`temp/lumafoil-dropbox-retry-{red,green}.log`. None of these focused checks
substitutes for the canonical final test chain or the separate UI, SAST and
release gates.

## Final canonical test chain — 2026-09-09

After the focused improvements and the video preparation-cancellation fix,
`npm run test` completed with exit 0 on frozen runtime and test sources. The
canonical log is `temp/lumafoil-tests-coverage-final-3.log`.

| Coverage metric | Executed / total | Percentage | Required |
| --------------- | ---------------: | ---------: | -------: |
| Statements      |   9,679 / 10,381 |     93.23% |      90% |
| Branches        |    4,730 / 5,553 |     85.17% |      85% |
| Functions       |    2,213 / 2,382 |     92.90% |      90% |
| Lines           |    9,308 / 9,947 |     93.57% |      90% |

All 2,277 coverage-phase tests passed across 202 files. The separate workerd
phase then passed 42 tests across 12 files, followed by 3 owner-bootstrap tests,
4 performance-gate/proxy tests, 9 publication-policy/scan tests and 5 vendor
download tests. The complete chain passed 2,340 tests/checks with no failures.
TypeScript, focused ESLint and Prettier checks also passed for the changed files.

The final picker diagnostic after retry recovery passed 44 tests across four
files with 54/59 branches (91.52%), 177/180 statements (98.33%) and 41/42
functions (97.61%). The video UI/capability diagnostic passed 22 tests with
88/95 branches (92.63%); it includes cancellation and unmount while logo/font
preparation is pending, preventing a worker start after either event. These
diagnostics are retained at `temp/lumafoil-picker-coverage-final.log` and
`temp/lumafoil-video-coverage.log`; the canonical global table above determines
the coverage gate result.

This closes the local canonical test/coverage gate for this source state. It
does not certify the full `quality` command, UI end-to-end accessibility checks,
SAST, Lighthouse, screenshots, hosted provider flows or release publication.
Those gates remain separately tracked by the release owner. Remaining worker
entry and workerd-binding exclusions still require their separate runtime proof;
the passing global percentages do not claim those contexts are V8-instrumented.
