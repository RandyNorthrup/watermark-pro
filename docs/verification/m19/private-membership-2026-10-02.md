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
  deadline. The failed batch was 7/8. An isolated iPad recheck also timed out,
  this time before the Members dialog opened; it is a failure, not a pass.
  The commit's independent publication scanner was concurrently using about
  seven CPU cores during that recheck. That observed contention is recorded
  without claiming it is the only cause. Browser deadlines remain unchanged.
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
- Source `08834dff577e336f505016850a229cbf2549fd20` adds the separate quota
  journey and result documentation. Commit hooks passed formatting, lint and
  publication scanning. The expanded canonical workflow completed successfully as
  [36992631513](https://github.com/RandyNorthrup/watermark-pro/actions/runs/36992631513);
  all seven exact-source gates passed. Canonical quality passed 2,841 covered
  tests, unchanged global floors (92.50 statements, 85.35 branches, 92.33
  functions, 93.44 lines), 68 workerd tests, all script/publication/audit gates
  and production build. SAST passed 510 rules on 2,141 files with zero findings.
  All 140 expanded Playwright/axe cases ultimately passed: desktop, Android and
  iPad passed 35 each on their first attempts; iPhone passed 34 immediately and
  its gallery save/search/download/delete case passed on the existing retry.
  That unrelated gallery case remains recorded as flaky. Private isolation and
  quota/refusal/revocation/replacement passed on all four devices. Local iPad
  failures above remain failures and are not relabeled as passes.

The parent human-control runtime passed all seven checks and 136 browser
journeys; those results do not certify these later membership changes. Detailed
local logs stay outside publication artifacts. No credentials, auth links or
real customer content appear in this receipt.

## Planning status

The private-membership slice's source, binding, browser and viewed-capture gates
are complete for `08834df`. M19 remains open. Next implement recent authentication,
plan quotas and billing state,
then verified Stripe Checkout/portal/webhooks and public marketing/navigation.
Stripe browser authentication is unconfirmed; no product, price, endpoint or
charge has been created. Existing video export/offline regressions and complete
Lighthouse/screenshot release gates still block production deployment.

## New-main restack preparation — 2026-10-03

This candidate replays only the original PR #13 delta, from human-control base
`ff842aa` to `3521ffd`, above protected main `0b0c9c2`. The original four commits
(`7fc4e4b`, `e83ae04`, `08834df`, `3521ffd`) and later stack references remain
preserved. The owned branch is `codex/restack-private-admissions`; no original
branch is rewritten. Thirty-six of 39 preimages match exactly. Only additive
PLAN/CHANGELOG conflicts require resolution; the package's existing bootstrap
command gains the membership migration test without changing new-main pins,
Node policy, install hooks or other scripts. All five other dependency/scanner
gate files remain byte-identical to main. Human verification's source remains
preserved, with only the original admission-cohort integration applied to its
existing auth/session boundaries.

Original branch workflow metadata retains failure `36986924310` on `7fc4e4b`,
then successful runs `36989072536`, `36992631513` and `36997351106` on `e83ae04`,
`08834df` and `3521ffd`. Each is attempt 1. This lineage contains one failed CI
run, not three; the local fixture/formatting, browser timeout and interrupted
quality history above also remains intact. Historical green runs do not prove
this restacked source, and no failure count is reset by the new branch.

The initial source preparation performed no install, tests, build, browser
verification, push or CI. A source-only call through the prior isolated checkout's formatter
stopped because this new checkout has no local `prettier-plugin-tailwindcss`.
No formatter pass or substituted module tree is claimed; normal candidate
installation must precede its own formatting/lint/type gates.
The next slice, after Root review and native-lane release, is a fresh
normal installation followed by complete existing real-auth test files covering
public cohort refusal for owner/admin/editor/viewer/non-member, anonymous
refusal, pending/unknown cohort gates, forged cohort fields, revoked-during-create
admission, accepted lifetime spend and preserved explicit workspace access.
Existing owner-bootstrap, social admission, site-role, workspace-access and
human-verification tests must run alongside the account/referral/private tests;
neither auth nor the D1 store is replaced by a simulated quota model.

Actual workerd/D1 tests must prove competing email/link reservations share two
slots, replay and recipient deletion cannot refund accepted spend, unused
expiry/revoke/rotation release capacity, and public/already-admitted actors
remain refused. The existing account wiring and human-admission integration
files retain binding and auth regression proof. `npm run test:bootstrap` then
uses the existing real SQLite/complete-migration fixtures to check historical
identity, content and workspace grants, stable oldest-two pending cutover,
pending defaults and unverified anchored-owner bootstrap. New exact-head
canonical quality, SAST and four-device private-isolation/quota browser proof
with axe and viewed captures remain required before protected merge. M19 stays
open; live provider proof and guarded production release remain separate gates.

## Current restack verification and protected account fields — 2026-10-03

Fresh normal installation in the owned candidate completes with zero
vulnerabilities. Its existing format, full lint and type gates pass. Ten complete
real-auth/client files pass 165 cases; four actual workerd/D1 files pass 13 cases;
the existing real SQLite/bootstrap suite passes 32 cases. Those checks cover
admission capacity, role/cohort separation and cutover, not every administrative
mutation seam.

Independent interface review identified a further administrative boundary for
server-owned account state. The original schema's self-service input restriction
does not replace the administrative guard. Four focused real-auth cases ran
against stock source: the anchored owner case passed, while three cases failed
their stored-state assertions; thirteen unrelated cases were filtered from that
intentional negative run. No timeout or simulated-auth result was used as proof.
Detailed unremediated evidence remains private.

The coherent correction reuses the existing account-field authority and the
previously prepared integration guard. Generic administrative edits and account
creation refuse protected identity, membership, credential and moderation
fields. Ordinary profile edits and the established role/moderation flows remain
supported. Two existing source/test files change; no dependency, abstraction,
deadline, rule, coverage floor or quota changes.

After the correction, scoped lint and a fresh forced full solution type build
pass. Four complete real-auth files pass all 101 cases with no skips or timeouts:
17 administrator, 51 site-role, 11 private-membership and 22 human-verification
cases. Stored-state assertions and normal-operation positive controls both pass.
These results certify the narrow guard boundary, not the entire revised restack.
Full canonical quality, SAST, actual binding/browser proof and fresh viewed
captures remain required. No commit, push, CI retry, production migration or
deployment follows from these scoped checks. M19 and the full delivery scope
remain open; next freeze the expanded source and execute its required gates.

## Complete local gates on the corrected candidate — 2026-10-03

The revised 41-path source was frozen before one unchanged `npm run quality`
invocation on Node 24.18.0/npm 11.16.0, with the existing Python 3.13.7 libexec
directory included only in command PATH. The command terminates 0. All 2,847
covered cases across 257 files pass, with 92.50% statements, 85.35% branches,
92.33% functions and 93.44% lines. All unchanged coverage floors remain green.
Actual workerd integration passes 68 cases across 19 files, including the
membership/account/migration/human boundaries. Every static gate and full audit
passes; audit reports zero vulnerabilities.

The remaining existing suites pass 32 bootstrap/migration, 15 gate, 36
performance, 25 publication and four CI-policy tests, plus Python asset suites
of five and 19 tests. Production build passes all 42 artifact controls. Source
publication passes 15,637 checks with 13,370 scanner copies, 554,491,383 raw
bytes, 261,279,853 unique bytes and 331 archive entries. The unchanged historical
treatment remains five revoked-key masks and one exact accepted finding; no
configured private values are compared. Built publication passes 2,637 checks
with 5,270 copies, 50,417,875 raw bytes, 50,400,511 unique bytes and 114 archive
entries, without historical masks or accepted findings. No budget, source
history, deadline, assertion, device, rule or coverage floor was weakened.

Only after quality terminated 0, pinned Semgrep 1.174.0 ran the existing SAST
command. It terminates 0: 510 rules, 2,143 git-tracked targets, zero findings.
Thirteen files larger than 1 MB are skipped; this is the configured tracked-
source scan, not an exhaustive security claim. All 325 captured process
identities/groups are gone, six browser profiles are absent, port 5273 is free
and candidate gate storage is empty. All 41 source hashes remain unchanged
through both commands; only subsequent factual documentation is updated.

These completed local gates do not relabel the original failed CI/local runs,
the initial absent-plugin formatting attempt or the uncorrected administrative
mutation negatives. Root must review the final source/receipt before normal
hooks and replacement draft publication. New exact-head hosted canonical/SAST
and full four-device/aggregate checks, plus fresh private-isolation/quota axe
proof and viewed captures, still precede protected merge. Original/later stack
references remain preserved. No remote migration, live provider verification,
production activation or full M19 certification is claimed; feature expansion
remains held.
