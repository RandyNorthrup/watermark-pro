# Static asset failure reassessment — proposed receipt, 2026-10-03

## Completed current run and bounded comparison

The current canonical four-device run completed on 2026-10-03 with 149 passing,
seven failing, zero skipped and zero flaky cases in 29.95 minutes. Original two
workers and deadlines were retained. Seven safe static captures all classify as
`network_connection_lost`, with 190 total/captured bytes, complete/untruncated,
and digest `438c28532a44d458a2544fa4aed12ef2c1a5e195d48f8c03f2b724264637f8e9`.
Five asset-500 network records appear in the three failed signup-boot traces;
no asset 500 appears in the separate account-removal, two Recents or iPad
offline-conflict traces. These different failures require separate evidence.

The complete JSON report is private outside the repository, 14,067,113 bytes,
SHA256 `718a8c34e70ce8a67a0631a57b06fe209c23feac71a3977064a197428ade5401`.
The private runtime log is 96,875 bytes, SHA256
`6ff9adef3ffcfdb1c6efc946c62c4041842f560d610466663e6054fd415c64ce`.
Both have mode 0600; seven failing traces were copied to a mode-0700 temporary
directory with mode-0600 files before the focused rerun reset test output.
Raw auth/network bodies, browser snapshots and embedded token/cookie logs are
not publication artifacts.

After the complete run ended, one bounded existing-SDK native/direct comparison
ran six trials only: ordinary response, cancellation before response headers and
cancellation after the first real partial body chunk, for each transport. Actual
dispatch/cancellation phase checks passed. Six genuine local fixture signups and
documents returned 200; all 42 reads of the seven exact boot assets returned 200
and matched built bytes. No downstream error reproduced. The fixed result is
`not_reproduced_within_six_trials`, not release certification or evidence for a
retry, fallback, sleep, routing change or increased deadline. The private result
is 14,479 bytes, SHA256
`5824f21a442dd21d9be83c85e965bdd70b11e966ca4bccfe8442cd9e4720a910`.
The exact executed script SHA256 is
`04c2e6d6ec66a84dfdbb8899179922c38380b1e1536956094aeee733fc24f680`.

The separate account-removal trace established a test-readiness error: login URL
and root cleanup notice appeared before the login main mounted. Resolved primary
snapshots had no main through 429633.502 ms and had the visible main at
430309.310 ms; the axe clone started in the earlier state. A one-line E2E
assertion now awaits the actual localized login heading before axe. The complete
matching iPhone removal journey passes once, with zero skips/flakiness and axe
violations; its actual cleanup notice screenshot was visually reviewed. All
deletion, revoked-share, missing-session and old-credential assertions remain.

Recents' completed original preflight followed by a stalled redundant load is
under a compact isolated correction with owner/workspace negatives. The iPad
conflict trace separately contains a session request unfinished across reconnect
and no replay write. Their underlying WebKit transport cause remains unproven.
Full current device recovery, strict dependency audit and M19 release gates
remain open; production signup/billing flags stay closed.

## Earlier creation-run evidence

The original creation four-device Playwright run exited one: 129 passed, 14
failed and one did not run in 43.8 minutes. Its ignored private console log is
`/tmp/lumafoil-creation-e2e.log`: 98,329 bytes, SHA256
`7ba6c13f84ccb56d2bedaf453de1fd1edf69129ebc0a7912cc0b20eed99fbf16`.
The creation receipt records built JavaScript/CSS HTTP 500 responses with
`text/plain;charset=UTF-8` and declared length 186 while affected authentication
and workspace creation calls returned 200. Bodies were not retained. Since the
bridge emits its own forwarding failures as 502, these 500s originated below it
in the native SDK/workerd/static-asset path; the precise exception is unproven.

Finite extraction found 481 client-disconnected/runtime-dispatch/abort errors,
12 client-disconnected/response-stream/premature-close errors, two not-ready
validation refusals and one invalid-host refusal. It found no static observer
records or known cross-request-I/O, network-lost, worker-uncaught or EADDRINUSE
exception text. No raw request headers, bodies, cookies, passwords or embedded
Playwright call logs were emitted. The fourteen failed cases and stopped serial
follow-up remain failed; Android bulk ECONNRESET, WebKit offline queue/cache
results and video generation assertions are separate unproven symptoms.

Earlier bounded native/direct comparisons returned 200 for the complete
2,420-entry original inventory with exact un-aborted bytes; the source inventory
SHA256 was `25384ef9d7651004c7f1c059165359427d89f211ed4d1ba4c2d2ab834de013ff`.
The selected iPhone photo, Android bulk and correctly ordered desktop owner/viewer
journeys also passed without reproducing a static 500. These do not establish
whole-matrix recovery or justify changing the dispatcher. The earlier September
SDK socket-allocation and unread-native-upload defects were separately reproduced
and already addressed by the current application/direct and static/native split.
They are not established causes of this October failure.

The proposed one-line CLI change enables the existing optional static failure
observer in normal gate startup. It observes only downstream HTTP 500 responses
under `/assets/`, forwards original bytes/headers unchanged, and emits a fixed
classification, total/captured byte counts, completion/truncation flags and a
SHA256 digest of at most 4 KiB. Paths, unknown exception messages, stack traces,
request headers/bodies and response contents are never emitted. The existing
bridge test already covers complete/truncated capture, success/API exclusion and
random canary absence; its proposed extension sends two auth POST canaries and
asserts their exact 500 response bytes survive without any capture event.

Status: exact two-file patch is integrated with all pre/post hashes matched.
Scoped lint and the complete unchanged gate test pool pass 17/17, zero skips.
This adds safe diagnosis, not a dispatcher behavior correction. Next: run the
current exact built source through all four devices at the existing two workers
and deadlines. A failing mixed browser/offline workload still needs an
actual finite downstream exception/body digest and matching trace status before
any dispatcher correction. Offline readiness requires successful installation,
a matching controller/build and successful workspace preparation; a timing wait
alone does not prove complete cache contents. Full quality, audit, SAST, provider
and release certification remain open; M19 stays open and production flags closed.
