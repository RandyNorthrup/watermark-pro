# Disconnected proxy socket acceptance — isolated candidate, 2026-10-03

The existing outage proxy destroyed owned sockets at disconnect and rejected
parsed HTTP/CONNECT requests during outage, but newly accepted raw TCP sockets
remained open until request parsing. A new test uses actual socket connect/close
events without sending any request bytes. Its connected control survives a real
HTTP forwarding round trip; disconnect closes that original socket. A fresh
socket during outage must then close without forwarding upstream. The five-second
failure bound matches the existing gate stream-observation budget and is not a
sleep, changed E2E timeout or measured performance claim.

Stock source passed four existing cases and failed the new case: the disconnected
proxy kept the raw socket open. The candidate adds only the disconnected-state
condition to the existing connection handler and destroys that just-accepted
owned socket. Both syntax checks pass. The final complete isolated proxy pool
passes all five cases with zero skips; exact logs and source/patch hashes are in
handoff.json. No root source, Git ref/index, dependency, SDK, browser, rate control,
authentication check or navigator state was changed.

This proves a narrow transport-fixture contract gap and its correction. It does
not prove that the gap caused WebKit's pending session read, fix the iPad offline
conflict journey or resolve native asset 500 responses. After Root review and
integration, the unchanged actual iPad conflict journey must confirm behavior.
The application's same-account session validation and HTTP403 handling remain
required; no offline-sync framework or session-check bypass is proposed here.
M19 remains open. No further runtime experiment is authorized by this receipt.

## Root integration

Root reviewed and integrated the exact two-path patch with all before/after
hashes matched. The complete canonical integrated proxy pool passes five cases,
zero failures/skips. The unchanged iPhone/iPad conflict-preservation and Recents
journeys then pass all four selected cases at the original two workers and
deadlines, with zero skipped/flaky journeys and axe violations. Actual offline
original captures from both devices were viewed and retained as named fixtures.

The private browser report is 10,797 bytes, SHA256
`be2dd6033e79bf9788a1b76b85b8daa2aead3c002f69327137e8b0d7cac9e42a`.
Duration is 135.35 seconds, not a performance benchmark. This supplies matching
focused recovery evidence. It does not prove the exact WebKit internal socket
cause, the unrelated asset-500 cause or a complete four-device recovery.
Current global regression/security/static and remaining release gates follow.
