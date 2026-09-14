# Integrated quality verification

## Current Deployment Checkpoint — 2026-09-13

The subsequent canonical `npm run quality` completed with exit 0 on the integrated
cloud/upload and conservative gate-transport corrections. It passed 2,789
unit/browser tests, 63 real Worker tests, unchanged coverage floors (92.50%
statements, 85.31% branches, 92.31% functions, 93.40% lines), 15 gate tests and all
42 build checks/bundle limits. Global SAST then passed 509 rules over 2,110 files
with zero findings. Evidence is `temp/cloud-final-quality.log` and
`temp/cloud-final-sast.log`. This new complete invocation supersedes the earlier
continued-chain quality boundary for these source changes; it does not change
the retained failed commands or finish the remaining UI/performance inventories.

Source `4c5a2ed` is deployed with the final Save Image label and coordinated UI
changes. Current evidence includes 2,781 unit/browser tests, 63 Worker tests,
unchanged coverage floors, all 42 build checks, zero SAST findings and 12 hosted
public checks. The quality invocation and its continued command chain are
recorded separately; this is not a claim of one new exit-zero quality invocation.
All 128 distinct E2E cases have cumulative passing evidence. Full screenshots,
performance and whole-app certification remain open. See the
[current release](deployment-2026-09-13.md) and
[integration boundaries](ui-organization-2026-09-13.md). Older checkpoints below
retain their original scope and source revision.

## Production deployment checkpoint — 2026-09-12

Source commit `0d764ecf9c88a002ac41fde24ca0cc02fba7a188` is deployed at
`https://lumafoil.com` as Worker version
`fbbf320b-9041-4801-8373-f8d7fb022191`. The canonical protected deploy completed
with exit 0 after all 42 build checks, bundle budgets and an eight-value protected
publication scan passed. Migrations 0013–0017 applied, and the remote database was
confirmed current before upload. All four new cloud secret bindings were accepted.

Twelve hosted public checks passed, including production health/configuration,
anonymous access refusal, callback no-referrer and exact deployed asset hashes.
A fresh authenticated browser restored the existing photo and showed the new
Image tools, Manage Access and all three available cloud connection controls.
Read-only post-deployment checks preserved the sole Owner, absence of Admins and
existing accounts/content. Microsoft Cloud Storage now retains only its Web
server callback; the separate sign-in registration was unchanged.

See the [deployment receipt](deployment-2026-09-12.md) and
[public hosted results](hosted-release-public.json) for exact scope and hashes.
The receipt accompanies publication of the deployed source; remote-HEAD
verification is separate. Real cloud
grants and provider round trips remain unverified; local fixture coverage and
enabled Connect buttons do not establish those results.

## Local staged-release checkpoint — 2026-09-12

The canonical `npm run quality` completed with **exit code 0** on the integrated
release candidate. The successful record is `temp/quality-staged-release.log`,
SHA-256 `316f1fa62ea419120522bc8cea09e0c754827f47bc044c20d7b77225739720ae`.
This establishes the local quality/build checkpoint; deployment is evidenced
separately above, while live provider journeys remain unverified.
This checkpoint also predates the subsequent Account overflow correction and
named Dropbox credential-format adjustment identified during final release
checks. Their follow-up verification must be recorded separately; the completed
canonical invocation is not retroactively attributed to later edits.

Formatting, ESLint, Stylelint, TypeScript, dead-code detection, all **1,212**
translation keys, dependency cycles and duplication checks passed. The duplicate
count was zero. Dependency audit reported zero vulnerabilities.

The canonical test chain passed:

- **2,742 unit/browser tests across 253 files.**
- **61 real workerd tests across 16 files.**
- 30 bootstrap, 12 gate/transport, 36 performance/audit-helper and 16 publication
  checks.
- 24 Python asset/recovery checks, comprising the five-case and nineteen-case
  suites.
- **42 independent built-artifact checks**, including byte-exact PDF reader
  assets, offline inventory, translated public documents, security headers,
  license/source artifacts and the resolved logging configuration.

All original coverage thresholds remained in force:

| Metric     | Observed | Required |
| ---------- | -------: | -------: |
| Statements |   92.43% |      90% |
| Branches   |   85.17% |      85% |
| Functions  |   92.20% |      90% |
| Lines      |   93.33% |      90% |

The source/index/history publication scan passed **13,842 candidate/object
checks** and **297 archive entries**, comparing four configured private values
without exposing them. Five revoked-key occurrences were masked only in
historical scan copies, and one exact immutable historical finding was accepted.
No current credential exception was introduced. The new Dropbox registration's
public application identifier is classified by an exact-value pattern alongside
two retired public identifiers; a real scanner test still rejects a same-format
unrelated Dropbox app secret in the same configuration file.

The production build and every byte budget passed. The initial application shell
measured **138.1 KiB gzip against the 140 KiB budget**. The built publication scan
passed **2,640 candidate/object checks** and **114 archive entries**, with four
configured private values compared and no retired-key masking or historical
finding exception applied to current artifacts.

### Staged-source SAST

The separate final staged-source SAST invocation passed **509 rules over 2,098
targets with zero findings**. All intended new modules were staged before this
invocation; this result supersedes the earlier inventories taken before staging.
The evidence is `temp/security-staged-release.log`, SHA-256
`c32313a729f9ae3158441b0d3214358f4aeeef56fc8733a50525f610e7a56ca8`.
The scanner reported approximately 99.9% parsed lines and thirteen files skipped
by its default 1 MB size limit. Those reported scope limits remain explicit;
this is not a claim that every repository byte was parsed.

### Subsequent publication-policy correction

Final credential preparation exposed a valid provider format shorter than the
generic private-value input minimum. The publication policy now admits exactly
15 alphanumeric characters only for the named `DROPBOX_APP_SECRET` input. The
global 16-character minimum remains unchanged. This admits the credential into
private-value scanning; it does not allow publishing it or suppress a finding.
Raw, JSON, URL, Base64, hexadecimal and UTF-16 forms remain covered, with unrelated
15-character names, malformed values and shorter Dropbox values rejected.

The focused publication suite passed **19 tests with zero skipped**, and scoped
ESLint and formatting passed. A real fixture scan was green, failed on an encoded
private canary identified as `DROPBOX_APP_SECRET`, then passed after restoration.
No real credential was read by this test change. This follow-up evidence is
separate from the earlier canonical run's 16 publication tests. The record is
`temp/dropbox-secret-publication-tests.log`, SHA-256
`cd838de247e7b6dbef7770f83452b23ecfe24b899a159307bdb3dcd48fc31730`;
`temp/dropbox-secret-publication-lint.log` is empty after successful scoped lint.

### Account layout rebuild and protected release checks

The Account layout now has an explicit single-column base grid. The native
iPhone diagnostic changed from a 390-pixel viewport with 558-pixel document
width to **390/390 pixels with no overflowing objects**
(`temp/account-overflow.json`). A fresh `npm run build` completed with exit 0,
all 42 built-artifact checks and every bundle budget passing. Its log is
`temp/account-grid-release-build.log`, SHA-256
`2c9731125eb71221cb28293adb52f9508cff123ef99cf12062d408efcaffc475`.
The separate subsequent SAST again passed **509 rules over 2,098 targets with
zero findings** in `temp/security-account-grid-release.log`, SHA-256
`c32313a729f9ae3158441b0d3214358f4aeeef56fc8733a50525f610e7a56ca8`.
The same thirteen-file size limit and approximately 99.9% parsed scope apply.

Protected source publication passed **13,842 candidate/object checks, 297 archive
entries and eight private-value comparisons**, including the four new cloud
credentials, without printing them. Five revoked occurrences were masked in
historical scan copies and one exact historical finding was accepted; these
remain historical-only controls. The log is `temp/protected-publication-source.log`,
SHA-256 `4c31445c215c20187ed1fa29c432216545406521c690d1417c45f757487b46cc`.

A fresh protected scan of the Account build passed **2,640 checks, 114 archive entries and
eight private-value comparisons**, without historical masks or accepted findings:
`temp/protected-publication-built.log`, SHA-256
`ec9bff464a8d32df04e6059d532b4d0a890f199b88638243f1447009d4ffb1a3`.
The initial protected built checkpoint preceded the Account rebuild, whose
standard build scan compared four configured values. The release owner then
reran the protected scan against the final Account artifact with all eight
configured private values, closing that artifact-correspondence gap. No production
upload or secret binding is implied by this local scan. The earlier failed
`temp/protected-publication-run.log` remains
failure evidence, not the successful source/built checkpoint.

Read-only production checks confirmed the sole Owner and absence of Admins
without modifying accounts or content. A fresh encrypted backup was verified.
Production dashboard readback showed Workers Logs/Traces disabled and no
configured account Logpush jobs; the canonical Free-plan zone did not offer a
configured Logpush feature. These are pre-deployment observations, with the exact
dashboard/API distinction recorded in [cloud storage](cloud-storage.md).

### Earlier attempts were not successful canonical runs

Earlier logs remain useful failure evidence and are not substituted for the
successful checkpoint above. Integration attempts stopped at formatting, lint,
test typing, an obsolete PDF fixture, and stale UI assumptions after the new
workflows landed. The first source-scan refusal for the new Dropbox public app
identifier was resolved through exact classification with a live negative
credential control, not a file-wide or rule-wide scanner exclusion.

The earlier all-green application-test runs still failed coverage: one measured
89.42% functions and 82.46% branches, and a later run measured 84.43% branches.
Those were failed gates. Additional tests exercise real cloud cancellation and
account boundaries, provider failures, media playback and gestures, workspace
transitions, and selected-photo sharing readiness. No threshold was reduced.
Coverage is now also emitted when an assertion fails so a test failure cannot
hide the remaining coverage deficit; it does not change failure exit codes.

`temp/quality-frozen-release.log` passed the application and Workers projects,
coverage, bootstrap and transport checks, then failed two audit-helper checks:
the new workspace-invitation route was missing from the surface inventory, and a
fake video viewer used a raw range input. The route now has a stable prepared
audit surface and the fixture uses the canonical themed slider. The entire
canonical command subsequently passed in `temp/quality-staged-release.log`.
These distinctions preserve the earlier red results rather than relabeling them
as successful runs.

### Four-device E2E case closure

The initial isolated matrix collected 128 cases and finished with 88 passing,
37 failing and three not run after serial-suite failures. The corrected rerun
completed successfully with **49 passing cases across 11 files**. Matching
project, file and full test title establishes nine repeated setup cases and
**128 distinct passing cases across the two runs**: 32 each on desktop Chrome,
iPhone, iPad and Android. All 37 initial failures and all three serial fallouts
have successful rerun evidence.

This is combined case closure, **not one clean uninterrupted 128-case run**, and
it does not claim all 128 cases were freshly executed against the final build.
The original failures remain preserved. See
[release E2E triage](release-e2e-triage.md) for the per-device accounting,
corrections, commands, retained logs and SHA-256 values. The successful rerun is
`temp/release-e2e-rerun.log`; the initial record is `temp/release-e2e.log`.

### Consolidated screenshot/axe inventory

All four browser/device profiles now have complete screenshot evidence across
English/Arabic and light/dark themes: **800 PNGs covering all 752 required
combinations**, with zero missing required captures. Desktop contributed 200,
iPhone 200, iPad 196 and Android 204. Strict page-error, axe, readiness and
horizontal-overflow checks stayed active. The final phone and Android invocations
completed with exit 0; desktop and tablet completed within earlier parent runs
that failed on different profiles. This is consolidated coverage across four
invocations, not one clean uninterrupted all-profile run.

The [audit receipt](audit-inventory.md) and [compact inventory](screenshot-inventory.json)
retain run/build provenance, per-file SHA-256 values and actual recorded preference
metadata only. Every required combination was independently checked from the
canonical surface declaration, including a missing-file negative control.
All 1,008 terminal evidence files were archived outside publication candidates,
with every file count, size and hash preserved. Selected capture bytes and runner
inventories also matched an independent pre/post-archive comparison. The original
failed runs remain retained; the Account overflow and harness navigation causes
are documented without changing their original results.

### Evidence still open

The following remain separate, open release evidence at this checkpoint:

- The separate full Lighthouse/performance audit evidence. Passing the
  performance-helper tests and build byte budgets is not a full audit result.
  The owner authorized performance work after launch; this remains disclosed
  deferred evidence rather than a newly imposed pre-launch gate.
- Real Google Drive, Dropbox and OneDrive connection, folder, load/save,
  sharing/revocation and refresh-reuse verification. Local provider fixtures do
  not establish live consent or tenant-policy behavior.
- The owner requested stopping for the night. The pending Google attempt was
  cancelled without granting access; live provider checks and performance work
  are reserved for the next session. Repository remote-HEAD verification is
  separate from this deployment receipt.

## Historical verification record

The sections below preserve earlier dated checkpoints and failures. Their
"final," "latest," and open-gate statements describe their historical snapshots.
For current canonical quality and staged SAST status, use the checkpoint above;
no historical pass certifies uninspected later source or closes live provider
verification. The production checkpoint above owns current deployment status.

On 2026-09-09 (America/Los_Angeles), `npm run quality` completed with exit 0
after the bootstrap, diagnostic-privacy, publication and logging-configuration
changes. Runtime and test sources were frozen for this run. This is a verified
integration checkpoint, not full production-launch certification.

### Executed gates

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

### Failures corrected before this checkpoint

The first attempt stopped at duplicated delayed-response test setup. A single
case matrix now retains the account/session/workspace assertions for every
success, denial and delayed-body case; the duplication gate reported zero
clones afterward.

The second attempt passed static gates and 2,330 tests, then one editor test
waited for the transient empty-picker label. Its URL-selected preset changes
that label. The test now waits for the final selected-preset control before
testing crop/resize/export behavior, and its twelve-test suite passed before
the complete successful rerun. No timeout, coverage floor or gate was weakened.

### Evidence and remaining limits

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

### Subsequent focused checks and browser failure

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

### Supported gate and focused rerun

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

### Integrated SDK, fallback and audit-inventory checkpoint

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

### Offline transport and Linux sandbox checkpoint

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

### Hosted runner and device findings

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

### Final interaction and selected-dashboard checkpoint

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

### Complete red drill and first full UI matrix

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

### Final local startup and deferred-work checkpoint

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

### Private boot and final asynchronous-layout checkpoint

The private query persister, account observer and offline admission installer
are absent from the public Login closure and load before the first `/app`
admission, including a same-document sign-in. The browser proof retains an
existing public-page snapshot unchanged, then observes all three private module
identities and the correct authenticated snapshot after navigation. Sixty-two
focused unit and eleven account-boundary browser checks pass. The app boot fell
from 143,329 to 140,759 gzip bytes, leaving 2,601 bytes under the unchanged
140 KiB limit. A matched mobile Login diagnostic reduced TBT from 231 to 108 ms;
the single LCP sample was 2,502 ms, so the required five-run and Linux matrices
remain authoritative.

Public signed-in locale changes do not depend on restored workspace ownership.
They capture the live session, revalidate it with cookie caching disabled and
bind the existing `/api/me` request to the exact user/session generation. A
sign-out, replacement session, mixed identity, relock, 401 or 403 cannot save a
stale preference. Four intended reds and 63 focused tests cover those cases.

Admin totals and Gallery controls now reserve their final functional layout
while real responses are held. The original proof measured 74 px of Admin shift
and independent Gallery shifts from usage, preset width and delayed actions.
Eight production-build journeys across desktop, iPhone, iPad and Android now
keep the measured controls at identical rectangles before/after responses, with
zero overflow and zero axe violations. Loading/failure labels remain visible
and actions remain disabled until their required data is valid.

The combined source then passed `npm run quality`: 2,422 application tests,
42 real-Workers tests, all supporting gate/publication/asset checks and the
production build. Coverage is 93.29% statements, 85.55% branches, 93.07%
functions and 93.61% lines. Source scanning passed 12,548 candidate/object
checks and 297 archive entries; built scanning passed 2,401 checks and 114
archive entries. The app shell is 137.4 KiB gzip. The ignored log is
`temp/lumafoil-quality-private-layout-locale-3.log`, SHA-256
`91d74f5b4a3d66bc4818413d6a970b9f4f2b046bf7346af213631ed2d3021f65`.
Fresh SAST passes 509 rules over 1,937 targets with zero findings. Remote
new-head device, complete UI and Linux performance proof remain required.

The next Linux Home audit reached the correct page but its post-measurement
content check ran before the visible hero finished decoding, so it emitted no
performance report. The content gate now awaits visible-image `decode()` within
the same bounded readiness interval used for headings, then independently
requires complete nonzero dimensions. A delayed decode passes; a broken image
and a decode beyond the deadline remain red. Lighthouse scoring and budgets are
unchanged.

### Sidebar and offline build verification — 2026-09-12

The focused tools-sidebar refinement uses the shared `ChoiceGroup` for visual
shape tiles and its existing keyboard semantics. The first full quality command
passed formatting, lint, styles, types, dead-code, localization, cycles,
duplication, publication and dependency checks, then exposed an instantaneous
synthetic key-release race in the added shape test. After retaining the key until
the actual focus/selection event, the complete `npm run test` passed 2,551
application tests across 229 files and 44 real-Workers tests across 12 files.
Coverage was 92.34% statements, 85.06% branches, 92.30% functions and 92.89% lines.
Supporting suites passed 30 bootstrap, 12 transport, 40 performance/primitive,
15 publication and 24 Python asset/recovery checks. SAST ran 509 rules over
1,979 tracked files with zero findings. Logs remain in ignored `temp/`.

The new 124-case device run was interrupted after its desktop portion exposed a
real offline-build mismatch and stale canvas/metadata fixture prerequisites.
It is not a passing device certificate. The built page expected a content-derived
cache ID while `sw.js` retained the literal `watermark-pro-offline-v3`, because
the build still replaced the old `v2` string. The new artifact check executes the
worker's `get-build` handler; the old artifact failed with that exact literal ID.
The repaired builder substitutes exactly one cache declaration and the rebuilt
worker reports the same digest as both shells.

A fresh five-case desktop diagnostic then passed portrait canvas editing/history
and both offline journeys, including lost-acknowledgement recovery and preserving
both conflict versions. Its remaining two failures were selectors aimed at a
duplicate Recents link and a Layers list hidden after preset selection switched
to Watermark. Those fixtures now use the library region and explicitly reopen
Presets. The full final device, screenshot and performance matrices remain open;
the diagnostic is not substituted for them.

### Editor and workspace chrome checkpoint — 2026-09-12

The durable baseline runner completed: `npm run quality` exited 0 on the
sidebar/offline-build source, followed by `npm run test:e2e` with 118 passing and
six failing cases. Failures included an offline-install evaluation timeout,
iPhone/Android verification-page readiness, an iPad drag, an Android gallery
save and an Android audit request that received an HTTP 502. This is not a
passing device certificate, and the earlier GitHub matrix cannot certify later
source changes. Logs remain in ignored `temp/quality-launch-final.log` and
`temp/e2e-launch-final.log`.

The focused editor-control browser fixture then passed desktop Chromium, iPhone
WebKit, iPad WebKit and Android Chromium: actual font loading, compact controls,
20 shape choices, naming before save, New clearing the mark, account-menu access,
and zero axe violations or horizontal page overflow. Android additionally sent
native two-touch traffic and verified rotation plus one-step undo. The first
iPhone attempt proved the non-portalled font popup could display options that
the scrolling glass panel intercepted; moving it outside that panel fixed the
same interaction. Enclosing dialogs retain their own portal container for scroll
containment. The successful device output is `temp/editor-controls-qa/report.json`.

That device fixture preceded the requested sharing modal, PayPal header, American
English/title casing, single-line status bar and lossless-default refinements.
Those changes require refreshed browser proof. Current focused unit/engine checks
exercise actual export options and original-resolution, one-pixel source detail,
and distinguish explicit resize from display-only preview scaling. Full current
quality, SAST and device certification remain open until fresh successful runs.

The combined editor-control fixture subsequently passed all four devices again,
including the sharing modal, PayPal link, one-line status bar and non-sticky
phone header. The separate guidance browser run passed desktop, then found a
real Android swipe cancellation: its nested scrolling body needed its own
`touch-action: pan-y`. A controlled runtime CSS probe changed only that property
and passed native swiping, popup suppression, account/device persistence and
landscape bounds. Production source now contains the fix; final rebuilt-artifact
guidance proof is still required. Probe files are kept separately from final
artifact screenshots and are not a substitute for that run.

Actual Chromium and WebKit referrer checks read the static header policy, visit
a synthetic bearer path and verify that same-origin, cross-origin and subsequent
SPA requests carry only the origin. An independent control using the old policy
exposes its synthetic same-origin path, proving the negative assertion is live.
Twelve account-OAuth UI checks cover both providers retaining the requested
internal destination and rejecting external/control-character redirects.

The first combined quality attempts stopped at formatting, lint and then dead
code. Cleanup removes obsolete membership mutations and types superseded by the
access modal; none of those incomplete runs are reported as a full green gate.
