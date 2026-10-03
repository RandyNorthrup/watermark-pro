# Code clone correction — 2026-10-03

Root canonical quality run 39679 stopped at the unchanged zero-duplication gate,
before publication or dependency audit. This isolated correction removes only
the four reported code pairs. Root's three proof-data JSON corrections are
separate and untouched here.

The current 282-path source snapshot was copied while root was frozen and every
input was read back against its hash. Manifest SHA-256:
`dcf385d2cdb14d0ed03b0a720d48f711c18287c5ce019e2dfdee1fb6c18fb194`.
The worktree is `codex/minimal-code-clones`, based on
`c8fccc4f6e32459768043961963324331c52925c`. Independent npm installation uses
the existing exact pins; no credentials or node_modules are copied.

Existing `financialScope` now owns the repeated strict scope-body parsing,
verified caller lookup and current-owner check. Existing `sharedPhoto` owns the
repeated rate limit, live share/photo lookup and one read debit before R2 access.
The handlers retain their separate provider actions and file/thumbnail responses.
Two local D1 helpers share only paid-Team setup and the final-user-delete pause;
all separate repurchase, role and late webhook/cron assertions remain intact.
No new framework, policy, permission, threshold or ignore is introduced.

Using the unchanged `.jscpd.json` against `src` reproduced exactly four code
clones before the correction and zero afterward. This is the scoped code check,
not a claim that the full repository quality command passed. Affected Node
verification passed 39 cases; full TypeScript and scoped ESLint passed. The
unfiltered actual D1 batch passed all 34 cases: billing 21 and cloud operations
13, with no skipped cases. Formatting and diff checks passed.

No browser/native/publication scanner, commit, push or deployment was performed.
Next: review/apply the exact three-source-file delta plus this receipt, verify
the complete candidate's duplicate gate after root's proof-data corrections,
then resume unchanged canonical quality and remaining M19 gates. The strict
dependency audit and the proved Chromium AAC gap remain open; no failure is
relabelled as a passing release check.
