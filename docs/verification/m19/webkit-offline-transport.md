# WebKit offline transport verification — 2026-09-10

The iPhone and iPad jobs in
[CI run 34443144734](https://github.com/RandyNorthrup/watermark-pro/actions/runs/34443144734)
failed all three offline/Recents journeys at offline document reload with
`WebKit encountered an internal error`. This investigation changes test
transport only. The application, service worker, required static inventory,
authorization, cache ownership and journey deadlines remain unchanged.

## Diagnosis against the actual built application

The existing iPhone trace artifact was reused from ignored local storage; no
additional artifact or production data was downloaded. The failed document
navigations had no received HTTP response (status -1). Local WebKit reproduced
the error with both Playwright `page.reload()` and a page-initiated
`location.reload()`, so replacing the reload command was not a demonstrated fix.

Fresh contexts had an activated controller, no installing or waiting worker,
and all 2,174 cached entries for the held build. The cached public shell was a
nonredirected basic 200 response, with 20,558 bytes, matching Content-Length and
no Content-Encoding. Direct cached-response cloning and a new response from
buffered shell bytes failed under `BrowserContext.setOffline(true)` just as the
original stream wrapper did. An already cached JavaScript fetch also failed,
although direct Cache API reads succeeded. No production response rewrite was
retained from these diagnostic arms.

Browser routing was also rejected as an outage mechanism: WebKit still reached
the real health API after a `BrowserContext.route(...).abort(...)` rule was
installed. A cached page rendering under that condition would not prove offline
operation.

A real disconnected loopback proxy supplied the positive control. The unchanged
worker served cached JavaScript and reloaded the actual authenticated app while
the uncached health API was unreachable. The final forward-proxy comparison
preserved the original application origin and performed 2,258 actual upstream
requests during preparation. After its owned transport closed:

- The uncached health API failed.
- A cache-busted static asset, first confirmed absent from every cache, failed.
  This exercises the service worker's own network fetch as well as API traffic.
- An existing cached script returned 200 and its real bytes.
- The original `/app` document reloaded with its actual workspace heading and
  activated controller.
- An independent API observer still performed a real authorized mutation.
- The proxy's upstream request count did not increase, so the navigation did
  not escape to the server.

These results isolate the observed failure to WebKit's offline emulation path
in this environment. They do not establish a general Safari engine defect or
justify changing production cache/response behavior. Stable, sanitized evidence
is in `temp/lumafoil-webkit-offline-navigation.json`,
`temp/lumafoil-webkit-response-forms.json`,
`temp/lumafoil-webkit-disconnected-proxy.json` and
`temp/lumafoil-webkit-forward-proxy.json`.

## Scoped fixture behavior

Only `e2e/offline.spec.ts` and `e2e/recent-work.spec.ts` import the new offline
fixture. Chromium projects retain native `context.setOffline`. WebKit receives
one loopback forward proxy per test through Playwright's public context proxy
option. It admits only the exact configured local gate; other origins, forged
Host values, URL credentials and fragments are refused. CONNECT support is
restricted to the same gate authority because Playwright's API client uses
CONNECT even for HTTP. End-to-end URL, Origin, cookies, body bytes, statuses and
separate response cookies are preserved; only HTTP hop-by-hop fields are removed.

Disconnection severs only that proxy's owned sockets and upstream requests.
Reconnection reuses its original listening port, so the browser never changes
origins or sessions. Every outage verifies both real network failures and a real
cache hit. Restoration verifies an uncached health response before emitting an
`online` event. The matching `offline` notification is emitted only after the
outage checks pass. These notifications model the OS events that a proxy cannot
generate; `navigator`, application stores and response data are not modified.
Automatic replay latency during a server outage with `navigator.onLine` still
true and no OS notification remains a separate behavior, not a claim of these
event-driven journeys.

The conflicting remote edit uses independent Node fetch with a snapshot of the
current account's actual ephemeral cookie and an explicit same-origin header.
It is unaffected by Playwright's inherited proxy defaults. Its target is checked
and redirects are manual, so an unexpected redirect cannot forward the observer
request or cookie to another origin.

WebKit also bypasses the original browser-route hook used to lose a photo-upload
acknowledgement. That fault now lives in its owned proxy: exactly one matching
POST must receive a real upstream 201; the entire acknowledgement is consumed,
then its client connection closes before any response is delivered. The flag is
set only when the connection closes. Other requests and non-201 responses pass
through normally. Chromium retains the original browser-route fault. Final
single-photo and replayed-work assertions remain in the original journey.

## Verification boundary

Four real Node HTTP/CONNECT tests pass, covering byte/header/cookie preservation,
network isolation, independent observer access, same-port recovery, denied
targets, failed upstream requests and the one-operation acknowledgement fault.
The acknowledgement test distinguishes incomplete, completed, unrelated,
replayed and refused responses. Scoped ESLint and Node TypeScript checks pass.

The first integrated WebKit run passed conflict and Recents on both devices;
only the unsupported browser-route acknowledgement hook remained. With the
final proxy fault, conflict and Recents again passed on iPhone and iPad. The
two save journeys in that batch stopped before reaching acknowledgement loss:
one during installation and one on an actual upstream module 502. That batch
remains recorded as four passed and two failed; the gate's two SDK TypeError
forwarding failures were not suppressed or converted to success.

The owned gate was then stopped gracefully and started with `--built`, preserving
the exact artifact. Both existing save journeys passed serially: iPhone in
29.0 seconds and iPad in 31.4 seconds, with no forwarding failures in the fresh
gate log. They exercised actual upstream 201 loss, replay, the final single
server photo, saved-preset reconciliation and offline reload. Thus all six
affected WebKit journeys have passing current-source evidence across the
recorded controlled runs. This is not an assertion that the earlier six-case
batch passed uninterrupted. The logs are
`temp/lumafoil-webkit-outage-final.log` and
`temp/lumafoil-webkit-outage-save-fresh.log`; fresh CI remains required.
