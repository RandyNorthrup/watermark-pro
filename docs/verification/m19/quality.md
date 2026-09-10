# Integrated quality verification

On 2026-09-09 (America/Los_Angeles), `npm run quality` completed with exit 0
after the bootstrap, diagnostic-privacy, publication and logging-configuration
changes. Runtime and test sources were frozen for this run. This is a verified
integration checkpoint, not full production-launch certification.

## Executed gates

Formatting, ESLint, Stylelint, TypeScript, dead-code detection, all 1,043
translation keys, dependency cycles and duplication checks passed. The source
publication gate passed 7,284 candidate/object checks and 114 archive entries,
comparing four configured private values without exposing them. Five occurrences
of the revoked Picker key were recognized only in historical scan copies, with
one exact immutable historical finding accepted. Dependency audit reported zero
vulnerabilities.

The canonical test chain passed **2,400 tests/checks**:

- 2,331 unit/browser coverage tests across 207 files.
- 42 real workerd tests across 12 files.
- Three owner-bootstrap, four performance-tool, fifteen publication and five
  asset-download boundary tests.

Global coverage remained above the unchanged floors:

| Metric     | Observed | Required |
| ---------- | -------: | -------: |
| Statements |   93.13% |      90% |
| Branches   |   85.14% |      85% |
| Functions  |   92.94% |      90% |
| Lines      |   93.49% |      90% |

The production build then passed **38 independent artifact checks**, including
all translated static pages, CSP hashes, bundled license text, corresponding
source and the generated disabled-logging profile. All measured byte budgets
passed; the application JavaScript shell measured 139.1 KiB gzip against the
140 KiB limit. The built-output publication scan passed 2,388 candidate/object
checks and 114 archive entries with no retirement exception used.

## Failures corrected before this checkpoint

The first attempt stopped at duplicated delayed-response test setup. A single
case matrix now retains the account/session/workspace assertions for every
success, denial and delayed-body case; the duplication gate reported zero
clones afterward.

The second attempt passed static gates and 2,330 tests, then one editor test
waited for the transient empty-picker label. Its URL-selected preset changes
that label. The test now waits for the final selected-preset control before
testing crop/resize/export behavior, and its twelve-test suite passed before
the complete successful rerun. No timeout, coverage floor or gate was weakened.

## Evidence and remaining limits

The ignored canonical log is `temp/lumafoil-quality-release-current-3.log`,
SHA-256 `a98010ab5f6bcca4cada2113f0383ec4e3cab00a103b7e75b588d321cc43add0`.
The contemporaneous delivery-input snapshot is
`temp/lumafoil-quality-current-snapshot.json`, SHA-256
`4f58abadd6e5b3629e4f4ad3caf574b42d1356a9f338749e4d24e64ab720a18d`.
The snapshot records source/rule/configuration fingerprints; it is not itself
passing test evidence.

`quality` does not run the separate Semgrep, full Playwright/axe, screenshot or
Lighthouse commands. Final startup optimization, its fresh artifact, all-page
performance and visual evidence, hosted identity/cloud journeys, migration,
cutover and provider branding approval remain required. Later source changes
must receive their applicable checks again; do not apply this checkpoint to an
uninspected final release candidate.

## Subsequent focused checks and browser failure

After route-specific resource hints and the private SQL preparation helper were
added, the separate Semgrep command passed 509 rules over 1,826 targets with no
findings. Eight Python files, including both recovery files, were in the scanned
language inventory. Approximately 99.9% of lines parsed; thirteen PNG assets larger
than 1 MB were skipped by the scanner's default size limit. An independent size
inventory found no executable source over that limit. The ignored log is
`temp/lumafoil-sast-final-runtime.log`. Later gate/HTTP2/launch-handling changes
still require their own applicable verification.

The first complete four-device Playwright attempt then failed: ten passed,
61 failed, two skipped and eleven did not run. The server exited after about
90 seconds with Wrangler's `Error inside ProxyWorker` / `Network connection
lost.` failure; subsequent connection-refused results cannot diagnose app
behavior. Separate earlier failures identified obsolete onboarding/selection
assumptions and an ambiguous font locator. One offline conflict journey stopped
while installation was still preparing, before its offline transition. That
assertion remains intact pending investigation. These are unresolved browser
gates, not a certification pass.

The failure log is `temp/lumafoil-e2e-release-current.log`; detailed browser
contexts and traces remain in ignored `test-results/`. Root's readback of the
specific Wrangler debug log confirmed the proxy failure, which matches an
[open upstream regression](https://github.com/cloudflare/workers-sdk/issues/15317).
The proposed upstream fix was still unmerged when reviewed; a successful local
test-runtime replacement and fresh complete browser run are required.

## Supported gate and focused rerun

The supported SDK/native service-and-asset gate subsequently passed 84 routing
parity cases, eight protocol/startup checks, and actual cancelled-download and
rejected-request follow-up checks. A focused desktop browser run on that gate
finished with ten passes and two failures in 2.6 minutes; the server remained
available. The PDF failure was a test reader rejecting legitimate pdf-lib
normalized streams and has been corrected. The offline conflict test omitted
the real service-worker lifecycle wait; after adding it, the complete conflict
journey passed in 31.9 seconds with unchanged assertions and timeout. These
results do not certify the complete four-device matrix.

The latest application coverage run passed 2,357 tests with 93.2% statements,
85.25% branches, 93.03% functions and 93.54% lines. Subsequent CSV-report,
date-formatting, gate and audit-inventory changes require the final integrated
quality run. Current focused logs are `temp/lumafoil-e2e-sdk-focused.log`,
`temp/lumafoil-offline-conflict-lifecycle.log`, and
`temp/lumafoil-coverage-launch-current.log`.

## Integrated SDK, fallback and audit-inventory checkpoint

The subsequent `npm run quality` completed with exit code 0. Its application
projects passed 2,360 tests in 207 files; the real Workers project passed 42
tests in twelve files. Coverage remained above the unchanged floors: statements
93.2%, branches 85.25%, functions 93.03% and lines 93.55%. The command also passed
three bootstrap checks, eight gate checks, 21 performance/audit helper checks,
15 publication checks, 24 Python asset/recovery checks and 40 built-artifact
checks, together with formatting, lint, types, unused-code, localization,
duplication, cycle, dependency-audit and bundle checks.

The built-output publication scan passed 2,387 candidate/object checks and 114
archive entries with four configured private values compared and no historical
exception applied to current artifacts. Source/index/history scanning passed
9,869 candidate/object checks and 228 archive entries; only the exact revoked
historical key exception remained. The canonical ignored log is
`temp/lumafoil-quality-sdk-final.log`, SHA-256
`92713dfda669ceff1fbc2460b78d37786c0f87f4bc5da4e5f3ba62560ec579ad`.

This checkpoint includes the PDF canvas fallback and earlier route-preload
discovery. The subsequent direct-Node commit hook configuration separately passed
real Windows invocations above 21,000 argument characters, formatting/typed-lint/
CSS negative controls, exact restored green and staged/unstaged preservation.
Its ignored receipt is `temp/lumafoil-lint-staged-proof.json`.
The checkpoint does not certify remote CI, the corrected full device matrix, final visual/performance matrices, full
failure-drill run, or hosted deployment. Those remain explicit release gates.

## Offline transport and Linux sandbox checkpoint

After integrating the WebKit outage transport, pinned Linux sandbox setup and
shared Node response helper, the complete `npm run quality` command passed again.
It includes 2,361 application tests, 42 real-Workers tests, twelve gate/transport
checks, 26 performance/audit helper checks and 40 built-artifact checks. Coverage
remains above the unchanged floors at 93.2% statements, 85.25% branches, 93.03%
functions and 93.55% lines. Source scanning passed 12,128 candidate/object checks
and 228 archive entries; built scanning passed 2,387 checks and 114 archive
entries, with four configured private values compared.

The canonical ignored log is `temp/lumafoil-quality-offline-sandbox-2.log`,
SHA-256 `8642b31c4c4f9fddea69ea19e11fa2dfdc95814cd5b9bf6df43668900710b55f`.
The Windows pass validates configuration, trust/refusal branches and the real
certificate browser check. The new Linux helper installation still requires its
fresh hosted-runner preflight, and all 104 device cases require the new-head CI
run. Full UI, performance, red-drill and hosted release gates remain open.

## Hosted runner and device findings

CI for commit `94d2b941837ac0215a83924d232227f1bf3cf7aa` proved the pinned
publisher sandbox helper on GitHub's Linux runner, then passed quality, SAST and
dependency review. The four device jobs completed 98 of 104 journeys: desktop
24/26, Android 24/26, iPhone 25/26 and iPad 25/26. All six WebKit offline,
reconnect, replay and Recent work journeys passed remotely, as did the earlier
iPhone bulk/video reflow fixes.

The six failures reduce to two shared causes. All devices used an exact-text
locator against a composite filename-feedback paragraph; desktop and Android
also proved the token menu returned focus to its trigger after insertion. The
feedback now has an explicit accessible description/invalid state, and token
selection preserves the text destination while Escape retains normal trigger
focus. Eighteen focused tests pass with positive and negative behavior. Fresh
104-case CI remains required for these corrections.

The first release UI jobs proved the Linux browser launch, then exposed a shared
audit-lifecycle defect: Lighthouse had already closed its measured target before
the post-run content assertion. Those jobs were stopped rather than repeating
the same failure. The runner now retains that exact target through content and
image checks; focused home and populated-dashboard samples pass the corrected
check. Full remote UI audits remain open.

## Final interaction and selected-dashboard checkpoint

With the corrected interaction behavior, stable Recent work panel, compact phone
thumbnails, redundant font-preload removal and exact Lighthouse page ownership,
`npm run quality` passed again. The run includes 2,363 application tests, 42
real-Workers tests, twelve gate/transport checks, 28 performance/audit helper
checks, 15 publication checks, 24 Python asset/recovery checks and 40 built-output
checks. Coverage remains above the unchanged floors: statements 93.21%, branches
85.24%, functions 93.04% and lines 93.55%.

Source/index/history scanning passed 12,161 candidate/object checks and 228
archive entries. Built scanning passed 2,387 checks and 114 archive entries; four
configured private values were compared, with no historical exception applied
to current output. Bundle budgets passed. The ignored log is
`temp/lumafoil-quality-interaction-performance.log`, SHA-256
`9730714a922c71ac5b5b3510a575b368b439a2b016c38f69a993963999bbdf54`.

The populated dashboard separately passed its required five mobile traces, but
the complete route/UI matrices, new-head 104-case device run, full red drills and
hosted release proof remain open.

The next Linux quality run exposed one remaining test race: an editor test waited
for the transient empty `Preset` label while its URL-selected preset was still
being applied. The same file already defined the stable selected-state contract.
That test now waits for `Add another preset`, as the user-visible final control;
no timeout or product behavior changed. Fresh integrated and remote checks remain
required.

## Complete red drill and first full UI matrix

The complete current-source red drill ran all 93 declared faults. Every mutation
produced the intended nonzero gate and the runner restored the exact source
after each case. The committed report is
[`docs/red-drill/2026-09-10.md`](../../red-drill/2026-09-10.md); the ignored log
is `temp/lumafoil-red-drill-final.log`, SHA-256
`4684e17232b927beab29520beb3fd109aca5b963ca86dc4b53cfc50f8ef9c479`.

GitHub run `34498423486` completed all 72 UI jobs on commit `5d55ade`. It
confirmed HTTP/2 transport and 100 accessibility/best-practices scores on every
completed Lighthouse route. It also exposed release-blocking evidence rather
than being accepted as green: Library and Invitations had deterministic desktop
CLS, one designer content check observed a transient heading, every mobile route
missed at least one timing or CLS budget on the hosted runner, and the four
visual jobs found a modal-language-menu accessibility failure plus filled
designer overflow on phone, tablet and Android.

The fixes preserve the gates. Library and referral controls now occupy their
final geometry while loading; selected desktop traces reduced CLS to 0.0041,
and phone diagnostics reduced both routes to zero. The language chooser is a
labelled nonmodal menu. Filled English/Arabic designers pass four production-
build device checks with decoded previews, exact direction/headings, in-viewport
controls, keyboard/native radio agreement, no overflow and zero axe findings.
Content inspection now waits a bounded interval for a final asynchronous
heading while continuing to reject the wrong screen. New CI diagnostics retain
only finite benchmark, DOM path/rectangle and task-source classes; page text,
selectors and full URLs are omitted.

## Final local startup and deferred-work checkpoint

Core login/audit/invitation imports initialize four schemas instead of 31 while
retaining the same validators. Desktop launch delivery is outside the initial
closure; its synchronous account lease and file-handle read remain before the
lazy boundary. Focused API, launch, editor, bulk and layout suites passed 45,
61 and 27 checks respectively. The final combined app boot is 143,335 gzip
bytes against the unchanged 143,360-byte budget; early sanitized error reporting
remains initial.

The heaviest tool proof found no idle font, sticker, icon, EXIF or PDF-raster
module on Bulk, Video, Documents or Editor; Documents also has no idle processing
pipeline. Empty Bulk starts zero workers. Starting a real batch activates EXIF,
fonts and eight bounded workers and completes an output. Processing a real
two-page PDF activates the raster/pipeline code and places watermark image
resources on both pages. A selected text preset loads its real font and produces
a decoded editor preview. The ignored after-proof log is
`temp/lumafoil-heavy-after-proof.log`, SHA-256
`62256869380676eb0a5e4d926fea01525b1580ddafce4e8e413e5e8bbfd15e2c`.

The exact compatible MSAL, i18next/react-i18next, Lucide, Mediabunny,
user-event and chrome-launcher pins were refreshed after peer and release-note
review. TypeScript 7 remains outside typed-ESLint's peer range; Vitest 5 remains
outside the Cloudflare Workers pool range. The available Node 24 typings patch
was newer than this machine's registry time cutoff, so 24.13.3 remains aligned
with the actual Node 24 runtime. `npm ls` and `npm audit --audit-level=high`
pass. The deterministic Mediabunny 1.55.6 source archive and public MPL source
offer now match the shipped dependency.

The final `npm run quality` passes on version 2.0.0: 2,384 application tests,
42 real-Workers tests, three bootstrap checks, twelve gate/transport checks,
32 performance/audit checks, fifteen publication checks, 24 Python asset/recovery
checks and 40 built-output checks. Coverage is 93.24% statements, 85.37% branches,
93.06% functions and 93.57% lines. Source/index/history scanning passed 12,337
candidate/object checks and 297 archive entries; built scanning passed 2,400
checks and 114 archive entries with four configured private values compared.
All bundle budgets pass. The ignored log is
`temp/lumafoil-quality-2.0.0-final.log`, SHA-256
`8dbc5d92b662e8916e70b68560040ec52a488e797ea47385a7e8119db44a5d4c`.

Fresh SAST passed 509 rules over the then-tracked 1,923 targets with zero
findings. It must run again after the final candidate is staged so newly added
files enter its tracked-file inventory. New-head remote device/UI matrices,
final screenshots, migration and hosted proof remain required.

The first new-head UI run's redacted diagnostics identified the remaining public
Linux CLS source precisely: the prerendered Home `FIGURE` and legal-page
`SECTION` shifted when the Inter web font loaded (Home 0.1419, Privacy 0.0670).
Prerendered public documents now preload their one hashed Inter font before the
blocking stylesheet; the private SPA still has no font preload. The built-output
gate asserts both sides. A fresh local HTTP/2 mobile diagnostic passes Home and
Privacy at 100/100/100 with zero CLS and zero TBT under
`docs/lighthouse/m19-public-preload/`. Fresh Linux proof remains required.
