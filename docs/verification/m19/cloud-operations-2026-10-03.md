# Cloud-operation budget candidate — 2026-10-03

Status: isolated uncommitted source, under verification. Not deployed/certified.
Root's exact WIP seed manifest SHA256 is
`07e9453bc40f5982f16d1c5e7e83101aa352bf68564f4e2bce80384d57c29c1d`;
236 files copied by hash with modes preserved from its immutable files directory.
No credentials/node_modules copied. Independent npm ci succeeded: 794 packages,
seven existing high advisory findings retained, no force fix/waiver.

Migration 0026 adds exactly two workspace fields and one three-column singleton.
One workspace admission statement and its trigger debit both or roll both back.
No actor identity, events/history, receipt, refund or job was added. The existing
site-owner guards remain unchanged. Current roles, private creation replacement,
financial closure and destructive cleanup keep their policies.

The first type/unit load failed because an existing ZodMini ID schema cannot use
standard Zod's chain optional method. Function-style optional composition fixed
that real mistake; no schema relaxation. A fixture PlanStore needed the new
boundary method; it throws when invoked rather than simulating fulfillment.

Actual SQLite tests currently pass 6/6: singleton and unchanged owner guards,
workspace/site exhaustion directions, deliberate failure after trigger debit
rolling back both, monotonic/future rejection, delete/replacement/account-removal
site persistence and invalid aggregate storage. These execute all prerequisite
migrations plus actual 0026 SQL. They are not an actual D1/API receipt.

The first selected real-auth Node run passed 43/43 across five files. A later
affected boundary/provider run passed 114/114 across six files. These counts
overlap and are not summed. The combined final affected run passed 176/176 across
13 files, including 15 new real-auth budget cases, six actual SQLite cases,
61 existing SDK validation cases and nine existing payer lifecycle cases.
The Node harness uses real Better Auth; only the new PlanStore persistence
boundary is spied. Cleanup tests retain owner/admin/editor deletion and meaningful
viewer/non-member/anonymous refusal under exhausted allowance. Upload admission
failures and bounded bulk exact replay have explicit request-weight assertions.

The first actual workerd/D1 run ended 11/12, not green. All ten counter/authority
cases and private payer closure/rejoin passed. Public payer Checkout returned
409: the named disposable provider reused the prior payer's globally unique
request/customer/session identifiers while its closed orphan authority remained.
The corrected fixture uses a fresh request UUID and a cohort-specific prefix
through all related provider payloads and paths. Closed authorities are retained,
and removal/rejoin now asserts their customer/request binding remains unchanged.
No billing runtime policy was changed to obtain a pass. The corrected actual
workerd/D1 run passed 13/13, session 5062, after the serial image/billing/root UI
slots ended. Removed-member and stored expired-share negatives, singleton
replacement refusal and distinct active Pro/Team boundaries passed. Both private
and public payer cases proved actual SDK cancellation before authenticated removal;
rejoin preserved the old closed authority and full site spending while the new
workspace debit rolled back on site exhaustion. These are functional tests, not
invoice or timing benchmarks. Private/public removal cohorts are trusted fixtures;
this file does not claim to re-certify public signup/Turnstile admission.

Read review found a singleton replacement gap. An actual SQLite negative test
first failed (5/6 pass): INSERT OR REPLACE reset the singleton despite the DELETE
guard. SQLite documents that REPLACE deletion invokes DELETE triggers only with
recursive triggers enabled. A minimal BEFORE INSERT existing-id guard now refuses
replacement without relying on that connection option; the existing site-owner
guards remain unchanged. Source: [SQLite ON CONFLICT](https://www.sqlite.org/lang_conflict.html).
Corrected SQLite and real-auth regression tests passed 21/21 (15 API and six
SQLite cases); the final 13/13 D1 run also passed replacement refusal. These
overlap the combined 176-case run and are not additional unique-case totals.

Initial scoped lint reported 29 issues. Import order, typed weight reuse, nesting,
SQL fixture parameters and template indentation were corrected without any rule
suppression. Final scoped lint on all 17 TypeScript paths and full typecheck
passed on the corrected guard/current tests. Root owns complete combined-source
certification and holds broad/native test slots during integrated checks. No browser,
full coverage, quality, SAST, publication scan, CI, commit, push or deployment was
run for this candidate. Known global release and audit blockers remain unwaived.

Request weights and monthly caps are provisional product/operator policy. The
shared site budget is not actor fairness or a complete invoice ceiling. Three UTC
calendar allocations can occur within the supported 32-day paid window; CPU and
unbounded-list/critical/denied overhead remain explicit before public opening.
No Wrangler CPU cap exists in this source. Workspace and site debits occur after
authentication/signature/permission work; rejected traffic and those preceding
costs therefore are outside the aggregate. Saved-preset listing loads complete
specifications (up to the current 2,000 Team cap, plus retained historical excess),
whereas photos already use cursor pages. This slice adds no pagination framework.
The next cost-bound slice needs measured admitted CPU plus bounded list payloads
and a separate denied/control/creation abuse boundary; quota counts alone cannot
substantiate the earlier $0.15/$0.50 compute allocations.

The final source delta changes 18 source/test/migration paths, two dedicated
documents and two proposed root planning/changelog sections. Root must merge
those sections deliberately; no locale, billing runtime, site-owner migration,
package/lockfile, Wrangler, public flag or external account changed in this slice.
Exact seed-relative before/after hashes and patch are provided separately for
review; passing focused gates does not close M19 or the full audit blocker.
