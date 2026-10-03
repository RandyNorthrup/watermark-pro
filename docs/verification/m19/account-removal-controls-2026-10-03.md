# Self-service account removal controls — 2026-10-03

Status: candidate UI and device behavior verified in isolation; actual built UI,
combined backend cleanup and full milestone gates remain pending.

## Implemented contract

Account settings offers self removal to ordinary users and administrators; the
immutable site owner sees protection text. The confirmation requires the exact
rendered account email. This is deliberate confirmation, not authorization:
existing account-bound headers, session identity, origin, recent credential proof
and backend owner/admission/ban checks remain authoritative.

The dialog states subscription closure before removal, personal-link revocation,
queued physical file cleanup, preserved collaborative/payment/security records,
and discarded unsynced saves on this device. All twelve catalogues also warn that
some personal content or links may already be removed when confirmation fails.
This describes the actual staging/lost-ack boundary rather than implying a
complete rollback. It does not claim destruction of downloaded files, other
devices, provider history or all security/audit records.

Only a successful Better Auth response with its protocol `User deleted` message
starts account-scoped device cleanup. Failed, stale-account and unconfirmed
requests leave device data intact and display the error. Pending actions cannot
be submitted twice or dismissed as completed. The existing sign-out path keeps
its concurrent-pending-save preservation policy. Confirmed account deletion uses
an explicit erase-all policy to remove only that account's records/outbox; another
account's records and pending work remain. Confirmed server deletion returns to
login even when device cleanup fails. A generic root notice stays mounted and
retries only captured-account device erasure; it never repeats the deletion API.
The transient acknowledgement survives private-route locking, but not a page
reload. Browser storage failure is not a promise of completed physical erasure.

## Actual evidence

- Initial full types passed. First unit invocation mistakenly selected nonexistent
  project `client`, so it executed no tests. Correct `unit-client` invocation
  passed the original ten component cases. Ordinary naming/order/style lint
  errors were corrected without suppressions.
- Expanded source passed 38 cases across three complete unit files: thirteen new
  removal cases, twenty-one installed-client account-boundary cases and four
  recent-authentication UI cases. No skips or filtering within those files.
- The actual Chromium IndexedDB suite passed all twelve existing/new cases, zero
  skips. The new case includes owned pending work/cache plus another account's
  real stored record/outbox; removal erases only the target account.
- Removing only the new erase branch reproduced eleven passing cases and the
  single expected pending-erasure failure, with no skips. Exact source bytes were
  restored and hash-checked before releasing the native lane. This negative
  control proves that the new assertion distinguishes the original behavior.
- Scoped lint and catalogue parity passed. Further full-source types/quality/SAST,
  fresh built desktop/Arabic-phone axe/images and real combined deletion/API
  journeys remain pending. `e2e/account-removal.spec.ts` prepares the actual upload,
  public-share, confirmation/cancel, deletion, revoked-share and old-credential
  negative flow; it has not yet run.

## Source and next slice

No new backend route, table, job, framework or dependency. The compact personal
cleanup implementation remains a separate candidate under actual D1 review.
Do not certify these controls until its complete pool passes and the exact source
is integrated, followed by the built journey and visual review. Normal required
quality/E2E/SAST/release gates stay intact; public registration and production
billing remain closed and M19 stays open.

## Mounted failure correction

Independent review found that the first isolated component mock missed real
AppLayout unmount during account locking. Its device-cleanup error could become
invisible and retry would attempt deletion again. The real-router negative control
reproduced the missing notice; a transient entry in the existing offline-status
observable and a lazy root notice now preserve generic recovery after login.
No new state framework or backend was added. Final five-file Node pool passes all
43 cases, full types and scoped lint/format pass. Tests include the real router,
actual account lock/transition helper, deferred storage failure, single deletion
API call, pending/absent acknowledgement negatives, shared-inbox failure and
foreign-account denial. Actual built visual/API and full gates remain required.

## Built verification

The final built desktop/light and WebKit phone/Arabic/dark flows now pass actual
upload/public-sharing/deletion and descriptor-restored local-failure/retry, with
zero axe. Public privacy passes both projects, zero axe/overflow. The warning's
translucent phone surface was corrected, then both complete journeys reran green.
Six images were viewed and retained in `account-removal-rendered-2026-10-03/`.
Complete quality/SAST/four-device/release gates remain open.
