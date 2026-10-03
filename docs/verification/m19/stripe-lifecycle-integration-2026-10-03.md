# Stripe lifecycle integration — 2026-10-03

Status: lifecycle source integrated; focused combined functional checks passed. M19 remains open. This
receipt does not certify a release, deployment or real provider payment.

## Source and merge boundary

The approved lifecycle delta was merged into `codex/lumafoil-integration` using
the frozen Stripe snapshot at `/tmp/lumafoil-integration-handoff/stripe` and
`c8fccc4` for the four base files absent from that snapshot. The reviewed source
patch SHA256 is
`b57e9eff817c5b1779fe3478097a901ab43339ebabf9a656b5dd8686894a4f45`.
Per-path integration before/after hashes are recorded in the adjacent JSON receipt.

Nonconflicting source hunks applied normally. Four shared paths required explicit
three-way resolution: auth options/admission, the service container and the
memory auth harness. Public admission retains its real insertion-boundary
reservation, activation and API/non-API failure cleanup. `publicSignup` remains
the third admission-hook argument; billing deletion closure is fourth. Production
public policy and private cohort independence remain intact. The harness retains
its adapter insertion-failure fixture and additionally records background billing
promises for assertions. The existing duplicate quota-error correction in the
Worker entry point is preserved.

No shared plan, preset implementation/test/UI, new `0025` migration, PLAN or
CHANGELOG file was edited by this lifecycle integration. Required capacity
`presets` flows through the existing shared capacity functions. Documentation
writes are limited to the Stripe design and this dedicated receipt; other control
and runbook proposals were handed to root separately.

## Financial invariants

Self/admin removal closes financial authority before Better Auth removes any
credential rows. Existing ban fields quiesce through a server-only marker; the
actual observed false/null state is compared and the live ban is rechecked.
Provider failure returns `BILLING_CLOSURE_PENDING`, retains credentials and clears
only the unchanged temporary marker. A concurrent moderation ban is retained.

Provider-confirmed closure, not local expiry, releases chargeability. A later
webhook/cron lease cannot strand final auth deletion once chargeability is false.
All financial acquire/commit operations require the existing bound owner, and a
removed-owner signed replay receives a durable ignored receipt. Security ban
suspends paid access immediately, attempts background closure and retries existing
banned/chargeable authority through the existing cron. No extra job, subscription
history, payment state or deletion adapter was introduced.

Failed removal intentionally retains paid suspension and cleared local
paidThrough. Sign in and explicitly refresh billing to verify/recover a still-valid
provider period, or retry removal. A provider outage can delay remote cancellation.
An unrelated local failure after confirmed closure may retain the temporary ban
marker; operator recovery must confirm closure and must never clear a real
moderation reason. Financial retention and full privacy/release decisions remain
open.

## Executed checks and remaining work

- Isolated approved lifecycle source: actual D1 17/17 and final real-auth Node 9/9;
  TypeScript, scoped ESLint and formatting passed. These are separate receipts,
  not proof of this merged source.
- Combined selected real-auth Node/shared: 185/185 across eight files passed.
  This includes public signup/adapter cleanup, lifecycle, roles, SDK validation,
  billing routes, entry behavior and shared billing contracts.
- Combined TypeScript initially failed in root-owned preset work: two missing
  `library.title` locale keys and three filesystem calls using DOM URL types.
  Those files were left with root; no lifecycle merge diagnostic was reported.
- Own source-scoped ESLint passed across the merged lifecycle/auth/service/harness
  files. Root's final full TypeScript and 14-path preset lint passed (handle 68657).
- The first selected plans/account-card/public-launch run passed 28/29 and failed
  the expected localized Saved Watermarks label because it loaded the old key.
  Root's corrected UI run passed 13/13; these are distinct runs, not a relabeled
  failure or rendered browser certification.
- The first combined D1 run passed 30/31. Public admission's exact Free projection
  expected four fields; the current shared contract correctly returned the new
  presets field. Root added only `presets: PUBLIC_PLANS.free.presets` to that
  expectation; its one-file lint/format check passed (handle 16338).
- Final combined actual workerd/D1 passed 31/31 in five files: public admission 5,
  creation 4, billing/lifecycle 17, auth flow 3 and preset capacity 2. Preset limits
  therefore survive the actual financial/ban/removal paths in the combined source.
  An overlapping original browser reproduction means timing is not certified.
- Lifecycle documentation formatting and git diff checks passed. Exact source
  before/after and test-log hashes are in the adjacent JSON receipt.

No full coverage, quality, SAST, browser, Lighthouse or screenshot gate was run
for this integration. Existing full dependency-audit blockers remain unwaived.
No provider write, CI attempt, commit, push or deployment was performed.

Next slice: root reviews the exact merged hashes, then the monthly cloud-operation
budget proposal. No budget code starts before that review. Owner activation,
real sandbox lifecycle proof, full coverage/quality/SAST and isolated rendered
release gates remain open. Runtime source is held for browser diagnostics.
