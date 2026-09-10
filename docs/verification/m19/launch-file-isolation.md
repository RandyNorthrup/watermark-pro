# Installed-app launch-file isolation

Focused verification recorded on 2026-09-10 (UTC). This closes a local
asynchronous file-admission defect; it does not certify the production release
or the operating system's installed-PWA integration.

## Defect and boundary

The previous `main.tsx` consumer awaited `FileSystemFileHandle.getFile()` before
writing an unowned module buffer. Account cleanup could run while that read was
pending. Its later completion could then replace a new account's pending files.
An explicit lock with no current account also left launch files intact.

An isolated regression used the original consumer's asynchronous seam, the real
launch buffer, and the real account-transition functions. It produced both
expected failures: an old-account file replaced a new-account file, and a
cancelled unowned launch survived a null-account relock. A positive control
confirmed that a fresh launch survived initial authenticated activation.

The existing launch buffer now holds one lease. Intake captures the existing
nullable account generation and owner before reading any handles. Publication,
navigation, consumption, and late failures check that lease. A newer launch
supersedes older reads, and stale completion cannot erase or replace its files.
Empty launch events do not replace a pending launch.

Explicit account locking clears both ready files and pending reads, including
null-to-null locks. Only the existing account activation boundary retains a
current unowned launch across its own initial reset and successful admission.
The retained callback cannot revive a cleared lease or replace a newer one.
Storage admission still checks the account-transition generation. The reset
returns the generation it issued, so a synchronous relock from an observer is
not mistaken for the original transition.

Editor and bulk destinations consume only batches addressed to their route and
subscribe for later launches while already mounted. Subscriptions capture their
owner, preventing a departing component from draining another account's batch.
The bulk Android share-target inbox keeps its existing transactional, account
bound consumption. Editor image-size and metadata completion additionally checks
the captured account, latest photo request, and component lifetime before
adopting a photo. Closing the editor or choosing another photo invalidates older
reads. The former mount-only launch-effect lint suppression was removed.

## Executed checks

The focused canonical command passed **70 tests in four files**:

```powershell
npx vitest run --project unit-client src/client/lib/launch-files.test.ts src/client/routes/app/editor-page.test.tsx src/client/routes/app/bulk-page.test.tsx src/client/lib/bootstrap-request.test.ts
```

Coverage of behavior includes:

- Twenty-five launch tests: target selection, consume-once behavior, newest-event
  ordering, empty events, subscriber disposal, stale subscribers, known-account
  switches, same-account validation, completed and pending initial launches,
  explicit null relocks, identity round trips, interrupted admission, new files
  during admission, synchronous observer relocks, and safe read/navigation errors.
- Authenticated route workflows that adopt initial and later editor/bulk files,
  preserve files addressed to the other route, and reject stale editor metadata
  after account change, unmount, or a newer selection.
- Existing bootstrap admission regressions and editor/bulk workflows.

`npm run typecheck` ran the actual solution build (`tsc -b`) and passed. Scoped
ESLint and Prettier checks passed. `npm run lint:dup` found zero clones.

Two disposable Vite transforms then removed one boundary check each without
changing canonical source files:

1. Removing the post-handle account fence caused the delayed old-account launch
   test to fail because stale navigation occurred.
2. Removing the editor metadata fence caused the account-switch test to fail
   because the old file reached the preview renderer.

Both drills exited 1 with the intended assertion. Running the same configuration
without mutations then passed all **42 launch/editor tests**. SHA-256 comparison
confirmed canonical runtime sources were unchanged by the drills. Private local
logs and the machine-readable receipt remain under ignored `temp/lumafoil-launch-*`.

## Remaining verification

The integration owner must run the aggregate quality, security, build, and
browser gates against the completed source. No browser server, production
deployment, remote data mutation, or installed-operating-system launch was used
for this focused proof. At handoff the shared local browser gate was unavailable
after a Wrangler proxy failure; these unit workflows do not replace its eventual
browser and accessibility checks.
