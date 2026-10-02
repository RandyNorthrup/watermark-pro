# Private membership and two-new-admission controls — 2026-10-02

Candidate branch: `codex/private-admissions`, stacked on draft PR #12's verified
human controls and result documentation. This receipt covers admission boundaries
and invitation budgets; public Free/paid registration, billing, recent
authentication and private-member navigation are still separate unfinished work.
No deployment, remote migration or full M19 certification is claimed.

## Implemented behavior

Existing accounts migrate to private membership without changing identity,
verification, site roles, content or workspace grants. New rows default to
pending; trusted admission activates their cohort. Private signup consumes its
email-bound invitation and grants the exact site role/cohort in one D1 batch.
Revocation during creation leaves the account pending. Email verification alone
cannot activate it or expose custom/privileged auth-plugin workspace APIs.
Client signup/profile fields cannot select private membership. The existing
console-mailbox/test-only uninvited admission creates private fixtures; public
production registration remains closed.

Public accounts cannot list, issue, revoke or rotate private offers, regardless
of workspace role. Existing explicit workspace rights remain independent. D1
also checks inviter cohort, verification and bans before reserving/admitting.
Payment is not a membership, role or workspace grant.

Two new successful private admissions are shared by email and reusable-link
offers. Active pending offers reserve slots; revocation/expiry releases unused
slots. Accepted spend survives recipient deletion, expiry and link changes.
Rotation/revocation also revokes that link's unused reservations. Independent
mail/link rate budgets continue to limit issue/revoke loops. An own-account
budget returns used/reserved/available counts; exhausted capacity returns a
distinct conflict without a misleading retry-after timer.

Migration `0018_private-membership.sql` marks historical spend as version 0.
It preserves up to two oldest live pending offers per issuer (creation time,
then ID), and revokes excess pending promises. Those excess offers need
reissuing after a slot becomes available. The migration does not revoke admitted
membership or delete content. Review this cutover before eventual gated release.
Fresh-owner bootstrap explicitly initializes private membership while keeping
email unverified; it requires the current migrated schema.

## Executed evidence and remaining checks

- Initial six-file real-auth/schema suite: 72 passed.
- New real-auth cohort/race/lifetime cases: ten passed before the final budget
  and unknown-cohort assertions were added. Final seven-file batch: 82 passed
  before that final assertion extension; no final covered total is claimed yet.
- Real workerd/D1 focused batch: ten passed across existing account wiring and
  four new concurrent/shared-budget, replay/deletion, expiry/revocation/rotation
  and public/existing-recipient cases.
- Real legacy SQLite migration: two passed; identities, workspace grants,
  historical spend, stable pending selection and pending default were checked.
- Type checking caught a missing new-code mapping in the named fake API and an
  unproven array index in a test; both were corrected without a suppression.
- The first canonical quality attempt stopped at Worker-test formatting after
  ESLint's earlier fix. Formatting and a subsequent lint diagnostic were
  corrected without changing the gates.
- Hosted run `36986924310` passed exact-source SAST but stopped quality at one
  real-auth owner-bootstrap fixture: it lacked the private cohort initialized by
  the already-tested operator SQL. Other covered tests passed (2,840/2,841) and
  all global floors passed (92.49 statements, 85.34 branches, 92.33 functions,
  93.44 lines). The browser matrix correctly stayed blocked. The fixture now
  matches production bootstrap; a fresh complete run is required. The duplicate
  local canonical run had cleared all source gates and publication/audit, then
  was explicitly interrupted during covered tests after the same hosted failure
  was identified. Its exit 130 is not a local full-quality pass. Initial-owner
  SQLite/migration regression now passes all seven cases; its earlier member
  fixture schema edit was corrected without changing application permissions.
- Initial local four-device browser run failed at existing 60-second journey
  deadlines; desktop reached and captured the actual quota refusal. Those are
  failures, not browser passes. Quota/refusal/revocation now has its own real
  journey, preserving all existing isolation assertions and deadlines. The full
  matrix now has 35 journeys per device (140 total), pending hosted execution.
- The invitation browser journey now exercises two child reservations, a third
  refusal, the actual budget response, revocation and a successful replacement.
  The separate local journey passed with axe on desktop Chrome, iPhone, iPad
  and Android. All four quota-error screenshots were opened and reviewed; the
  message wraps legibly and the revoke controls remain available. The existing
  isolation journey passed on three devices; its local iPad run reached the
  final administration-denial screen but exceeded the unchanged 60-second
  deadline. An isolated iPad recheck is pending; the failed batch was 7/8.
- [Hosted run 36989072536](https://github.com/RandyNorthrup/watermark-pro/actions/runs/36989072536)
  completed all seven gates for exact source `e83ae047e972f6de9b248d432b47837b11dec189`.
  Canonical quality passed 2,841 covered tests and all existing global floors
  (92.49 statements, 85.34 branches, 92.33 functions, 93.44 lines), 68 workerd
  tests, script checks, publication/audit and production build. Exact-source
  SAST ran 510 rules on 2,141 files with zero findings. All 136 existing browser
  journeys ultimately passed with axe: iPhone/Android passed 34 each on their
  first attempts; desktop sharing and iPad private isolation passed on the
  workflow's existing retry. Those two cases are recorded as flaky, not as
  first-attempt passes. This run predates the new separate quota journey.
- Local exact-source SAST also passed 510 rules on 2,141 targets with zero
  findings. Focused owner/cohort rechecks passed 12 cases after the final
  unknown-cohort/child-budget assertions. A duplicate local canonical process
  was interrupted at exit 130 after the hosted quality pass was confirmed;
  no local full-quality pass is claimed.

The parent human-control runtime passed all seven checks and 136 browser
journeys; those results do not certify these later membership changes. Detailed
local logs stay outside publication artifacts. No credentials, auth links or
real customer content appear in this receipt.

## Planning status

M19 remains open. Finish the expanded matrix's complete gates and record the
isolated iPad recheck. Next implement recent authentication, plan quotas and billing state,
then verified Stripe Checkout/portal/webhooks and public marketing/navigation.
Stripe browser authentication is unconfirmed; no product, price, endpoint or
charge has been created. Existing video export/offline regressions and complete
Lighthouse/screenshot release gates still block production deployment.
