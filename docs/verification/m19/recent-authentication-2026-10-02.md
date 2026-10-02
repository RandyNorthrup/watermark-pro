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

## Remaining gates and next slice

Run exact-commit hosted canonical
quality plus the complete 144-journey matrix. Real-auth/D1, bounded-return,
membership-revocation, provider-failure and account-switch negatives already
passed and remain in those complete gates. Public quotas, authoritative billing state, Stripe
Checkout/webhooks, public marketing/private navigation and full M19 release
audits remain subsequent slices. Production registration remains closed.
