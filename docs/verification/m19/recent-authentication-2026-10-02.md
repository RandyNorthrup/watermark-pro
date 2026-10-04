# Recent credential proof — 2026-10-02

Candidate branch: `codex/recent-authentication`, stacked on the verified private
membership slice. This receipt records implementation and ongoing verification;
it does not certify M19, deploy a Worker or apply a remote migration.

## Control

Migration `0019_recent-authentication.sql` adds nullable `credential_verified_at`
to the server session. Historical sessions receive no proof. The Better Auth
field has `input: false`; its session-creation hook assigns a date only after
successful password sign-in or validated identity sign-in whose callback carries
server-controlled sign-in state. Linking, challenge completion, verification,
renewal, profile/session fields and payment cannot establish or extend proof.

Custom invitation/referral, membership/access/share, destructive workspace,
administrative and reserved billing mutations reject proof outside the preceding
ten minutes, including future/malformed/missing dates. Cloud credential and
connection operations use the same boundary. Account-security, organization and
administrative plugin mutation seams also enforce it. Proof does not replace
verified-email, cohort, site/workspace role or account-generation checks.
Ordinary authorized reads, local editing, saves and personal bootstrap remain
available. Same-account sign-in preserves a selected workspace only after a
current membership lookup; revoked access or a different account cannot inherit it.

The two browser transports offer a lazy-loaded, account-bound prompt in twelve
locales. Dismissal and successful sign-in never replay the denied mutation.
Only a bounded internal route is retained. The current page is reopened after
sign-in, following the existing session-only media-project lifecycle.

## Executed evidence

- Initial focused real-auth/server batch: 76/77. A manually verified private
  recipient fixture expected an invitation mutation without presenting its
  credentials. Corrected the fixture with actual password sign-in while retaining
  verification-only denial controls. Expanded focused batch: 84 passed before
  the workspace-carryover and client-dialog additions.
- Client prompt/transport batch: 41/44. The dialog existed with its real sentence-
  case accessible name; three new assertions incorrectly expected title case.
  Corrected the test names, retaining the actual dialog, bounded URL, dismissal,
  account-switch and no-retry assertions.
- The subsequent combined client/server batch passed 129/130. Its renewal fixture
  changed only `updatedAt`, but the pinned Better Auth version renews based on
  `expiresAt - expiresIn + updateAge`. The assertion correctly revealed that no
  renewal occurred. The fixture now crosses that real boundary and requires
  `updatedAt` to advance while credential proof remains expired. Verification-
  link replay is a separate negative control.
- The full Node Worker attempt completed naturally before a requested stop:
  489/507 passed across 47 files, with 18 failures. It exposed additional
  established-user fixtures that verified email without password sign-in;
  their real credential flows were corrected. Deadline failures also occurred
  while the separate publication scanner used roughly five to seven CPU cores;
  no sole-cause claim or deadline relaxation is made. One expired-link assertion
  changed `Date.now` but did not restore it after failure, cascading into the
  following fixture. Cleanup now always restores that clock. The proof hook
  reads the same server clock as expiry checks, and the expired-link test
  explicitly signs in at the advanced clock before testing link expiry.
- Earlier type checking passed before the dialog/carryover additions. A later
  check found a newly moved fixture date outside its scope; it was corrected.
  Earlier lint diagnostics were corrected without suppressions. At that point no
  final complete type/lint/quality/SAST/browser/D1 pass had been executed; the
  subsequent results below supersede that intermediate status.
- Corrected focused transport/dialog, return-schema, credential, provider,
  membership and invitation fixtures passed all 175 cases in eleven files.
  The subsequent complete type check passed. The real workerd/D1 credential
  migration and custom/plugin refusal/re-sign-in case passed. These do not
  replace canonical quality, final SAST or the full device matrix; the new
  production-built four-device re-sign-in journey initially passed desktop and
  iPhone, with two failures. iPad applied the explicitly retried invitation
  (HTTP 201) before reaching the unchanged sixty-second journey deadline during
  its final accessibility audit. Android timed out waiting for the rendered
  invitation link; its referral request returned HTTP 200, but response status
  alone does not prove successful query rendering. No deadline or assertion was
  relaxed. The screenshots revealed underlying mobile text visible through the
  translucent credential dialog. Its surface is now opaque, and the visual
  receipt captures the dialog viewport instead of the unrelated full page.
  The fresh run passed all four devices without an additional browser alongside
  the timed journeys: desktop 29.2 seconds, iPhone 35.7, iPad 44.1 and Android
  35.3. Every journey retains verification-only refusal, actual password sign-in,
  bounded return, no automatic invitation replay, explicit successful retry and
  both axe audits. All four actual viewport captures were opened and reviewed;
  their opaque dialog remains readable and contained within each viewport. The
  captures are retained in `recent-authentication-2026-10-02/`. This focused
  result does not certify the complete 144-journey matrix.
- The parent private-membership documentation head `3521ffd` also passed all
  seven jobs in the manually dispatched exact-commit CI run
  [36997351106](https://github.com/RandyNorthrup/watermark-pro/actions/runs/36997351106).
  The stacked pull-request summary does not report those manual checks; this
  evidence is an exact-commit workflow result, not a claim that the main-branch
  required pull-request checks or M19 release audits passed.
- The first final canonical quality attempt passed formatting but failed lint:
  a client condition needed its simple owner guard first, and the SDK's generic
  middleware context exposes its HTTP method with an unsafe library type. The
  condition is reordered without changing its outcome, and the method is now
  narrowed from `unknown` before read classification. A missing or malformed
  method cannot receive a read exemption. No rule or coverage floor was disabled.
- The corrected canonical `npm run quality` completed successfully: 2,903
  covered cases across 260 files; 92.53% statements, 85.41% branches, 92.36%
  functions and 93.48% lines; 69 real workerd cases across 20 files. Bootstrap,
  transport, performance-gate, publication, asset and CI-policy tests passed,
  followed by production build, built-output verification, bundle budgets and
  publication scan. The app shell measured 138.0 kB gzip against the unchanged
  140.0 kB limit. This performance-gate test suite is not the actual Lighthouse
  or screenshot release audit.
- Review after that completed gate found the full-page sign-in prompt did not
  explain how to protect unfinished edits before its navigation. Its twelve
  catalogue messages now ask users to save or export first; the existing real
  prompt assertions also require that guidance. This final wording postdates
  the complete local quality run. The final wording passed all four focused
  prompt tests and the 1,217-key twelve-locale catalogue check. Its fresh built
  browser journey passed all four devices in 3.4 minutes: desktop 25.6 seconds,
  iPhone 36.1, iPad 34.6 and Android 26.8, retaining both axe audits and the
  no-automatic-replay negative. All four final-wording viewport captures were
  opened and reviewed, then replaced the earlier receipt images. Text and both
  controls remain readable and contained. Exact-commit hosted canonical quality
  remains required for the final wording. No project persistence or automatic
  action replay was added.

- Final `npm run security:sast` passed: 510 executed rules across 2,152 targets,
  zero findings. The standard scan excluded fifteen files larger than its
  one-megabyte limit; no new exception or rule suppression was introduced.
- Historical checkpoint, 2026-10-02: runtime head
  `77f6a9a6c4965cee59fd6d8ce5c44e173a5471d3` passed every job in
  [exact-commit CI 37009328785](https://github.com/RandyNorthrup/watermark-pro/actions/runs/37009328785).
  Hosted canonical quality covered the final twelve-locale warning: 2,903 cases
  across 260 files; 92.55% statements, 85.43% branches, 92.36% functions and
  93.48% lines; 69 workerd cases across 20 files. Hosted SAST passed 510 rules
  over 2,152 targets with zero findings. All 144 Playwright/axe journeys
  ultimately passed. iPhone and iPad each passed 36 first attempts; Android
  passed 34 first attempts plus existing retries for licensed QR/sticker reuse
  and offline saves; desktop passed 35 first attempts plus an existing retry
  for owner collaboration onboarding. The new recent-credential journeys and
  private cohort controls passed first attempts. No retry/deadline or floor was
  changed. All seven exact-commit check runs were read back successful.
  Draft [PR #14](https://github.com/RandyNorthrup/watermark-pro/pull/14) is stacked
  on private admissions; manual dispatch does not populate the main-only
  required pull-request summary. No main merge, remote migration or deployment
  occurred at that checkpoint. The later protected recent-auth restack is already
  included in main `8354602`; this capacity preparation does not change its code
  or reuse original-source CI as a fresh restack certificate.

## Remaining gates and next slice

Implementation certification passed for runtime `77f6a9a`. Public quotas,
authoritative billing state, Stripe
Checkout/webhooks, public marketing/private navigation and full M19 release
audits remain subsequent slices. Production registration remains closed.

## New-main restack preparation — 2026-10-03

This source-only candidate replays the original PR #14 commit `77f6a9a` above
protected main `10aae802`, whose private-policy replacement PR #21 passed its
seven required checks and fresh policy verification before merge. The original
base is `3521ffd`; the existing delta contains 55 paths, including four retained
historical PNGs. Fifty-two preimages match exactly. Only CHANGELOG conflicts;
its histories are combined additively. PLAN/SECURITY merge their original
amendment while preserving main's newer facts. No original or later stack
reference is rewritten. The owned branch is `codex/restack-recent-authentication`.

Private cohort, lifetime two-admission accounting and its meaningful refusals
remain intact. The eight-field administrative guard/source test pair, all six
main dependency/scanner files and existing human controls outside the original
delta remain byte-identical. The original integration adds recent proof to the
same auth/session boundary; it does not replace role, cohort, email, ban or
account-binding checks. Existing fixture helpers perform actual password sign-in
after verification; the dedicated verification-only negative remains separate.

Original branch workflow metadata contains successful run `37009328785`, attempt
1, on exact `77f6a9a`. No failed CI runs appear in that original branch metadata;
the failed local fixture, renewal-clock, full Worker, lint and timed browser
attempts above remain preserved. This does not reset any failure count or turn
historical gates into certification of the restack. The four retained PNGs show
the old tested source; new prompt/UI evidence remains required.

No modules have been installed and no candidate tests, build, browser, push or CI
have run. Formatting and executable gates await a fresh normal candidate install
after Root review. The next scoped proof must use complete existing real-auth
files for verification-only denial, future/malformed/expired proof, true renewal
without refreshing proof, actual password/provider sign-in, same-account
workspace preservation, revoked membership and different-account refusal, plus
owner/admin/editor/viewer/non-member/anonymous boundaries. Include the existing
protected-administrator, cohort and human guards so helper changes cannot hide
their refusals. Account-bound API/auth transports, bounded internal return,
dismissal, old-account prompt and no-automatic-replay client tests remain required.

The existing actual workerd/D1 credential test must prove stored Date semantics,
both custom/plugin expiry refusals, unaffected reads and real re-sign-in before
explicit retry. Existing human/account/membership D1 tests must run alongside it
on the unchanged migrated bindings; no model or forged successful response may
replace those calls. After scoped review, canonical quality, pinned SAST, the
complete four-device/aggregate matrix and fresh credential/private-policy axe
journeys with viewed captures remain necessary before protected merge. The
existing iPhone bottom-navigation overlap is an unresolved visual limit, not
pristine UI certification. M19 and production/live-provider gates remain open;
feature expansion remains held.

Migration source review finds a generation-metadata gap. `drizzle.config.ts`
explicitly limits Drizzle to generation; Wrangler and the Workers project's
`readD1Migrations` apply the SQL files. Hand-authored policy SQL is established
in migrations 0012 (owner/role guards) and 0018 (private cutover/backfills), but
each is also registered in the journal with its snapshot. In this candidate,
0019 is the only SQL file without a journal tag; the latest 0018 snapshot lacks
`credential_verified_at`. Runtime SQL application and future schema generation
are distinct concerns. No metadata is fabricated or corrected during this
55-path preparation. Root must review an actual scratch-copy Drizzle generation
whose SQL adds only this nullable session column before metadata synchronization
or fresh executable proof proceeds.

## Verified metadata synchronization — 2026-10-03

Fresh normal candidate installation passes on Node 24.18.0/npm 11.16.0: 737
packages installed, 738 audited, zero vulnerabilities. Local secrets are omitted;
the candidate owns physical modules. Installed Drizzle Kit runs once against a
private scratch copy of the exact schema/configuration/migrations. Generation
terminates 0 and emits exactly `ALTER TABLE session ADD credential_verified_at
integer` with quoted identifiers. The column is nullable, non-primary-key and
non-autoincrement; no other table, column or snapshot structure changes beyond
the generated ID/previous-ID chain. All older journal entries remain exact and
only index 19/tag `0019_recent-authentication` is appended.

Root independently verifies both generated file hashes and approves copying
only `migrations/meta/_journal.json` and `migrations/meta/0019_snapshot.json`.
The original SQL and its policy comments remain unchanged; no snapshot is
invented. The revised candidate scope is 57 paths. The original 55-path source
baseline, historical failures/captures and protected main guards/dependencies
remain preserved. This synchronization closes generation drift without changing
the credential policy, expiry, roles or a runtime binding.

Next freeze the revised source, run scoped formatting/lint and complete existing
real-auth/client/role files plus actual credential/human/account/membership D1
tests. Canonical quality and pinned SAST are released sequentially after those
passes; no source patch, deadline/rule/floor change, preview, push or new CI is
authorized by this metadata proof. Fresh prompt/private-policy visuals and exact-
head full-device gates remain required before protected merge. M19 stays open.

## Complete corrected-candidate local gates — 2026-10-03

The first scoped formatting command incorrectly enumerated all 57 paths,
including four PNGs and the SQL file. It terminated 2 with five unsupported-
parser errors and no formatting mismatch; lint/tests did not start. The corrected
command selects the canonical formatter's supported text extensions under the
same configuration. Source, artifacts, SQL, ignored paths and rules do not change.
Scoped format/lint terminate 0. Seventeen complete existing real-auth/client/
shared files then pass 284 cases, and four actual migrated workerd/D1 files pass
12 cases, with no failures or skips. No mocked successful authentication or
simulated D1 store replaces the underlying integration.

The frozen 57-path candidate passes one unchanged complete `npm run quality`
on Node 24.18.0 with the existing Python 3.13.7 libexec directory in command PATH.
All 2,909 covered cases across 260 files pass. Coverage is 92.55% statements,
85.44% branches, 92.37% functions and 93.48% lines, above unchanged floors.
Actual workerd passes 69 cases across 20 files. All static gates and full audit
pass; audit findings are zero. Remaining suites pass 32 bootstrap/migration,
15 gate, 36 performance, 25 publication and four CI-policy cases; Python asset
suites pass five and 19 tests. Production build passes all 42 artifact controls.

Source publication passes 15,686 checks with 13,386 scanner copies, 562,431,768
raw bytes, 261,846,298 unique bytes and 331 archive entries. Existing historical
treatment remains five revoked-key masks and one exact accepted finding; zero
configured private values are compared. Built publication passes 2,639 checks,
5,274 copies, 50,427,267 raw bytes, 50,409,903 unique bytes and 114 archive entries,
with no historical masks or accepted findings. Source history, aggregate and
archive budgets remain unchanged.

Only after quality terminates 0 does pinned Semgrep 1.174.0 run the existing
SAST command. It terminates 0: 510 rules, 2,155 git-tracked targets, zero findings.
Fifteen files over 1 MB are skipped; this is the configured tracked-source scan,
not an exhaustive security claim. All 348 captured process identities/groups
are gone, six browser profiles are absent, port 5273 is free and gate storage
is empty. All 57 hashes remain exact throughout these runs; final factual
documentation is updated afterward without changing code.

These complete local gates retain every earlier local/CI failure and old
historical capture. Root reviews the final source and built artifact before
normal hooks/new draft publication and the fresh four-device credential/private-
policy journey. New exact-head hosted canonical/SAST/full-device/aggregate proof
and fresh axe/viewed captures remain required before protected merge. No live
provider verification, remote migration, deployment or full M19 certification
is claimed. The existing iPhone fixed-nav/heading overlap remains unresolved;
feature expansion stays held.
