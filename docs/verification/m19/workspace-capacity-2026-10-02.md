# Workspace capacity implementation — 2026-10-02

## Alignment onto protected main — 2026-10-04

New owned tree `/tmp/lumafoil-pr16-aligned-2026-10-04`, branch
`codex/restack-workspace-capacity-aligned`, starts at merged main
`3e7991a60a6b4e4b837aa5384c6f31f8f46d1888`. The reviewed 33-path delta is reapplied
without changing its runtime/test/migration leaves. Only PLAN/CHANGELOG
preimages differ; their additive conflicts retain both histories. All new-main
startup/gate/privacy leaves and current 0019 snapshot remain unchanged. The
generated journal still preserves all 20 old entries before the reviewed 0020
extension. Package/lock comparison is exact to the prior base apart from the
already reviewed bootstrap test argument.

The old tree, branch, source manifest, patch and physical modules remain
preserved. This tree receives a physical copy of those same-owner fresh modules
after dependency/lock equality is checked; no Root modules, storage or credential
are borrowed and no dependency is changed. Focused proof on this actual aligned
source uses Node 24.18.0 and the original projects/configurations/deadlines:

- Complete shared plans, real-auth workspace-capacity API and upload-lifecycle
  files pass 33/33 cases: 13 plans, eight API role/tenant/metadata controls and
  twelve lifecycle cases. Zero failures or skips.
- Existing populated workspace-plan migration script passes 3/3 actual SQLite
  cases, applying real 0000–0019 SQL before 0020. Historical rows, grants/content,
  server identity/provenance and malformed/foreign paid-purpose constraints
  reach their original assertions. This is populated migration proof, distinct
  from empty workerd setup.
- Complete `uploads.workers.test.ts` passes 26/26 actual workerd/D1/R2 cases,
  including reservation/commit capacity, concurrent last slots, paid expiry/
  suspension, physical cleanup and audit fencing. Zero failures or skips.

All three commands terminate with exit zero. Source remains frozen throughout.
The captured Vitest root PID is absent afterward and candidate-CWD inspection
finds no Node/workerd/browser runtime. The short run ended before native child
identities were captured; no unidentified process/storage is removed and this
limit is retained. Final docs/scoped formatting and source hashes are refreshed
for Root's review before another gate.

Root then releases one unchanged complete `npm run quality` on that frozen
aligned source with Node 24.18.0 and the existing Python 3.13.7 launcher in
command PATH. It exits zero: 2,950 covered cases across 262 files, coverage
92.58% statements / 85.47% branches / 92.39% functions / 93.51% lines, followed
by 78 actual workerd cases across 20 files. All original floors remain. Format,
lint/CSS/workflows, fresh types, dead code, locale, cycle/duplication, publication
and full dependency audit pass; audit findings are zero. The subsequent existing
bootstrap, gate, performance, publication, asset and CI-policy commands and the
production build also pass. No gate, deadline, rule or retry policy changes.

Sequential pinned `npm run security:sast` exits zero: Semgrep 1.174.0 runs 510
rules on 2,171 tracked targets with zero findings. Fifteen files larger than the
standard one-megabyte limit are skipped; this is the configured tracked-source
scan, not exhaustive coverage of every file. Candidate-CWD runtime inspection
finds no Node/workerd/browser/Semgrep process afterward. Private source/report
hashes and failed historical attempts remain separate. The selected application
E2E proof follows below. This branch has no new hosted CI, Lighthouse, general
screenshot, payer/provider, public activation or deployment proof. Original CI green below remains
attributable only to `fdd55f2`; M19 stays open. Root reviews final hashes and
receipt before normal publication and exact-head protected checks.

Root then releases this existing canonical scope:

```sh
npm run test:e2e -- e2e/gallery.spec.ts e2e/share.spec.ts e2e/onboarding.spec.ts
```

It builds fresh through the unchanged canonical webServer, uses an owned
isolated SDK D1/R2 gate and exits zero: 16/16 cases pass across desktop Chrome,
iPhone, iPad and Android in 4.9 minutes, with zero retries/failures/skips. Two
workers, all original waits and existing slow-test declarations remain. Each
device proves real editor-to-R2 gallery save/search/download/delete/audit;
signed-link publication, anonymous visitor scope/tamper refusal and revocation;
private personal versus explicit collaboration identity; and viewer admission/
read-only controls with denied audit access. Existing axe assertions require
zero violations and document overflow no greater than zero; all reach their
assertions. Downloaded PNG dimensions are actually 960 by 640.

Source hashes match before/after this run. Twelve attached startup/WebKit
identities and their groups are absent afterward, candidate-CWD runtime is zero
and port 5273 is free. Later Chromium descendants/profile identities were not
sampled while attached; the post-terminal checks remain separate evidence. One
recorded own gate directory survives automatic teardown. Its canonical parent/
prefix, no-symlink state, own built app/test-router configurations, empty SDK
secret stub and local R2 settings are verified after all known runtime closes;
only that directory is removed. Baseline/user storage is preserved, with no
global kill or unidentified cleanup. This selected proof does not certify
every application journey, current hosted checks or general screenshot/performance
acceptance. No payer/provider effect or public launch follows from it.

## Prior source-only restack — 2026-10-04

Owned tree: `/tmp/lumafoil-pr16-restack-2026-10-04`, branch
`codex/restack-workspace-capacity`, base main
`83546028cc1236aec407f2425e5fbd9ca3dbb619`. Original commit
`fdd55f2ea787793bcf5b07e13ff27aa36ad767de` has exactly 31 changed paths above
`77f6a9a6c4965cee59fd6d8ce5c44e173a5471d3`; the main/original common ancestor is
`1811a4ae54ac23f6effee68e1891d62d2942e4fa`. Twenty-six original preimages match
main. Only PLAN, CHANGELOG, SECURITY, the historical recent-auth receipt and
package history differ. Replay is uncommitted; only PLAN/CHANGELOG conflict,
resolved additively without dropping either history. Runtime/test/migration
leaves retain the original behavior; package adds only the existing migration
test to its bootstrap list.

Main's current human/private/recent authentication, protected administrative
fields, dependency floor/archive pins and publication safeguards are preserved.
Generated 0019 snapshot and all original journal entries remain exact to main.
The original 0020 SQL omitted its generation metadata. Fresh normal `npm ci`
uses this tree's physical modules and private cache, installs 737 packages and
reports zero audit findings. Existing install-script approval warnings are
retained; no script-approval or supply-chain override is applied.

Installed Drizzle generates in an isolated scratch copy using the exact main
0019 snapshot plus this schema. Its only SQL statement creates `workspace_plan`:
eight columns, eight expected checks, one organization foreign key with cascade
deletion, and no new indexes. All 26 prior tables and remaining metadata are
unchanged. The generated 0020 snapshot's `prevId` matches main's 0019 snapshot;
the old 20 journal entries are exact and the appended entry has index 20 and
tag `0020_workspace_plans`. Root independently reviews that output before
approving only the generated snapshot and journal extension. Original 0020 SQL,
backfill and three triggers are preserved; generated DDL is not copied over them.
The revised source preparation has 33 paths.

The generator executes once and exits zero. An initial command request was
rejected before spawning because the future scratch directory did not exist;
creation is then performed before launch. The first static review predicate
mistakenly forbids `DELETE` inside the required `ON DELETE CASCADE` clause.
Correcting statement classification reviews the same single generated CREATE;
it does not rerun the generator, alter SQL or count as a new generator attempt.

No lint, types, tests, build, browser, push or new CI has run here. Original CI
`37024827798` is a pass for `fdd55f2` alone. Original local
cron-fixture failure and its focused correction remain below. Other old provider,
branch and pending-status statements below describe their dated historical
checkpoint, rather than current operator state or this new candidate.

After Root reviews the frozen source, align against actual post-video/release
main. Executable proof must retain the existing six real-auth roles and tenant/
metadata forgery negatives, complete upload write-time expiry/suspension/race/
cleanup tests, and actual populated 0000–0019-to-0020 migration/FK/content
preservation. Then run unchanged canonical quality, SAST and exact-head device
gates. This source does not implement seat/creation admission, Checkout/webhooks,
Starter, daily export or public-launch UI. The final confirmed policy still
requires Starter USD 4, five Free image admissions per UTC day, no Free Video/
Bulk and one-page Free PDFs. The historical all-tools-Free text is not a current
launch promise. No live billing/public activation or M19 certification is
claimed. Original and later references remain untouched.

## Historical original-source receipt

Status: candidate implementation under verification on `codex/plan-entitlements`,
stacked on credential-proof runtime `77f6a9a`. No production migration, subscription
activation, public admission, merge or deployment has occurred.

## Authority and admission

The shared monthly catalog implements the researched Free/Pro/Team limits, while
private membership retains its independent historical grant. An explicit D1
`workspace_plan` record stores workspace purpose, base grant, paid period,
suspension and revision. Organization metadata, workspace roles and browser plan
names do not grant paid access. Migration `0020` retains historical shared grants
and actual existing membership, separates personal/private and public base
capacity, and assigns future workspaces an explicit server record.

The member-visible capacity API returns only storage, photo, logo and member
limits. It omits billing/customer identifiers and private admission state. Actual
workspace membership is required; unrelated members and anonymous callers cannot
read another workspace's limits. No client-accessible capacity setter exists.

Upload reservation admission reads current plan authority inside its conditional
D1 INSERT, alongside saved content, thumbnails, concurrent reservations and
outstanding cleanup. Metadata commit rechecks paid-period expiry/suspension and
the complete quota, plus existing membership and folder guards. Audit and lease
completion depend on the reservation-bound metadata actually being inserted;
reusing the quota condition after insertion would count that upload twice.
Downgrade does not delete stored content. Failed commits retain cleanup liability
until physical object recovery releases their reservation.

## Verification status

Exact-commit hosted run `37024827798` passed all seven jobs: canonical quality,
SAST, every device and the fail-closed aggregate. It executed 2,926 covered cases
across 262 files and 78 real workerd cases across twenty files. Coverage was
92.56% statements, 85.45% branches, 92.37% functions and 93.50% lines. The full
144-journey Playwright/axe matrix passed; one Android journey used the existing
retry policy. All new capacity tests passed. This certifies the storage-capacity
implementation, not public launch, Stripe processing or the separate video/UI
candidate. Draft PR: https://github.com/RandyNorthrup/watermark-pro/pull/16.
CI: https://github.com/RandyNorthrup/watermark-pro/actions/runs/37024827798.

New tests cover strict plan records, Free versus private limits, exact paid-period
expiry, suspension, member and tenant isolation, writable-metadata forgery,
concurrent final slots, byte boundaries, commit-time authority changes, audit
fencing and object recovery. The first focused run passed 56 Node/shared cases;
the final real D1 upload integration passed all 26 cases. Three actual-migration
SQLite checks also passed, including legacy content and membership canaries.
The subsequent complete covered run executed the final gallery usage assertion.
The canonical attempt cleared every static, publication and dependency gate,
then passed 2,925 covered cases with one failing cron fixture. Coverage remained
92.54% statements, 85.44% branches, 92.34% functions and 93.47% lines. The cron
fixture had no explicit plan authority; it now seeds a named Free grant and all
twelve focused handler cases passed. This is not a canonical quality pass;
complete final-source quality, real D1 and SAST remain required before this slice
can be marked complete. The preceding credential-proof source has
separate exact-commit hosted receipts; they do not certify these changes.

Final SAST passed all 510 rules over 2,164 files with zero findings. The updated
photo-count red drill deliberately admitted an extra slot; D1 tests went red,
and the runner verified byte-for-byte source restoration. Its focused receipt is
`../../red-drill/2026-10-02.md`; it is not a claim that the entire drill matrix ran.

GitHub readback on 2026-10-02 again confirmed public visibility, all thirteen
repository-policy endpoints, enabled private vulnerability reporting, secret
scanning/push protection and Dependabot security updates. Open secret and
dependency alert queries returned zero without printing secret values. Hosted
video source `c1a503a` has separate quality/SAST passes and a pending four-device
matrix in draft PR #15; it is not this capacity source's certification.

## Historical remaining launch work — 2026-10-02

This slice does not activate paid subscriptions or enforce creation/member seat
quotas. Those need atomic auth-plugin and custom-workspace seams, followed by
owner-bound checkout/portal and signed, deduplicated webhook reconciliation.
At that checkpoint, authentication to the new Lumafoil Stripe account was
unavailable. The first renewed CLI login reached an unrelated existing account
and made no provider changes. The owner clarified the separate Lumafoil account
requirement; Dashboard setup was then pending. This historical account-onboarding
statement is superseded by the completed separate Lumafoil onboarding.
Public landing, private-only navigation/donations, live provider checks and full
M19 UI/release certification remain outstanding.

## Current status — 2026-10-04

The aligned 33-path foundation passes 2,950 covered cases, 78 workerd cases,
510 SAST rules on 2,171 tracked targets with zero findings and 16 canonical
four-device E2E cases with axe/reflow checks. Known processes/groups, port 5273
and verified owned gate storage close; later browser/profile capture limits
remain explicit. Genuine 0020 journal/snapshot metadata is synchronized while
original SQL/backfill/triggers and current main protections remain intact.
Current launch work is actual billing/provider integration and live activation,
not account onboarding. Final Starter USD 4 and Free five-image/no-Video/Bulk/
one-page-PDF policy remain required and unenabled by this foundation. New hosted
checks, public activation and complete M19 certification remain open.
