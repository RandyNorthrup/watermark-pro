# Isolated built-Worker gate transport — 2026-09-09 and 2026-09-13

This records the initial gate-server repair and the later connection-reuse
correction. The full E2E
run interrupted by Wrangler's proxy crash is not certified by these focused
checks. Application authorization, CSRF checks, input limits, dependency pins and
coverage floors remain unchanged.

## Runtime and isolation

`scripts/gate-server.mjs` builds the production artifact by default; `--built`
uses the existing artifact. Its runtime helper follows Vite's canonical
`.wrangler/deploy/config.json` redirect and rejects a configuration, Worker entry
or asset directory outside the real `dist` root. Migration directories must
remain inside the real checkout root.

The installed Wrangler 4.129.0 provides the supported
[`createTestHarness` API](https://developers.cloudflare.com/workers/testing/test-harness/).
The gate uses that SDK with the built Worker, compatibility settings, assets,
D1 migration files, R2 and rate-limit definitions. The harness owns ephemeral
local storage (`persist: false`) and a private loopback listener. D1/R2 remote
bindings are explicitly disabled; developer and production variables are not
copied. An isolated configuration and `.dev.vars` file are generated under an
owned `temp/lumafoil-gates/run-*` directory. Dotenv and process-environment
discovery are explicitly disabled. The only secret is a freshly generated test
Better Auth secret supplied in memory. Test email goes to the existing console
mailbox provider.

All real D1 migrations finish through `WorkerHandle.applyD1Migrations` before
the browser bridge becomes ready. Startup checks require the built Worker to
report healthy `test` state. Shutdown closes the bridge and SDK, then verifies
the exact owned directory before removing it. The launcher must run as an
ordinary Node file, as its canonical command does. A diagnostic invocation
using `node --input-type=module -e` deadlocked Miniflare's synchronous binding
proxy because its internal CommonJS eval worker inherits the ESM-only flag.
The same factory called from an ordinary `.mjs` controller completed migrations
and shutdown successfully. No dependency or application workaround was added
for that unsupported invocation pattern.

## HTTP behavior

The bridge binds only `127.0.0.1` and uses the canonical browser origin
`http://localhost:5273`. It rejects foreign absolute targets, forged Host values
and GET/HEAD request bodies before dispatch. Request bodies and response bodies
stream with per-request cancellation. A normal completed request does not abort
its response; a disconnected client cancels only its own work.

The bridge preserves Origin, account headers, cookies, status, response headers
and separate Set-Cookie values. It strips hop-by-hop fields and untrusted `MF-*`
headers before either dispatch path. Header names are snapshotted before deletion
so adjacent routing fields cannot be skipped. It asks for identity encoding
because either fetch implementation may decode responses, and fails a contrary encoded
response instead of sending decoded bytes with stale gzip/Brotli headers.
Requests arriving before migration readiness receive 503. Dispatch errors
receive 502, or a terminated stream if headers have already been sent. No failed
request is retried or rewritten into a successful response.

Failure diagnostics contain a finite request stage and whitelisted transport
code or fixed error classification. Raw SDK error text, stack, request URLs and
configuration are not printed. The first repaired-gate desktop batch survived
all tests but recorded two forwarding failures; one trace captured a 502 for
an input module before the offline worker installed, with no captured response
body. That module later returned 200 and 304. Its exact original cause cannot be
recovered from the previous classification-only log. It was not retried by the
bridge or converted to success, and the subsequent isolated offline conflict
rerun produced no additional gate failures. The stage diagnostics allow any
recurrence in the final run to be investigated without exposing private data.

The dispatcher is a small local test adapter Worker, configured as the primary
Worker. Application paths (`/api/*`, `/`, `/privacy`, `/terms`) and all requests
carrying a body retain the supported `WorkerHandle.fetch` transport. Bodyless
static and SPA requests use the supported harness `listen().url` through pooled
HTTP. The same `isGateWorkerPath` matcher controls dispatch and service routing;
there is no second route list. The adapter sends application paths through a
native service binding to the unchanged compiled application Worker; other paths
go to the native ASSETS binding inside workerd.

At adapter entry, the request's external URL is restored from trusted
`GATE_ORIGIN` configuration because the native listener otherwise supplies its
own ephemeral address. The path and query remain intact. Caller Origin, account
headers, cookies and request/response bodies are not rewritten or buffered. The
native asset service retains SPA fallback, redirects, `_headers`, and method
handling. Startup fails unless the built configuration has exactly that
verified set of four disjoint Worker-first patterns and the ASSETS binding;
unknown rules, negated patterns and duplicates are rejected.

Only the tiny test adapter is bundled by Wrangler to include its shared route
matcher. The actual built application remains `no_bundle`, with its original
compiled modules. Both Workers and the asset binding are local to the same
owned SDK session; no remote service or deployment is created.

## Initial 2026-09-09 verification and rejected approaches

- Five real Node HTTP bridge tests pass: readiness, exact POST framing,
  foreign-Origin preservation, multiple cookies, response encoding failure,
  streamed output, interrupted upload/download, per-request cancellation,
  hostile target rejection and continued service after failures.
- An Origin-rewriting mutation in a disposable copy failed the direct Origin
  assertion with exit 1. Byte-exact restoration passed all five tests with exit 0. Canonical source was not mutated for that drill.
- A separate disposable routing mutation removed the exact public Worker
  paths. The real SDK fixture failed directly because `/` reached assets
  (200) instead of its actual fixture Worker (404). Byte-exact matcher
  restoration passed all three SDK tests; canonical source was unchanged.
- The actual built-Worker SDK prototype applied all 12 canonical D1 migrations,
  performed real R2 put/get, confirmed absent provider secrets, and returned
  exact compiled asset bytes with identity encoding. An ordinary-file factory
  probe and canonical fixed-port launcher both started successfully.
- Five real client-aborted large asset downloads each left the current bridge
  alive and were followed by a healthy response. A subsequent complete download
  matched the compiled file byte for byte.
- The SDK proxy path has a separate defect: a completed foreign-Origin
  POST is correctly rejected with 403, but the next `harness.fetch` health
  request can receive Miniflare's 500 `Network connection lost.` response. The
  same sequence reproduces directly through the SDK without the Node bridge.
  Connection-close headers did not fix it (five out of five following requests
  failed), so they were not added as a workaround.
- The supported direct application `WorkerHandle.fetch` path avoids that rejection/health
  defect (five out of five following health responses were 200), but bypasses
  asset routing: an actual compiled asset and `/app/editor` return 404. Therefore
  it was not substituted for all browser dispatch.
- Calling `env.ASSETS.fetch` from Node also failed parity. Miniflare copies the
  request's Origin onto its local binding-proxy URL, whose development-only
  `/cdn-cgi` origin guard rejects a foreign Origin before the asset service runs.
  The final adapter invokes the native binding inside workerd, preserving the
  original Origin and avoiding that Node-only transport restriction.
- The in-workerd adapter matched the SDK's original route dispatcher on 84
  representative cases: GET, HEAD and POST; public and app routes; actual and
  missing assets; API and unknown paths; query strings, trailing slashes,
  percent-encoded paths, and navigation Accept/mode headers. Status and body
  bytes matched, along with CSP, cache policy, content type, ETag, redirect and
  other material response headers. Random request IDs and Date were compared
  independently of deterministic response data.
- The strict initial header comparison exposed two transport differences,
  preserved in the failed probe evidence: direct responses can provide a
  Content-Length where the proxy uses chunked transfer, and native SPA fallback
  retains Miniflare's diagnostic `x-mf-additional-response-log` header. The final
  comparison independently verified every declared non-HEAD content length
  against the exact response bytes, required chunked encoding where present,
  and checked that diagnostic against its one observed finite SPA message.
  These fields were not confused with application security or cache headers,
  nor rewritten to manufacture parity.
- Five direct early-403 sequences each retained healthy subsequent API and
  native asset requests. Five actual HTTP client-aborted downloads and five
  early-rejected HTTP POSTs then produced ten healthy follow-up requests, with
  exact compiled asset bytes after the aborts.
- After canonical integration, the fixed-port launcher passed five interrupted
  large downloads, seven healthy responses including one following a cancelled
  403 response body, identity encoding and an exact restored asset download.
- All eight canonical focused tests pass. The three real SDK fixture tests
  cover D1 migration application, R2 put/get, rate-binding wiring, test-only
  environment and parent-secret isolation, Worker/native-asset path distinctions,
  encoded redirects, early request rejection, malformed and escaping build
  configuration, unsupported routing rules, failed SQL startup and owned
  lifecycle cleanup. The five HTTP bridge tests cover transport behavior above.

Private reproduction logs and test output are under ignored
`temp/lumafoil-gate-*`, `temp/lumafoil-sdk-*`, and
`temp/lumafoil-worker-handle-routing-probe.log`. The upstream
[ProxyWorker process-exit regression](https://github.com/cloudflare/workers-sdk/issues/15317)
explains why the original CLI could kill the entire E2E server; the remaining
per-request SDK defect above is separately observed and is not treated as a
passing application response. Passing native-adapter evidence is also under
`temp/lumafoil-workerd-*` and `temp/lumafoil-gate-native-*`. Full quality,
E2E/axe, SAST and performance certification must be completed by the release
owner against the final transport; the earlier interrupted run remains failed.

## 2026-09-13 connection-reuse correction

The later screenshot investigation reproduced real static HTTP 502 responses,
including a JavaScript module and a font-license install request, and a separate
unanswered module request. A failed screenshot attempt is retained as failed;
successful retries or isolated probes do not establish that every historical
failure had the same cause.

A separate fixture copied all 2,418 public offline-inventory URLs into an owned
directory. It used synthetic Workers, both native ASSETS bindings and the gate's
compatibility settings, with no application authentication, D1/R2 user data or
developer credentials. Each transport received eight inventory rounds, eight
readers, five-second idle gaps and 64 early cancellations per round. No request
was retried. The probe's own request deadline recorded a failure if exceeded;
no application or audit timeout changed.

The SDK path failed in round eight with the nested exception
`connect EADDRINUSE 127.0.0.1:<owned runtime port>` (Windows errno -4091), which
became the gate's fixed 502 response. Installed Miniflare source sets
`options.reset = true` on each SDK runtime dispatch; its bundled Undici destroys
that connection after the response. An independent 40-read observation of
`undici:client:connected` counted 41 opened connections through the SDK and 2
through the native listener. Together, these establish a reproduced loopback
connection-allocation failure and the SDK's avoidable per-asset connection churn.
The finite diagnostic allowlist now identifies `EADDRINUSE` without logging the
address, exception text or stack.

| Isolated workload                                                      | Asset reads | Early cancellations | Incorrect responses | Byte mismatches |
| ---------------------------------------------------------------------- | ----------: | ------------------: | ------------------: | --------------: |
| Original SDK dispatch                                                  |      19,344 |                 512 |          1 HTTP 502 |               0 |
| Native listener comparison                                             |      19,344 |                 512 |                   0 |               0 |
| Corrected native adapter, with trusted-origin and forged-header checks |      19,344 |                 512 |                   0 |               0 |

The initial native comparison failed the external-origin contract. Restoring the
trusted configured origin corrected that difference. A negative header test also
caught an early implementation mistake: deleting from a live Headers iterator
skipped an adjacent `MF-*` field. The snapshot-before-delete correction was
verified before integration.

Routing every request through the native listener was rejected by the actual
Worker fixture: an unread upload received its correct 403, but the next healthy
request returned 500. Adding `Connection: close` only to body-bearing requests
did not fix that failure. The final split therefore retains the already proven
SDK path for application requests and streamed bodies, while pooled HTTP handles
the large volume of bodyless static requests. This changes no production Worker,
upload buffering, operating-system settings, dependency version, retry policy or
acceptance threshold.

The final canonical `startGateServer` factory was then exercised against its own
copied public assets and isolated synthetic bindings for eight complete rounds:
19,344 asset reads, 16 early refused uploads (both API 403 and static-path 405),
and healthy API and exact-byte asset responses immediately after each refusal.
There were zero failed reads, incorrect statuses or byte mismatches. This mixed
run verifies the final dispatch selection, not only the standalone native helper.

The maintained `npm run test:gate` suite passes all 15 tests. Its real Worker
fixture verifies migrations, R2 and rate bindings, external URL and original
Origin/account/cookie/body values, forged routing-header removal, multiple
Set-Cookie values, redirects, live streamed output, cancellation, early unread
403/405 responses followed by healthy requests, identity encoding, native SPA
handling, invalid configuration refusal and owned cleanup. Separate bridge tests
exercise truncated uploads, cancelled downloads, hostile targets and failures
without leaking arbitrary diagnostics.

Disposable mutations removed trusted-origin restoration and routing-header
removal separately. Each failed the direct request assertion with exit 1;
byte-exact restoration returned the eight bridge tests to green. A real built
application smoke also passed initial signup, verification-email origin, returning
login, session-cookie domain/path/HttpOnly attributes, session identity,
foreign-Origin and foreign-account refusal followed by healthy API/assets, and
logout revocation without a global site-data wipe. It used isolated D1/R2 state
and printed only fixed check labels.

Scoped ESLint, TypeScript and dead-code checks passed. The unchanged SAST rule
sets ran 203 applicable rules on the five changed gate source/test files with
zero findings and complete parsing. This is scoped evidence, not a replacement
for the release owner's full quality and application security gates.

Detailed private evidence remains under ignored
`temp/gate-sustained-u0C3iZ/`, `temp/gate-native-red-*`,
`temp/gate-post-close-*`, `temp/gate-auth-origin-smoke.log`, and
`temp/gate-final-isolated-upload-tests.log`. Final mixed-load evidence is at
`temp/gate-final-mixed-probe.log` and `temp/gate-final-mixed-QKhS4y/results.json`;
the final origin/header drill receipt is under `temp/gate-native-red-Jqdyky/`.
The release owner still owns full
quality, E2E/axe, Lighthouse and screenshot certification against this final
transport. These focused checks do not close the earlier interrupted audits.
