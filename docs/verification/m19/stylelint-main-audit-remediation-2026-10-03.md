# Main-based Stylelint audit remediation preparation — 2026-10-03

## Problem and resulting patch

The published Stylelint 17.15.0 chain installs micromatch 4.0.8 and braces 3.0.3,
which is affected by GHSA-vfj7-8cjw-p6xm and blocks the unchanged full dependency
audit. Current published Stylelint 17.16.0 retains that chain. Earlier green
checks on the PR stack do not resolve this current known dependency failure.

This candidate starts at exact protected main
`1811a4ae54ac23f6effee68e1891d62d2942e4fa` in an isolated detached worktree.
Only three code/configuration paths change:

- `package.json`: replace Stylelint's published-version specifier with the
  official full-SHA source archive and raise the Node floor to `>=24.15.0`.
- `package-lock.json`: carry the verified Stylelint dependency graph correction,
  retaining main's root package decisions and every unrelated lock entry.
- `.stylelintrc.json`: add `value-no-invalid: true`, preserving the existing
  standard config and all Tailwind/import settings.

PLAN §3.1, CHANGELOG and this receipt document the same bounded change. No Root
feature, install helper, vendor test, deployment test, package description or
unrelated dependency was copied. In particular, main does not acquire Root's
Mediabunny postinstall helper or `scripts/deploy.test.mjs`. Main's package scripts,
other dependencies, overrides and lint-staged commands remain byte-equivalent.
The existing `.npmrc`, `.nvmrc` and Node CI action remain unchanged. Strict peers,
engine enforcement, seven-day release age, audit threshold and coverage floors
remain intact. Root's dirty integration tree was not modified.

## Exact source and compatibility

Use official maintainer-merged commit
`12c034f5db042b474126b36231bd4ffe0ccc6e8d`, the first reviewed glob-migration
boundary, not a later branch tip or private fork. The archive is
[the immutable official codeload URL](https://codeload.github.com/stylelint/stylelint/tar.gz/12c034f5db042b474126b36231bd4ffe0ccc6e8d).
Its SHA-256 is
`f9f4d07dc8a8a8a3df8410c460a5e5994ccd547ef9775cc1eb9d70aadfeab3ea`;
ordinary npm lock integrity is
`sha512-kWAVd1mTQkx+vED+V1dbVANwN1CPts+B+LMDr2mpX9dMJFwa6m/CxFpkfzWOtfQv66IvKjWxzsTaJGM8lERjug==`.

This is unreleased v18 development source. Upstream still labels its package
`17.15.0`; those bytes remain unchanged and are not described as the published
npm 17.15.0 release. The source actually replaces its affected glob/matching
chain with maintained picomatch/tinyglobby. No package is renamed, version
invented, advisory hidden or dependency override added.

Exact registry metadata verifies standard config 40.0.0 and recommended config
18.0.0 require Stylelint `^17.0.0`, satisfied by the unmodified upstream package
label. The source requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; existing CI's
Node 24 selector supports the raised floor. The verified isolated installation
used Node 24.18.0 and npm 11.16.0. Stylelint, picomatch and tinyglobby are MIT
licensed; updated transitives retain their recorded integrity and licenses.

All 82 existing enabled settings are retained. Upstream moves invalid parse and
mixed-dimension math detection from `declaration-property-value-no-unknown` to
`value-no-invalid`; standard config 40.0.0 does not enable the new authority.
The explicit new setting preserves those existing checks. Of the enabled rule
entrypoints, 79 are byte-identical and three have the reviewed parse/math,
fix-context or maintained selector-table changes. Existing Tailwind exceptions
and the quoted recursive CLI command remain intact.

## Lock projection and source boundary

The source handoff is the frozen dependency candidate from the Root package.
Its complete manifest SHA-256 is
`96da13fff3c940e3bb00e8c03dcb7bd94c8394145be93a9c3951399adb74185b`.
Main and that Root seed differ in unrelated dependencies and scripts, so the
complete candidate package/lock was not copied.

All 58 affected non-root lock-node preimages exactly match main. Apply only
those reviewed graph deltas, then change only main's root Stylelint specifier
and Node floor. This removes 49 obsolete package paths, updates eight transitive
versions plus the honest Stylelint source record and adds no new package path.
Every unrelated main lock entry and root package decision remains intact.
Braces, micromatch, fast-glob and globby are absent from the prepared graph.
This static projection is not an executed main installation or audit pass.

## Executed source evidence and its limits

The dependency agent's physically isolated **Root-seeded** candidate produced:

| Check                                                    | Actual result                                                     | Boundary                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Normal npm install with ordinary scripts                 | Exit 0                                                            | Root-seeded dependency candidate               |
| Original/candidate actual Stylelint API and CLI behavior | 38 cases passed, exit 0                                           | Same source/config; includes negative controls |
| Complete current CSS lint                                | Exit 0                                                            | Copied Root stylesheet                         |
| Unchanged full `npm run security:audit`                  | Exit 0, zero vulnerabilities                                      | Root-seeded candidate graph                    |
| Fresh normal `npm ci`                                    | Exit 0; 739 packages installed, 740 audited, zero vulnerabilities | Root-seeded candidate; lock unchanged          |
| CSS after the fresh install                              | Exit 0                                                            | Same Root-seeded candidate                     |

No upstream Stylelint prepare script ran. All 1,173 upstream files are accounted
for: 1,171 match exactly, and npm's two `.gitignore` to `.npmignore` renames retain
identical bytes. Existing Root install helpers and an actual native Sharp PNG
operation succeeded in that separate source boundary; main does not contain
those Root helper changes.

The 38 cases preserve real APIs/CLIs and cover moved parse/math negatives,
unknown property/value/selector/at-rule, SVG case, HTML/SVG/MathML positives,
empty source/block, duplicate property, import notation, Tailwind exceptions,
autofix, quoted glob selection, exact positive file set, negation/default ignored
directories, case, unusual path characters, missing input and warning limits.
A changed-setting negative distinguishes retained settings from an empty pass.

Two earlier harness failures remain part of the source proof: serialized
baseline settings lost a message function before any scenario, then the original
CLI wrote JSON to stderr while the probe read stdout. Fifteen original rule
cases and autofix had passed before the second parsing failure. The agent
reviewed the whole contract and corrected those observation boundaries; no
upstream source, rule, assertion or deadline was relaxed.

**Actual main-based results:** normal `npm ci` passed on Node 24.18.0/npm
11.16.0, installing 737 packages and auditing 738 with zero vulnerabilities.
It uses physical main-worktree modules and main's own hooks; no Root install
helper or modules are reused. The initial unchanged `npm run quality` passed
formatting, lint, CSS, workflow validation, types, dead-code, locales, cycles and
duplication, then exited 1 at `security:secrets` with `Publication byte budget
exceeded`. The explicit full audit, tests and build stages were not reached.
This failed full-quality boundary is retained, not relabeled as passing.

Read-only actual Git accounting proves 543,857,309 ordinary working/index/history
bytes against the unchanged 536,870,912-byte cap before ZIP expansion, including
146,814,818 identical working/index bytes charged twice before the old dedup.
The coherent existing publication correction is now included in three script
paths; it strengthens filename/original-byte/actual-mask identity and charges
only distinct candidates while preserving all occurrence checks and limits.
Actual main scanner controls pass **24/24**, not the separate historical
25-control count. The corrected full source scan passes 15,576 checks, 13,340
scanner copies, 552,520,986 raw bytes, 260,328,234 distinct bytes and 331 archive
entries. No live private configuration values were available; five revoked
historical occurrences were masked and the single existing exact historical
exception remained unchanged. See the [publication correction receipt](publication-main-byte-accounting-2026-10-03.md).

Full canonical quality re-execution, SAST, required device checks and exact-head
CI remain required. The Root-seeded 38-case Stylelint proof above remains
explicitly separate. No commit, push, PR, merge, migration, deployment or provider
action has occurred in this preparation.

## Planning status and next slice

M19 remains open. New feature expansion and referral implementation stay frozen.
Root reviews this exact main-based patch before any installation or remote
mutation. The next bounded slice is actual normal installation and unchanged
quality/SAST/device checks on this main source, followed by a reviewed
remediation PR with exact-head required checks. Only then can PR12 and the
remaining stack be restacked and certified against the updated main boundary.
No automatic retry or gate waiver is introduced.

Sources: [official PR9500](https://github.com/stylelint/stylelint/pull/9500),
[exact commit](https://github.com/stylelint/stylelint/commit/12c034f5db042b474126b36231bd4ffe0ccc6e8d),
[upstream migration guide](https://github.com/stylelint/stylelint/blob/12c034f5db042b474126b36231bd4ffe0ccc6e8d/docs/migration-guide/to-18.md),
[advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Corrected complete local quality outcome — 2026-10-03

The one unchanged corrected-source `npm run quality` reached terminal **exit 1**.
Canonical source publication passed (15,577 checks, 13,342 copies, 552,530,215 raw
bytes and 260,337,463 distinct bytes under the unchanged cap), then the unchanged
full dependency audit passed with **zero vulnerabilities**. Covered Vitest
execution completed 2,789 tests: **2,765 passed and 24 failed**, across 253 files
(243 passed, ten failed). Branch coverage is **84.8% against the unchanged 85%
minimum**, so the coverage gate also failed. Workerd integration, later script
tests and build were not reached. This is failed full quality, not merge readiness.

The 24 public case identities were reviewed without exporting DOM, mail tokens
or request bodies. Eighteen cases report the existing 5,000/20,000 ms test
boundaries (two share a grouped reporter block); four are element-query
assertions, one is a pipeline assertion mismatch, and the 12-megapixel adjustment
case measures 17,889.3 ms against the unchanged 12,000 ms requirement. No test,
rule, coverage threshold or deadline was relaxed, and no application source was
patched. Both the initial publication-budget failure and this subsequent full
quality failure remain preserved.

Client, Worker, test, Vite/Vitest configuration and E2E source match exact main
`1811a4ae54ac23f6effee68e1891d62d2942e4fa`; only the documented dependency/config
and three publication script paths differ. Main uses its ordinary published
Mediabunny 1.55.6 installation, without Root's install helper or SDK patch. The
eight updated CSS/tooling transitives could influence Vite/Tailwind; their effect
on these failures is **unknown** until matched evidence distinguishes it. No
cause is assigned to CSS, artifacts, bootstrap, host load or timing from the
failure symptoms alone.

Whole-source reassessment is complete enough to preserve this boundary and
justify one exact-head Linux canonical control of the changed dependency/source
accounting. It does not justify another local quality retry or a claimed fix for
the test failures. Required exact-head hosted checks remain pending; Root's
separate main SAST run passed: 510 rules over 2,127 files, zero findings; 13 files
above the scanner size limit were skipped. The tracked-source scope includes the
three modified scanner scripts; this is not an exhaustive-content claim.
A reviewed draft remediation PR may carry the honest failures; protected merge,
M19 and release certification remain blocked until all required checks pass.
