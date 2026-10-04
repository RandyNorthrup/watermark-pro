# Screenshot credential fixture reassessment — 2026-10-04

Protected main `3e7991a60a6b4e4b837aa5384c6f31f8f46d1888` release run
`37198244522` retains four failed original screenshot jobs:

| Profile          | Job          | Observed boundary                                                       |
| ---------------- | ------------ | ----------------------------------------------------------------------- |
| Desktop          | 111428786908 | Editor URL wait after workspace creation, `scripts/screenshots.mjs:468` |
| iPhone (`phone`) | 111428787077 | Same boundary                                                           |
| iPad (`tablet`)  | 111428787052 | Same boundary                                                           |
| Android          | 111428787173 | Same boundary                                                           |

Every log contains the existing `waitForURL` 30,000 ms timeout at that callsite.
No signup fixture failure is recorded. The logs contain no organization-creation
HTTP status or recent-authentication error code, so an observed HTTP 403 is not
claimed. Raw logs remain private; no identity-bearing URL or response body is
included here. Changing commits does not erase this release failure history.

## Contract review and coherent correction

The screenshot flow verifies email and calls `prepareReturningUser`, which only
claims guidance topics. It then creates a workspace without presenting the
password. Verification intentionally creates no credential proof.
`invitationAdmission` invokes the existing recent-authentication middleware,
which requires proof for organization mutations. The successful E2E experienced
user helper already presents the password after verification.

The one existing screenshot code path now binds its synthetic password once,
uses it for signup, and presents the same email/password through real sign-in
before guidance/reload. The existing `fixtureJson` refuses a failed sign-in using
only its finite HTTP status. No helper, session shortcut, proof injection,
production guard, deadline or capture fallback is added.

## Executed source checks

Scoped Prettier and ESLint pass. Fresh `npm run typecheck` returns 0. The existing
`unit-worker` recent-authentication suite passes all 48 cases, including real
verification-only organization refusal, incorrect-password refusal without
proof mutation, and successful organization creation after correct sign-in.
Existing expired/malformed/future-proof and role controls remain. This focused
proof uses actual Better Auth; it does not change or replace the guards.

The Admin canonical fixture and its actual five-trace proof remain unchanged.
This screenshot source check does not claim complete quality/SAST or actual
four-profile capture success.

## Actual built SDK refusal and credential retry

The first private SDK probe returns terminal 1 after verifying an unproved
session, organization creation 403 with the known recent-authentication code and
unchanged organization list, followed by password sign-in 200 and a rotated
same-account session with proof. Its final creation returns 400; the response
code was not retained, so it remains unknown. Interface reassessment finds the
probe's `screenshot-sdk-` plus UUID slug is 51 characters, exceeding the shared
48-character limit. This is a probe-input error, not a product change or an
observed server error-code claim. All five captured owned processes and its
fresh gate close; the failure is preserved.

One reviewed rerun uses a valid UUID slug on another fresh port-zero SDK gate,
with finite body-code classification saved before assertions. It returns 0:
verification-only session creation is refused with HTTP 403 and the known
`RECENT_AUTHENTICATION_REQUIRED` code, while the organization list stays exact.
Correct password sign-in returns 200 for the same verified account with a new
session and credential proof. Organization creation then returns 200, increasing
the list by exactly one matching workspace. No mock, role shortcut, proof
injection or deadline change is used. All four captured owned processes/group
are gone; the gate directory is absent and its storage parent is empty.

Screenshot source remains exactly
`f3a770caaa2c5af272da2d69ecf174cbcfcaa6f172ef9fdd3ebb1b5511d9c4d8`.
The actual four-profile capture matrix still awaits the final combined artifact;
this API proof is not screenshot success. The prepared original command is
`APP_URL=<owned-loopback-origin> npm run audit:screenshots -- m19-video-capacity-ui-2026-10-04 all`,
using the existing driver, axe/reflow checks and complete inventory requirement.
Do not run it against the stale video-less artifact or repeat unchanged failures.
Final combined quality/SAST, full UI/release certification and M19 remain open.
