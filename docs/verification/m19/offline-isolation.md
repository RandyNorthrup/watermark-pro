# Offline reliability and account isolation — 2026-09-08

Status: implementation and focused verification complete. Release certification remains open until the integrated build, full quality suite, device end-to-end journeys, SAST, Lighthouse, and screenshot audits pass on the final source.

## Canonical changes

- `offline-context.ts` captures the current account and a generation. A response from before sign-out, expiry, or an account switch is rejected, including a switch away and back to the same user.
- `offline-account.ts` clears private queries, the persisted shell, sync status, and pending launch files before admitting another identity. Cross-tab account events lock the old tab. Expiry preserves the durable outbox. Account switching refuses to silently erase another account's unsynchronized work; the original account must synchronize or explicitly discard it first. Explicit sign-out clears only the exiting account's durable workspace and Share Target inbox. Work queued concurrently with logout is preserved for that account to synchronize after signing in again.
- Custom organization, personal-account, and administrator requests carry `x-lumafoil-account-id`. Better Auth organization, administrator, and signed-in account actions use the same binding through request/response/success/error hooks. The corresponding server checks belong to the private-account delivery. Session discovery and sign-in/callback requests remain able to discover the actual cookie identity.
- Persisted shell snapshots reject mismatched session/user identities and mismatched active workspaces. They contain only the current member; other member profiles and invitation addresses are removed.
- Acknowledged local photo/logo blobs no longer bypass online authorization. Pending deletes hide their bytes. A full authoritative refresh retires acknowledged overlays; retained media moves from the outbox to its scoped cache atomically. A partial page only retires media actually observed on that page. Preparations read all gallery metadata pages, detect repeated cursors, and preserve saved/opened photo bytes for offline use. Newly entered offline gallery searches can filter the complete prepared gallery without requiring that exact search URL to have been visited previously.
- Readiness checks verify committed metadata and preset-logo bytes. Storage failures stay visible. Reconnection retries preparation, and Sync now can retry a failed service-worker installation. Offline recovery actions do not await a network-paused query invalidation.
- The public service worker caches only its static shell for navigation fallback. It never stores invitation or sharing URLs as public cache keys. Downloads use six concurrent requests and include fonts, stickers, product images, the favicon, and install icons. The build identity includes actual static-file bytes and service-worker source, so changing an unhashed asset changes the cache version. Old build assets remain while a second tab may still need them.
- Share Target entries carry the receiving account ID. The Share Target worker checks the live account when connected and the app's remembered account when offline. Unowned legacy entries and another account's entries are never exposed by the client. Clearing the inbox waits for transaction commit. The old hand-written IndexedDB fake was replaced with browser-backed persistence tests.

These are access boundaries in the application and server. They do not claim that browser storage is encrypted against someone with direct access to the same operating-system/browser profile.

## Focused proof

`offline-isolation-tests.log`: 119 tests passed across 16 files with `--maxWorkers=2` (56 Chromium browser tests and 63 unit tests). The invocation includes:

- Browser: offline account, workspace/cache/media, reconciliation, sync, database, preparation, recovery panel, and Share Target inbox suites.
- Unit client: Better Auth account hook integration, custom API account binding, persisted shell, worker registration, and shared-file TTL boundaries.
- Unit worker: real Better Auth-backed library and photo API suites, plus execution of the shipped service-worker JavaScript in a Cache API/lifecycle harness.

`offline-isolation-lint.log`: scoped ESLint command exited zero with no findings. TypeScript initially reported only other agents' in-progress cloud/auth fixture changes; final integrated type checking remains the parent task's gate.

The Node VM service-worker test is strictly checked in `tsconfig.node.json`; it is excluded only from the incompatible workerd type project. It remains discovered in the normal unit-worker test project. No lint, coverage, test, or bundle threshold was reduced.

Two disposable red drills passed:

1. `offline-token-cache-red.log`: restoring navigation URL caching caused the existing invitation/share canary assertion to fail. Baseline exit 0, intended red exit 1, byte restoration verified, restored exit 0.
2. `offline-account-body-red.log`: removing the post-body account guard from a disposable copy caused the installed Better Auth fetch pipeline to deliver the old-account canary after an account switch. Baseline exit 0, intended red exit 1, byte restoration verified, restored exit 0.

Both drills used copied source/test fixtures, left product source untouched, and removed their own temporary files. The aggregate focused suite was rerun after restoration: 119 passed.

## Remaining integrated verification

- Rebuild and run the real offline reload/reconnect/conflict journeys on all four configured browser/device projects, including an actual two-tab account switch and service-worker update.
- Exercise the installed Share Target navigation path using synthetic files. Browser store tests establish ownership and commit behavior; they do not substitute for the operating-system handoff.
- Measure full font/sticker cache installation on a fresh origin, storage-denied/quota-limited behavior, and final first-paint budgets.
- Run full quality/coverage, SAST, axe, Lighthouse, and screenshot gates after the other feature changes settle. No production worker, database, account, or deployment was mutated by this subtask.

## 2026-09-09 sustained-outage and logout follow-up

Browser `navigator.onLine` describes the adapter, not Internet reachability. Boot and role loading now accept a prepared, owner-bound display snapshot after an actual transport failure (TypeError or API status zero), including snapshots older than 24 hours. Account generation is captured before the request. Online navigation still validates the live identity before private content renders; null sessions and HTTP 401/403 remove admission, HTTP 500 and schema errors never fall back, and administration remains online-only. Future timestamps and invalid snapshot structure remain rejected. Twenty focused boot/persister tests include older-than-24-hour transport success and live-revocation refusal; 22 boot/app-page tests also passed.

Account activation and durable logout cleanup are serialized per window and through Web Locks across supporting tabs. The exiting user ID is captured before the server request. An old callback cannot lock an already active different user. Cleanup deletes only the exiting account, and rechecks its outbox within the same transaction: an edit queued in another tab while the HTTP logout was pending keeps both its operation and cached dependencies. The offline Share Target account marker is removed even when work must be retained. A different account remains unable to open that retained work; the original owner can sign in to synchronize it. The global Clear-Site-Data logout header was removed by the private-account delivery because it could erase a newer account's data independently of these boundaries; server cookie revocation and no-store remain enforced. Public service-worker assets remain prepared.

Thirty real-browser account, replay, and inbox tests passed. They include a delayed old response after account B is active, delayed cleanup before both same-account and different-account login, preservation of a save arriving during logout, and preservation of another account's records. The Share Target delivery additionally atomically consumes only the requesting owner's inbox, avoiding deletion of files arriving between separate read and clear transactions.

A disposable copied-source drill under ignored `temp/account-transition-drill` ran 11 tests green. Removing transition serialization and the transactional pending-work check produced exactly three intended failures: both new logins proceeded before old cleanup, and the concurrent save was erased. Restoring the copied files byte-for-byte returned all 11 tests to green. Production source was never mutated for the drill.

Idle synchronization continues checking the live session but no longer flips the sync status or refetches every workspace query when there are no operations. A dedicated browser regression checks that behavior; pending replay and periodic recovery remain covered. Full integrated quality, final device journeys, SAST, and performance certification remain the parent agent's release gates.

The final locked-transition audit found that an unknown local owner previously skipped client request binding. Private organization, personal-account, and administrator APIs now refuse to start without a bound owner. Better Auth organization/administrator/account actions do the same; session discovery, sign-in, registration, and callbacks remain available to discover identity. An explicitly supplied account header must match the captured owner, rather than being silently replaced. Same-origin target validation and normalized path matching prevent endpoint aliases or external URLs from avoiding the intended boundary. Public identity/configuration requests remove stale caller account headers.

Fifty-seven focused API, Better Auth, boot, and app-page tests passed, plus 21 locale/recent-data checks. The locale API fixture now supplies a legitimate owner and independently asserts a real ZodError for an invalid server locale, avoiding a vacuous failure from missing authentication context. A copied-source request drill passed all 33 ownership tests, then restored the old null-owner bypass: ten expected private-request cases failed before their no-transport assertion. Restoring the copied modules byte-for-byte returned 33/33 to green. Public invite admission and delayed account-locale persistence are separately hardened by the private-account agent. Full UI/real-HTTP delayed logout timing remains a release proof obligation on the next integrated artifact.
