# M19 startup performance experiments — 2026-09-09

These are local production-artifact measurements through the existing brotli
proxy. They do not certify the full milestone or the deployed service. Numeric
budgets, the five-trace certification rule, and the cold-storage configuration
were unchanged.

## Measured sequence

| Variant                                         | Traces | Performance | Accessibility / best practices | FCP ms | LCP ms | CLS    | TBT ms |
| ----------------------------------------------- | ------ | ----------- | ------------------------------ | ------ | ------ | ------ | ------ |
| Prior dashboard, before reserved layout space   | 1      | 60          | 100 / 100                      | 1145   | 5132   | 0.2012 | 458    |
| Reserved offline row and recent-work states     | 1      | 75          | 100 / 100                      | 1622   | 5170   | 0.0000 | 259    |
| Registration moved to existing app-mount effect | 1      | 76          | 100 / 100                      | 1624   | 5002   | 0.0000 | 261    |
| Route load overlaps locale download             | 1      | 78          | 100 / 100                      | 1712   | 4883   | 0.0000 | 195    |
| Route overlap, shortened license banner         | 5      | 76          | 100 / 100                      | 2251   | 4724   | 0.0000 | 235    |

The layout reservation eliminates the observed large shifts. The worker-timing
sample alone does not establish a meaningful timing gain. Starting the existing
router load before the language promise resolves starts the first session request
earlier in the trace (784 ms versus 997 ms), without adding route requests. The
five-run aggregate still misses the performance, FCP, LCP and TBT budgets.

Source reports:

- `docs/lighthouse/m19/mobile-sample/` — prior diagnostic.
- `docs/lighthouse/m19-cls-baseline/mobile-sample/` — reserved layout baseline.
- `docs/lighthouse/m19-worker-mount/mobile-sample/` — worker timing experiment.
- `docs/lighthouse/m19-route-overlap/mobile-sample/` — route overlap diagnostic.
- `docs/lighthouse/m19-route-overlap/mobile/` — five traces of the dashboard only.

The same held artifact was also sampled on the two heavier creative routes in
`docs/lighthouse/m19-held-heavy/mobile-sample/`: designer performance 68, LCP
5826 ms and TBT 409 ms; editor performance 64, LCP 6236 ms and TBT 462 ms.
Both retained 100 accessibility, 100 best practices and effectively zero CLS.
These are single-run diagnostics. The designer's late largest paint was its text
help; the editor's was the existing sample-scene image. Both traces include
substantial main-thread work in the application entry and the authenticated
request chain. The sample JPEG itself is only 18903 bytes.

## Current source and artifact boundaries

The root-scope offline worker registration in `main.tsx` was redundant with the
existing `OfflinePanel` effect. The experiment removes the early call and retains
app-mount registration, manual retry, readiness reporting and account boundaries.
An initial `router.load()` overlaps the same route admission checks with language
loading; translated UI still waits for its catalogue. Installed TanStack Router
avoids starting another initial load when a transaction is active or the current
location has already resolved. In all three single-run variants, the observed
auth requests were two session reads, one organization list, two full-organization
reads and one role read; the repeated full-organization read predates this change.

A separate fresh Chromium check against the held artifact passed six behavioral
cases: authenticated startup reaches the real root-worker offline-ready state;
the admitted dashboard survives an offline document reload; reconnect resumes
the synchronized status; anonymous startup redirects without private dashboard
content; a deliberately unfinished language response does not delay the live
session request; and an unavailable base catalogue displays the actionable boot
failure with its Reload button instead of private UI. Local probe scripts and
results are `temp/performance-{boot,request}-proof.{mjs,json,log}`. This is startup
smoke evidence, not queued-save replay or the complete Playwright suite.

The first `e2e/offline.spec.ts` invocation could not reach test discovery because
Node required a JSON import attribute for `src/shared/sticker-ids.json`. The
canonical shared sticker-ID and artwork-license JSON imports now declare
`with { type: 'json' }`. Type checking passes and ordinary Playwright discovery
finds all 84 tests in 12 files. The focused offline journeys then reached a
separate fixture defect: they queried the first organization in the list even
though the newly created organization was active. The UI's preset save returned
201 in that active organization, while the test read the auto-created personal
workspace and incorrectly observed zero presets. Both fixtures now select the
unique explicitly created organization by name and assert exactly one match.
The conflict fixture also uses the existing-preset button's actual “Save changes”
label and waits for the visible offline-ready state before its first disconnect.
The earlier “Save preset” locator could never match that edit state; disconnecting
during the first static-cache installation interrupted that installation and left
the later service-worker-ready promise waiting indefinitely.

Against the held artifact, the desktop Chromium lost-acknowledgement preset/photo
journey passed in 19.3 seconds and the conflict/keep-both journey passed separately
in 17.0 seconds. The latter observed the expected stale-update 409 followed by a
separate successful creation; both named versions survived offline reload. Both
retain their axe checks and independent server-state assertions. Diagnostic logs
are `temp/performance-offline-e2e.log` and `temp/performance-conflict-e2e.log`.
The temporary root-level test configuration was removed; the normal gate
configuration was unchanged. The complete four-device suite remains required on
the final rebuilt artifact.

The first fresh build emitted all application artifacts and passed 37 built-artifact
checks, including the bundled license notices and corresponding-source offer.
Shortening the repeated JavaScript license comment while preserving both notice
URLs left that intermediate shell at **143406 gzip bytes**, above the unchanged
**143360-byte** budget by 46 bytes. That build correctly exited nonzero. The later
grouping experiment below resolved the byte failure without changing the budget.

## Bootstrap, exact module grouping and resource hints

The subsequent bootstrap implementation seeds the four existing shell queries
from one validated `POST /api/me/bootstrap` response. Its separate security,
ownership, storage and red-drill evidence belongs to the bootstrap delivery lane.
The first build with it passed all 37 built checks, including actual license text
for all 134 bundled dependency entries, but its shell remained 51 bytes over budget.

A passive Vite observer now writes `dist/analysis/client-modules.json`, outside
the served client directory. It records workspace-relative module identifiers,
rendered lengths and actual chunk import edges; it records neither source code
nor environment values and does not change emitted JavaScript. The original boot
closure had 18 chunks and 173 source records, of which 170 had rendered code.

The first unrestricted Rolldown `$initial` grouping was rejected: its tags include
the graph before tree shaking, so it pulled the previously lazy form-validation
module and eight classic-Zod modules into startup, increasing gzip to 146361 bytes.
The retained client-only grouping leaves Zod and form-validation chunking automatic,
disables recursive capture and preserves execution order. The actual before/after
source-record sets are identical: **173 to 173, zero additions or removals**.
Only existing HTML/CSS records gained wrapper code. The resulting boot closure is
**six chunks, 142000 gzip bytes and 122706 brotli bytes**, compared with 143411 gzip
and 126232 brotli bytes before grouping. MSAL, Mediabunny, PDF, engine and editor
component modules remain outside that closure. All actual route chunk budgets
remain enforced, with no exclusions added.

The application document also preloads its mandatory English catalogue and the
actual installed Inter Latin variable font. Static public documents remove the
app-only catalogue hint. A fresh Chromium check passed for all twelve locales:
each made exactly one English catalogue request and one Inter font request; each
non-English locale fetched exactly one additional catalogue. Translated navigation,
`lang`, and Arabic `dir=rtl` were checked, as was removal of the application hint
from every static locale document. Results are in
`temp/performance-preload-proof.{mjs,json,log}`.

| Dashboard variant                              | Traces | Performance | Accessibility / best practices | FCP ms | LCP ms | CLS    | TBT ms |
| ---------------------------------------------- | ------ | ----------- | ------------------------------ | ------ | ------ | ------ | ------ |
| Validated bootstrap, original chunk boundaries | 1      | 79          | 100 / 100                      | 1606   | 4868   | 0.0000 | 200    |
| Bounded boot grouping                          | 1      | 77          | 100 / 100                      | 1237   | 4791   | 0.0000 | 281    |
| Bounded boot grouping                          | 5      | 68          | 100 / 100                      | 1802   | 4692   | 0.0000 | 556    |
| Catalogue and font preloads                    | 1      | 78          | 100 / 100                      | 1243   | 4753   | 0.0000 | 262    |
| Catalogue and font preloads                    | 5      | 77          | 100 / 100                      | 1801   | 4475   | 0.0000 | 277    |

Reports are under `docs/lighthouse/m19-bootstrap-baseline/`,
`docs/lighthouse/m19-bounded-boot/` and `docs/lighthouse/m19-preload/`.
The last preload sample also measured designer performance 66 / LCP 5344 ms /
TBT 531 ms and editor performance 62 / LCP 6096 ms / TBT 592 ms. All retained
100 accessibility and best practices, with CLS below its unchanged limit.
The latest five-run dashboard still fails performance, LCP and TBT; full matrices
must not be marked certified from these results.

An additional real 4× CPU-throttled Chromium probe investigated whether root
offline installation caused the startup delay. Its largest paint occurred at
1000 ms and all three long tasks ended by 771 ms. The root offline inventory
request began at 1420 ms and its first asset request at 1428 ms, after those events.
This observation does not support delaying or weakening installation as a fix for
the measured startup work. No scheduling change was made. Its evidence is
`temp/performance-sw-timing.{mjs,json,log}`. Later telemetry hardening and package
metadata changes still require a fresh artifact and aggregate verification.

## Open work

### Transport correction and first HTTP/2 diagnostic

The intervening route-hint experiment passed its correctness gates: 17 anchored
route patterns and 125 unique manifest-backed asset hints; literal `new` routes
take precedence over ID routes, and static import traversal includes loaders but
never follows dynamic imports. The controller only creates modulepreload links.
Its hash matches the emitted CSP, and all 36 public static documents remove every
application-preload marker. The gate now counts actual inline application scripts,
including the existing theme resolver; the controller and boot graph totaled
139.7 KiB in that artifact, within the unchanged 140 KiB limit.

The pre-change real-browser check failed with `REQUIRED_PRELOAD` while the main
entry response was held. After the change, the bootstrap module was requested
before that response was released, but the bootstrap API did not execute until
release. Login, signup, landing, privacy and terms each made zero app-only module
or bootstrap API requests. All twelve locale request-reuse checks and the four
offline/admission startup smoke checks remained green. Evidence is in
`temp/route-preload-request-{red,green}.log` and `temp/route-preload-positive.json`.

This did **not** establish a performance win under the HTTP/1.1 model. The
five-run dashboard aggregate in `docs/lighthouse/m19-route-hints/mobile/` was
74 performance, FCP 2402 ms, LCP 4884 ms and TBT 281 ms, with 100 accessibility,
100 best practices and negligible CLS. Its timing benefit remains unproved;
retain or remove the experiment based on matched protocol-correct evidence.

The earlier local proxy used HTTP/1.1. Its application report recorded 83
HTTP/1.1 requests and 446565 transferred bytes, including repeated response
headers. A read-only request to the existing pre-cutover Worker's health endpoint
returned 200 and negotiated ALPN `h2`, with normal certificate validation and no
private credentials. Cloudflare documents HTTP/2 as enabled by default and
describes its multiplexing and HPACK header compression:
[HTTP/2 configuration](https://developers.cloudflare.com/speed/optimization/protocol/http2/),
[HTTP/2 versus HTTP/1.1](https://www.cloudflare.com/learning/performance/http2-vs-http1.1/).

The audit proxy now supports native Node HTTP/2 over loopback TLS. Existing Git
for Windows OpenSSL 3.5.4 generates a fresh short-lived EC certificate under the
project's ignored temporary directory. Chrome receives only that public key's
SPKI exception. No operating-system trust store is changed and no broad
certificate-error flag is used. A real browser accepts the pinned certificate,
rejects a different untrusted key with `ERR_CERT_AUTHORITY_INVALID`, then still
loads the valid endpoint. Key-directory cleanup verifies its resolved parent.

Six transport checks pass, including actual `h2` negotiation, exact POST bytes,
status/security-header/cookie preservation, same-origin-only Origin rewriting,
unchanged foreign Origin, HTTP/2 pseudoheader and hop-header removal, rejection
of absolute/network-path/credential-bearing escape targets before dispatch,
per-proxy cache isolation, public cache reuse, private/no-store/Set-Cookie cache
exclusions and survival of a caller disconnect. Evidence is in
`temp/http2-proxy-tests.log`; the canonical `npm run test:performance` also passes.

Lighthouse now records this transport assumption and requires `h2` on the main
document and every completed same-origin network request. It also rejects a
navigation to another page, a missing or unsuccessful document, and completed
same-origin HTTP failures before scoring. Two focused navigation tests include
redirect, foreign-origin, HTTP/1.1 asset and API 403/500 negatives. Thresholds, cold
storage and cache settings, and five-run aggregation are unchanged. Historical
HTTP/1.1 reports remain unchanged. Normal hosted TLS and performance at the final
production hostname remain independent release requirements.

A disposable-copy red drill removed the completed-response error check and failed
with the intended missing-exception assertion. Exact restoration passed again,
and the canonical helper's SHA-256 remained unchanged. Evidence is in
`temp/lighthouse-navigation-red.log`.

One labelled mobile `/app` diagnostic ran against the current built Worker through
the isolated gate bridge. This was explicitly a diagnostic while the gate's
separate SDK dispatch failure remained under investigation. The trace reached the
expected successful page and contained no unexpected HTTP failures: all **83
requests used `h2`**, totaling **328663 transferred bytes**. The historical
HTTP/1.1 route-hint trace had 83 requests and 446565 transferred bytes. These are
different traces and artifacts; the reduction is consistent with the protocol
correction, but is not a matched application-optimization result.

| HTTP/2 dashboard evidence | Traces | Performance | Accessibility / best practices | FCP ms | LCP ms | CLS    | TBT ms |
| ------------------------- | ------ | ----------- | ------------------------------ | ------ | ------ | ------ | ------ |
| Current launch-fix build  | 1      | 91          | 100 / 100                      | 1295   | 2846   | 0.0000 | 228    |

The command correctly exited 1 because LCP exceeded 2500 ms and TBT exceeded
150 ms. The report is under `docs/lighthouse/m19-h2-diagnostic/mobile-sample/`.
Its largest paint was the real Recents explanatory text. Simulated main-chunk
tasks lasted 127 and 201 ms, accounting for 228 ms of blocking after first paint.
The observed bootstrap request ran from 985 to 1060 ms; the observed largest
element rendered at approximately 1170 ms. Those observed times are distinct from
Lighthouse's simulated mobile metrics in the table. The current initial
application budget is **143359 of 143360 gzip bytes**, including document scripts;
future source changes must recheck that one-byte margin.

### Startup CPU profile and lazy Recents dates

After the native workerd gate adapter passed its disconnect and early-403 checks,
a fresh Chromium profile ran through the same pinned HTTP/2 proxy with actual
4× CPU throttling. It reported no page or HTTP failures. Four observed long tasks
lasted 70, 147, 98 and 289 ms. The first was the resource-hint controller; the next
two initialized the application and route dependencies. The longest rendered the
React application, with 61.7 ms of self-time attributed to `RecentWork`, whose
render eagerly constructed `Intl.DateTimeFormat` even while no dates were present.
The unmodified profile is retained in
`temp/performance-h2-startup-initial.{json,cpuprofile}` and its summarized call
frames in `temp/performance-h2-profile-summary-initial.json`. Profiling adds
overhead; these timings are diagnostic and do not replace Lighthouse scores.

The bounded fix now creates the formatter on the first displayed date and reuses
it for that component's locale. Loading and empty views do not initialize it.
Only a formatter is retained, never account content or formatted date values.
Two added regressions first failed on the original code: the empty view created
two formatters instead of zero, and populated rendering created two instead of
one. After the fix all seven Recents tests pass, including exact timestamp/output
preservation, reuse across view changes, and English-to-French output refresh.
Focused lint and the full TypeScript build pass. Evidence is in
`temp/recent-date-lazy-{red,green,types}.log`.

The first controlled build exposed a real 12-byte overage: 143372 gzip bytes
against the unchanged 143360-byte limit. It stopped at that gate. The equivalent
theme resolver was then compacted by removing its unnecessary function wrapper,
temporary resolved value and unused catch binding; its saved-theme and system
fallback behavior remains intact. The preload controller now concatenates arrays
already made unique and disjoint by build-time sets, without constructing a
second set in the browser. These changes removed 75 counted gzip bytes. The final
build passed all 40 artifact checks, every bundle budget, and the built publication
scan (2388 candidate/object checks and 114 archive entries), with **143297 of
143360 gzip bytes** for application startup. The complete build log is
`temp/lumafoil-build-lazy-intl-compact.log`.

The emitted theme resolver is checked against ten saved/system/blocked-storage
combinations and its actual CSP hash. A disposable artifact drill inverted the
system choice while updating the matching CSP hash; the theme-output assertion
failed, and exact restoration passed. Canonical artifacts remained unchanged.
Evidence is in `temp/theme-resolver-red.log`. Public static-document theme controls
and the route hint positive/negative tests also remain green.

One matched, owner-empty dashboard comparison used the same Lighthouse entry
logic, pinned in ignored `temp/lighthouse-lazy-intl-matched.mjs`, because the new
canonical audit inventory was separately moving to a standard-user populated
fixture. Both runs used the stable native workerd gate adapter and identical
HTTP/2, cold-browser and mobile audit settings. The after artifact also includes
the separate bulk CSV fix and equivalent inline-code reductions described above.

| Owner-empty dashboard | Traces | Performance | Accessibility / best practices | FCP ms | LCP ms | CLS    | TBT ms |
| --------------------- | ------ | ----------- | ------------------------------ | ------ | ------ | ------ | ------ |
| Before lazy formatter | 1      | 89          | 100 / 100                      | 1470   | 3011   | 0.0000 | 262    |
| After controlled fix  | 1      | 91          | 100 / 100                      | 1464   | 2988   | 0.0000 | 208    |

Reports are under `docs/lighthouse/m19-lazy-intl-{before,after}/mobile-sample/`.
Both traces reached the expected page without HTTP failures and required HTTP/2
for every completed same-origin request. Both commands correctly exited 1:
**LCP and TBT remain above their unchanged limits**. A single pair does not
establish stable medians or certify the expanded route/state matrix.

Paired actual 4× CPU profiles additionally wrapped the native Intl constructor
only to record its duration. Before the change an empty dashboard constructed
three date formatters; the first took 140 ms. Afterward it constructed **zero**.
The observed longest render task changed from 545 to 237 ms and observed LCP from
2728 to 2452 ms, but profiler overhead and workstation variance prevent attributing
that entire difference to one expression. The direct zero-construction proof and
preserved populated/locale behavior support retaining the bounded fix. Profiles
and native-construction records are in
`temp/performance-h2-startup-{before,after}.{json,cpuprofile}`. No further speculative
startup changes were made before releasing the stable gate for final verification.

The subsequent five-trace owner-empty aggregate under
`docs/lighthouse/m19-lazy-intl-after/mobile/` is **provisional and cannot certify
performance**. A separately launched SAST job began at 2026-09-10 04:55:16 UTC,
overlapping the final seven seconds before the report completed at 04:55:23 UTC;
preceding small tests also overlapped. The retained raw medians were 90 performance,
100 accessibility, 100 best practices, FCP 1801 ms, LCP 2627 ms and TBT 283 ms.
Neither timing limit passed, and no pass or stable timing conclusion is inferred
from this contaminated aggregate. A fresh quiet five-trace run is still required.

Read-only analysis of the uncontaminated single after-trace shows the critical
chain: the main JavaScript request ran from 48 to 1036 ms, bootstrap POST from
1157 to 1256 ms, and the largest element painted at 1383 ms in the observed trace.
The Inter font finished at 142 ms and the stylesheet at 271 ms, before admission.
The generated hint controller followed the blocking stylesheet and began fetching
its app modules at 276 ms. The build helper now inserts that same controller and
resource map before the first stylesheet while retaining the earlier charset
metadata. Its new order assertion failed the previous placement with
`PRELOAD_ORDER`; all four focused route tests now pass, retaining the exact
controller/map, route selection, public/auth negatives and malformed-order
rejection. Focused lint and Node TypeScript checks pass. The emitted-artifact check
also requires this order. Evidence is in `temp/preload-order-{red,green,types}.log`.
The held artifact remains unchanged during the full E2E run; a fresh build and
quiet timing measurement are still required before claiming a benefit.

Lighthouse also estimated 414 ms of origin server latency despite 22.6 ms observed
document TTFB. The local proxy awaits maximum-quality Brotli compression before
sending asset headers and caches the result for later traces. Cold compression
and its worker-pool queue are therefore a plausible measurement contributor,
requiring direct upstream-versus-encoding timing before any proxy behavior change.
Only an isolated ignored timing helper was prepared; canonical proxy behavior
remains unchanged.

### Remaining gates

- Reduce the authenticated request chain without weakening live session admission,
  account ownership or server authorization.
- Keep the now-passing application byte budget green through final source changes.
- Recheck fresh first visit, offline reload and reconnect behavior after the final
  startup change, including explicit boot failures and redirected routes.
- Complete the shared 27-leaf-route inventory and deterministic Recents states,
  then run the complete five-trace desktop and mobile matrices against the final
  build. The previous 17-target inventory cannot certify that expanded scope.
- Run final quality, SAST, full Playwright/axe and screenshot gates. No completion
  box may be inferred from these selected-page diagnostics.
