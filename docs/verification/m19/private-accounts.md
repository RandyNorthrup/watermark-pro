# Private admission, account isolation, and upload recovery

This is focused implementation evidence, not certification of the full release.
Fixtures use synthetic identities in disposable databases. Live account and
deployment identifiers, credentials, cookies, invitation URLs, and raw provider
responses do not belong in this public record.

## Implemented controls

- Targeted site invitations and reusable, revocable referral links admit private
  accounts. They never add the recipient to the inviter's workspace. Explicit
  workspace collaboration remains a separate action.
- Each account receives its own personal workspace; server permissions recheck
  membership before private reads/writes. Stale account-binding headers fail
  before mutations, including sign-out and account linking.
- Google and Microsoft identity sign-in carry server-owned invitation state.
  Existing identities sign in without another invitation. Unverified email
  requires Lumafoil verification; existing password accounts require explicit
  authenticated linking. Provider access/refresh tokens are encrypted and ID
  tokens are not persisted.
- One anchored site administrator can view aggregate account/invitation totals.
  Workspace owners are ordinary users. API and database guards refuse another
  administrator, owner demotion/removal, anchor changes, and administrative
  takeover through another user's email/password fields.
- Streamed request-body caps apply to Better Auth and every API route. Upload
  quotas reserve count and bytes atomically across photos, thumbnails and logos;
  committed metadata/audit and cleanup receipts survive network failures.
- Logger canaries prove that OAuth state/token/body extras and raw database
  parameters are not emitted by application failure logs.

## Executed focused checks

The following runs completed on 2026-09-09 against the shared working tree:

| Check                                                                                   | Result     |
| --------------------------------------------------------------------------------------- | ---------- |
| Photo/logo API routes plus real D1/R2 library and upload recovery                       | 37 passed  |
| Expanded D1 upload guards/recovery and singleton administrator                          | 18 passed  |
| Upload lifecycle failure/recovery unit tests                                            | 10 passed  |
| Real-auth administration, body-stream limits and auth logging                           | 27 passed  |
| Shared isolated test-owner bootstrap and request-log privacy                            | 9 passed   |
| Expanded auth/admission/admin/body/recovery suite, before inviter-ban additions         | 123 passed |
| Inviter eligibility, ban revocation, both OAuth callbacks and existing admission checks | 59 passed  |
| D1 private-account store with banned/deleted inviter and foreign-key checks             | 5 passed   |

A focused coverage run across the upload lifecycle, stream body limits, auth
logger and singleton-admin boundary passed the unchanged thresholds: 95.97%
statements, 92.38% branches, 100% functions and 98.46% lines. This is focused
coverage and does not replace the repository-wide coverage gate.

Legal routes and all locale catalogue checks passed 54 tests after the factual
policy update. Existing content-ownership and warranty clauses were preserved.
All twelve catalogues describe actual account/provider choices, private
workspaces, offline storage/reconnect limits, explicit cloud sharing, per-user
recent history, administrative visibility and artwork notices. Contact/provider
links are accessible anchors and the revision date is localized. The runbook was
checked against current local Wrangler help and primary Cloudflare recovery
documentation. The root operator enabled and verified GitHub private reporting.

Earlier focused admission tests covered targeted invitation consumption, sender
privacy, referral rotation/revocation and attribution, private provisioning,
unrelated-workspace reads, stale-cookie/account bindings, signup verification,
resend, and authenticated account linking. OAuth transport fixtures replace only
the vendor response: Better Auth's state, cookies, callback processing, hooks,
adapter writes and sessions are real. Token canaries assert absence of plaintext
provider tokens and persisted ID tokens.

The upload tests include simultaneous requests for the final photo/logo slot,
shared byte-budget contention, duplicate/conflicting operation identities,
metadata/audit rollback, R2 partial writes and lost acknowledgments, lost D1
commit acknowledgment, failed cleanup retaining quota, lease expiry, deleted
upload replay, legacy records without receipts, logo-reference races and
cross-workspace rejection, and organization deletion with content/cleanup.

An admission red drill temporarily disabled the invitation requirement in the
test fixture. All three rejection assertions failed as intended. The fixture
was restored byte-for-byte before the focused server suite returned green.

Actual Google and Microsoft invited signup and returning sign-in were exercised
on the local preview. Microsoft required Lumafoil email verification before its
session became usable. The earlier delayed Google consent failure was traced to
the old five-minute signed state cookie; the new ten-minute cookie is asserted
by the real-auth callback tests. Those local checks do not certify hosted OAuth.

## Remaining release gates

The root delivery task must run the complete quality/coverage, SAST, four-device
Playwright/axe, screenshots, Lighthouse, deployment and hosted email/OAuth gates
after all parallel changes settle. Gate databases must be isolated from manual
QA and use the single synthetic owner helper in
`scripts/lib/test-site-owner.ts`; each tool authenticates its own session.

Production migration, private initial-workspace splitting, provider secret
installation, hosted account tests, and domain cutover remain explicit operator
steps. The account implementation task has not mutated production. Follow
`docs/private-accounts.md` and `docs/self-hosting.md`, with backups and private
operator identifiers, before applying the guarded changes.
