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
