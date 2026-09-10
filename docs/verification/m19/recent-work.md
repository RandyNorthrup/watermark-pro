# Recent work and portable offline media verification

Date: 2026-09-09. This is focused implementation evidence; full release gates
and hosted certification remain owned by the M19 checklist in `PLAN.md`.

## Product contract and existing paths reused

The dashboard now shows the signed-in account's actual recent opens, saves,
and watermark uses in its current workspace. Existing gallery and library
creation/opening paths record activity. Resource creation/modification dates
are not substituted for usage dates. A saved photo opens the existing gallery
viewer and can be downloaded, shared, or deleted according to the account's
permissions. It is not presented as an editable original-photo project.
Watermarks reopen the existing full designer.

The visual structure follows Microsoft's public description of
[recently opened file shortcuts](https://support.microsoft.com/en-us/office/collab-files/customize-the-list-of-recently-used-files-in-office-apps)
and [recent files with locations](https://support.microsoft.com/en-us/office/collab-files/open-files-from-the-file-menu).
No user's Microsoft files were accessed for this research. The requested three
views are distinct: a thumbnail grid with actual rendered presets/photos, a
compact list, and a details table with type, location, last use, and real saved
or pending/conflict status. The labelled view controls expose `aria-pressed`;
the details table scrolls inside a keyboard-accessible region on narrow screens.
Search, empty, loading, retry, and storage-error states are implemented. Existing
rose glass surface tokens and shared controls supply styling.

## Ownership, persistence, and access

Migration `0011_recent_activity.sql` adds account/workspace/resource activity
and an account-specific view preference. The server derives the owner from the
authenticated session, validates request schemas and clock bounds, checks the
current workspace permission, and fetches resources with an organization filter.
The latest event wins when an older offline event is replayed. The server keeps
48 activity identities and returns at most 24 extant resources; deleted rows
are pruned without exposing their former names or previews. Resource lookups
and cleanup are batched rather than issuing one query per visible item.

Local activity uses the existing account-scoped IndexedDB records and canonical
offline media cache/outbox. Pending entries contain validated DTO snapshots and
event timestamps, not duplicate image blobs or signed cloud URLs. Snapshots are
needed to display work created offline before a server record exists. A 404 for
a still-pending creation keeps its activity for retry; a confirmed missing
resource is removed. Permission failures do not trigger a stale-data fallback,
and the UI hides React Query's retained rows after a failed authorization refresh.
Both the envelope and the nested DTO's workspace are checked.

View choices persist locally and to the account. An older network acknowledgement
cannot replace a newer offline selection. Account-generation guards surround
asynchronous work, including the lazy import used by nonblocking activity tracking.
The event time is captured before that import. Account switching clears visible
viewer state; the canonical account lifecycle purges other accounts' cached data.
Tracking failure does not misreport a successful primary photo/preset save: the
dashboard exposes a separate, actionable message.

## WebKit binary persistence correction

The initial iPhone/iPad journey failed at gallery save with an IndexedDB request
error: `UnknownError: Error preparing Blob/File data to be stored in object store`.
An independent local probe reproduced this using only a four-byte Blob in an
empty database; ArrayBuffer storage succeeded. Chromium accepted both. The
[WebKit issue history](https://bugs.webkit.org/show_bug.cgi?id=188438) documents
the same error family, including reports involving private browsing. This is
evidence of this host's WebKit behavior, not a claim that every Safari version
has the defect.

The canonical database now writes a versioned ArrayBuffer/MIME envelope for
photo, thumbnail, logo, and cached-media bytes. Readers reconstruct the Blob
objects expected by the existing renderer/export/import APIs. Older Blob rows
still decode. Binary preparation completes before opening a write transaction;
the original account generation is checked after preparation and inside the
transaction. There is no base64 expansion, skipped save, or online-only fallback.
Atomic metadata updates still use a single read/write transaction. Request errors
now retain their concrete cause instead of losing it to a generic transaction
message. Pending foreign-account binary work continues to block an account switch
that would discard it.

## Focused evidence

- The combined client-data, dashboard, worker-route, native IndexedDB, and binary
  tests passed **46 tests in seven files**. The new recent data/event and binary
  helpers measured **98.06% statements, 95.69% branches, 100% functions, and
  99.12% lines** in that scoped run. No coverage floor was changed.
- Real D1/workerd applied migration0011 and passed its activity upsert,
  preference isolation, and nonmember denial test. The Node route tests use real
  Better Auth and cover owner/admin/editor/viewer, anonymous, nonmember, foreign
  IDs, forged owner fields, malformed timestamps, ordering, and deletion.
- Browser persistence tests prove simultaneous distinct opens survive atomic
  updates, exact binary bytes/MIME survive storage and retirement, stale binary
  preparation cannot write after an account changes away and back, and a failed
  updater leaves its prior value intact.
- A regression test first failed with `expected 'details' to be 'list'` when an
  older online acknowledgement replaced a newer offline view choice. Conditional
  acknowledgement fixed it; the complete data suite then passed.
- The first isolated desktop journey passed all three views, actual preview
  decoding, exact downloaded dimensions, offline reload/reopen, deletion, and
  same-browser account isolation. A subsequent matrix exposed the WebKit Blob
  failure above and a shared-button transition contrast failure. The shared
  control owner changed color transitions to shadow-only transitions; axe checks
  were not delayed or suppressed to hide the intermediate contrast defect.

The first isolated `npm run build` failed its actual bundle limits (shell
140.1/140 kB and video96.1/60 kB). Functional investigation used its emitted Vite
artifact with that failure explicitly retained. The performance owner subsequently
reported a fresh build passing all route budgets and the shell at139.4 kB, including
the binary correction and shared-button fix. The final four-device journey and
disposable privacy red drill are recorded below when executed.

No real account content, production migration, deployment, or provider-console
mutation was performed by this workstream. Test accounts and isolated storage
use synthetic data and generated test secrets. Full integrated quality, security,
accessibility, screenshot, and hosted gates still belong to release certification.

## Subsequent browser and negative-proof results

The fresh isolated gate artifact passed the entire original journey on desktop
Chrome and Android. On iPhone and iPad, the new binary representation fixed the
save failure; actual photo/preset previews, all three views, downloaded PNG
size, and axe/contained-overflow assertions passed. Offline-toggle reload then
failed with Playwright WebKit's `WebKit encountered an internal error`.

A separate minimal local service worker reproduced this error even when its
fetch handler returned literal HTML without reading any cache. Returning cached
responses, streams, complete buffers, or cleaned headers made no difference.
The four-byte Blob probe and this minimal service-worker probe are independent
of Lumafoil source. They are retained under `temp/probe-webkit-idb.mjs` and
`temp/probe-webkit-offline.mjs`. This finding does not exempt the offline gate.

A second probe uses a loopback proxy to destroy network sockets while leaving
`navigator.onLine` true, representing an adapter that remains connected during
an Internet outage. WebKit successfully loaded the cached application shell
through that outage, then exposed a real prepared-session boot fallback gap.
The offline workstream owns the corresponding boot/role transport-error fix.
Recents preference reads and saves were separately corrected for this case:
the durable local selection survives network failure and retries later, while
an authoritative denial still rejects. Its independent unit test passes.

A disposable copy removed only the authorization-display guard. The previously
passing private-row test failed with `expect(element).not.toBeInTheDocument()`
because the private preset name remained visible after a 403. Exact restoration
passed again, and the canonical component's SHA-256 stayed
`e03eee3292919bf2a0fd3680075a58f11976832c4872ea3a24ace80f94e64d43`.
The drill controller initially checked stdout alone while Vitest wrote the
expected failure to stderr; both streams were retained, the intended failure
was independently checked, and restored green completed. Logs live under
`temp/recent-privacy-red-20260909`.

Desktop thumbnails and iPhone details screenshots were visually inspected.
Three views on all four devices have real screenshots under
`temp/recents-gate-results`. The narrow details table keeps its horizontal
scroll inside its labelled region; it does not widen the document. The mobile
bottom bar is fixed to the viewport, so full-page capture shows it crossing a
mid-document row; normal page scrolling moves that content past the bar.

Current scoped ESLint passes, and the last TypeScript check was green. The full
release/device gates remain open pending the offline boot fix, a fresh artifact,
and completion of the outage journey; these intermediate results are not a
claim of four-device offline certification.

## Account-boundary follow-up

The updated real-network-outage journey passed fully on desktop Chrome, iPhone
WebKit and Android. iPad completed its offline/recovery checks, then exposed a
late sign-out navigation while opening the second account. The account workstream
fixed that application race and serialized account cleanup; a fresh integrated
run remains required. The controlled outage keeps the network adapter online,
destroys origin-proxy sockets, verifies a request is unreachable, and allows the
existing periodic retry to observe recovery without synthesizing online events.

The operating-system Share Target inbox now clears only the explicitly named
exiting account. Bulk import captures its owner and consumes files in one guarded
read/write transaction, preventing a new incoming share from being discarded
between separate read and clear operations. It also rejects results after the
destination is unmounted or the account generation changes. Twenty-three focused
inbox/expiry/bulk tests passed. A disposable mutation widened the owner predicate;
the test caught the loss of B's incoming file during A's delayed cleanup. Exact
restoration passed and preserved the canonical source hash. This supplements the
account workstream's transition-serialization proof.

The screenshot runner now requires a complete, deduplicated inventory of 37
surfaces in English and Arabic, light and dark, on desktop Chrome, iPhone, iPad
and Android. It verifies real seeded library/gallery/share content, performs
axe and horizontal-overflow checks for every capture, and includes the three
Recent views, account/invitation pages, normal-glass Chromium media emulation,
and the default reduced-transparency setting. A first old-build smoke captured 87
images and completed the desktop light English/Arabic set; it is explicitly not
the final visual gate. The runner waits for image/font readiness, actual preview
changes and menu animation completion, uses bounded failure diagnostics, and
records only surface/profile/theme/locale metadata, not session URLs or console
bodies.
