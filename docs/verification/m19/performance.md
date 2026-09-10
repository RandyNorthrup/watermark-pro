# M19 startup performance experiments — 2026-09-09 to 2026-09-10

These are local production-artifact measurements through the existing brotli
proxy. They do not certify the full milestone or the deployed service. Numeric
budgets, the five-trace certification rule, and the cold-storage configuration
were unchanged.

The latest verified **populated mobile dashboard** passes the required five-run
gate: performance **97**, accessibility **100**, best practices **100**, FCP
**1875 ms**, LCP **2251 ms**, CLS **0.000018**, and TBT **52 ms**. This is a
selected-page result, not certification of the full route/state matrix or the
deployed service. The final progression and source decisions are recorded below.

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

At this experimental stage, the application document preloaded its mandatory
English catalogue and the actual installed Inter Latin variable font. The English
catalogue hint remains; the font hint was removed in the final measured change
described below. Static public documents remove the app-only catalogue hint.
A fresh Chromium check at this stage passed for all twelve locales:
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

## Subsequent measurements and verification

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
The held artifact remained unchanged during the full E2E run. The subsequent
canonical quality run passed with the PDF fallback and earlier preload placement
in its fresh build; a successful quiet timing measurement is still required
before claiming a benefit.

The first canonical populated/empty attempt began at 2026-09-10 05:59:21 UTC and
stopped on the populated page before scoring. An isolated capture identified a
harness defect: among 93 resources, two valid same-origin photo/preview images
used `blob:` URLs and the `blob` protocol. Every HTTPS request negotiated `h2`.
The guard incorrectly applied a network-transport requirement to those in-memory
images. It now applies protocol and HTTP-status checks only to HTTP(S) requests,
while retaining the successful-document requirement. The added blob-positive
regression failed the previous guard; all three navigation tests now pass,
including existing HTTP/1.1, wrong-page and failed-API negatives. Focused lint
passes. Evidence is in `temp/lighthouse-rejected-transport.json` and
`temp/lighthouse-blob-navigation-{red,green}.log`. No application code, byte budget,
or performance threshold changed; no score from the rejected attempt is claimed.

The cold trace estimated 414 ms of origin server latency despite 22.6 ms observed
document TTFB. The local proxy awaits maximum-quality Brotli compression before
sending asset headers and caches that result. A later warm trace estimated only
2.1 ms of server latency while still missing the timing targets, so cold encoding
cannot explain every remaining failure. Only an isolated ignored timing helper
was prepared; no proxy behavior change was made.

### Linux audit-browser startup

The first remote UI audit jobs failed before navigation with an opaque debugger
connection refusal. The retained public-home job identifies Ubuntu 24.04.4 but
does not preserve the browser's underlying stderr. Inspection of the installed
`chrome-launcher` shows that it automatically disables the setuid sandbox on
Linux, writes stderr under the owned profile, and defaults to silent logging.
The existing audit cleanup then removed that profile. This establishes why the
original failure lacked a useful diagnostic; it does not establish the exact
Linux crash reason from that log alone.

Chromium documents Ubuntu's restrictions on user namespaces for downloaded
browser builds and the supported use of the already installed Chrome sandbox
helper through `CHROME_DEVEL_SANDBOX`:
[Chromium sandbox guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
The audit launcher checks its CI installation at
`/usr/local/lib/lumafoil/chrome-sandbox`, then an existing packaged Chrome helper
at `/opt/google/chrome/chrome-sandbox`, using `lstat`.
Only a root-owned, setuid, executable regular file that is not group/world writable
is selected. When verified, the launcher keeps the pinned Playwright Chromium and
copies its ordinary default flags while omitting only the automatic setuid
prohibition; the helper path is supplied only to that child process. Other hosts
retain Chrome's normal namespace mode. The selected mode is logged explicitly.
No `--no-sandbox` option is added and no namespace/AppArmor setting is disabled.

The next actual Ubuntu canary, run `34447701490` on commit `5da48db`, confirmed
`sandbox-unavailable` with `platform-default`; the image did not expose a helper
that passed the trust checks. This also blocked the quality job's real certificate
test. The setup action now installs the helper shipped with the pinned Playwright
Chromium **only on ephemeral GitHub-hosted Linux jobs that install browsers**.
It verifies the locked and executable browser versions, validates the source
helper against a reviewed publisher SHA-256, installs the same bytes into a
root-owned directory as `root:root` mode `4755`, and checks the copied bytes and
permissions. The user-managed browser executable remains owned by the runner so
Chromium accepts `CHROME_DEVEL_SANDBOX`. The shared Windows machine and self-hosted
runner settings are untouched.

The exact publisher archive for Chromium **153.0.8010.12** contains
`chrome-linux64/chrome_sandbox`: **15232 bytes**, distributed as mode `0755`, SHA-256
`c100b678a8c171ad0733e51b6f18d98d936d38ab945681c41da00f2ee22e7571`.
The entry's ZIP CRC, ELF header and hash were independently verified using bounded
HTTP range reads of the same publisher URL recorded by Playwright's CI download.
Evidence is in `temp/pinned-linux-sandbox-publisher.json`. A future browser update
must explicitly update this reviewed pin; no independently sourced sandbox binary
or replacement browser is introduced.

Launch failures are classified into finite reasons before profile cleanup, without
printing raw browser stderr or arguments. The failed launcher instance is also
closed even when startup never returned its normal kill handle. Four injected
launcher/metadata tests cover trusted and unsafe helpers, flag preservation and
finite failures. The existing real certificate test now uses this canonical
launcher, accepting the pinned key and rejecting a different key. Together with
the real certificate check, five focused launcher tests pass, as do lint and formatting. A
disposable-copy drill removed the root-ownership check, failed the unsafe-helper
assertion, then passed after exact restoration. Evidence is in
`temp/audit-chrome-red.log` and `temp/audit-chrome-ci-install-tests.log`. YAML,
Bash and embedded Node syntax checks also pass. Subsequent remote composite setup
on commit `94d2b94` passed the real certificate preflight, and the public-home UI
job confirmed `verified-setuid-helper` startup. This closes the Linux browser
startup blocker; it does not establish that every UI/content/performance audit
passed. The separate measured-page lifecycle defect is addressed below.

### Final populated-dashboard progression

The content-verification failure after the browser-startup repair was a separate
harness lifecycle defect. Installed Lighthouse closes a page it creates before
returning the result. The harness now supplies an owned Puppeteer page through
Lighthouse's supported fourth argument, using Lighthouse's existing locked driver
dependency. Its inspector is bound before measurement and checked against the
same CDP target ID. Content and visible-image decoding are checked on that exact
measured target before the owner closes it; there is no second navigation or
unthrottled clone. Cookie setup, cold-storage settings, throttling and thresholds
remain unchanged. Public-home and populated-dashboard diagnostics then passed
their actual content, image and HTTP/2 checks.

The initial populated dashboard exposed a real shift hidden by the earlier empty
fixture: the Tools section contributed 0.102752 of the total 0.102767 CLS. A
controlled real-response geometry check showed it moving from y=692 to y=1319
when the 144 px loading area became the populated thumbnail grid. The route-loader
experiment fetched history and view before first layout, eliminating that shift,
but its sample still missed LCP and TBT. That additional loader wait was reverted;
the final dashboard loader again performs its original admitted-member-role read.

The retained design provides a stable, scrollable Office-style results panel:
`h-80` on mobile and `sm:h-[22rem]` on larger screens (320 and 352 px at the default
root font size). Loading, empty, filtered and populated states use the same panel;
all real results remain available by scrolling. On mobile, the thumbnail opener
is a horizontal row with a visible **96×72 px** preview beside the filename,
with the real status and date retained. At `sm` and above, it returns to the full
card/grid layout. The first thumbnail is eager/high priority only once its real
data exists; the remaining thumbnails stay lazy. No image is hidden or held back
to change the metric.

These reports use the canonical populated fixture, unchanged mobile budgets and
HTTP/2 transport. Most rows are successive build diagnostics, not isolated
single-variable experiments. The route-hint pair is the matched exception: it
used the same artifact and an isolated, equal-length transformation of only the
dashboard's preload controller. Its CSP headers, inert map, asset bytes and offline
inventory remained unchanged. Disabling hints worsened the three-run median, so
the private hints were retained. Accessibility and best practices were 100 in
every row below.

| Populated dashboard variant                    | Traces | Performance | FCP ms   | LCP ms   | CLS          | TBT ms |
| ---------------------------------------------- | ------ | ----------- | -------- | -------- | ------------ | ------ |
| Owned-page baseline                            | 1      | 84          | 1323     | 2823     | 0.102767     | 373    |
| History/view loader experiment                 | 1      | 91          | 1504     | 3034     | 0.0000       | 181    |
| Matched route hints enabled                    | 3      | 92          | 1875     | 3027     | 0.0000       | 148    |
| Matched route hints disabled                   | 3      | 84          | 1651     | 3172     | 0.0000       | 381    |
| Compact mobile thumbnails                      | 1      | 89          | 1693     | 3038     | 0.0000       | 223    |
| Stable results panel; original loader restored | 1      | 93          | 1590     | 2859     | 0.0000       | 164    |
| Early Inter preload removed                    | 1      | 96          | 1622     | 2522     | 0.0000       | 118    |
| Final artifact, required five-run aggregate    | 5      | **97**      | **1875** | **2251** | **0.000018** | **52** |

Retained report directories are `m19-owned-page-proof`,
`m19-dashboard-prefetch`, `m19-route-hints-on`, `m19-route-hints-off`, and
`m19-no-font-preload-five` under `docs/lighthouse/`. Intermediate single-run
commands remain in ignored `temp/` logs instead of duplicating public reports.
The first seven rows are explicit diagnostics. The final evidence is
`docs/lighthouse/m19-no-font-preload-five/mobile/dashboard.json` and its HTML and
summary reports, with the command log in
`temp/lighthouse-no-font-preload-five.log`.

The final source diff removes only the early Inter `<link rel="preload"
as="font">` from `index.html`. It does not remove the font: `main.tsx` still
imports `@fontsource-variable/inter`, the application CSS still selects
`Inter Variable`, and the font catalogue still includes that package and family.
Its normal `@font-face` rule remains available to the page and the existing font
loader remains available to the editor/renderer. The retained final Lighthouse
report records successful HTTP/2 requests for the Inter Latin WOFF2 with
`isLinkPreload: false`. The change removes an early high-priority request rather
than substituting a different font. The English catalogue preload remains.

The five final traces all completed the same-target content/image checks and
recorded `h2` for HTTP(S) traffic. Individual performance scores were
97/97/97/97/96; LCP was 2476/2250/2251/2250/2252 ms and TBT was
94.5/52/41.5/46.5/137.5 ms. Each trace was within the mobile limits; the required
aggregate uses median performance/timings and minimum accessibility/best-practice
scores. The fresh build also passed its bundle and built-publication gates, as
recorded in `temp/lumafoil-build-no-font-preload.log`.

**Certification boundary:** this passing aggregate covers only the populated
`dashboard` scenario on the local final build. It does not certify the empty
dashboard, every Recents view, other routes, the desktop matrix, all device E2E or
screenshot checks, or production-hosted TLS/performance. Those gates require their
own final-artifact evidence; no completion is inferred from this selected page.

### Remaining gates

- Resolve any other route-specific performance failures exposed by the complete
  matrix without weakening live session admission, ownership or authorization.
- Keep the now-passing application byte budget green through final source changes.
- Recheck fresh first visit, offline reload and reconnect behavior after the final
  startup change, including explicit boot failures and redirected routes.
- Run complete five-trace desktop and mobile matrices for the shared 33-state,
  27-leaf-route inventory against the final build. The previous 17-target inventory
  cannot certify that expanded scope.
- Run final quality, SAST, full Playwright/axe and screenshot gates. No completion
  box may be inferred from these selected-page diagnostics.
