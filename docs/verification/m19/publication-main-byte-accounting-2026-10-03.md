# Main publication byte accounting correction — 2026-10-03

## Proven failure and complete interface review

The first unchanged main-based `npm run quality` reached terminal exit 1 at
`security:secrets`: `Publication byte budget exceeded`. Format, lint, CSS,
workflow validation, types, dead-code, locales, cycles and duplication passed;
explicit audit, tests and build were not reached. The original private log and
its failed boundary remain retained. No automatic rerun, larger budget, rule
exception, ignored history or source removal followed the failure.

Read-only actual enumeration of this main worktree and its reachable Git graph
reported:

| Input                                   | Occurrences | Ordinary bytes |
| --------------------------------------- | ----------: | -------------: |
| Working candidates                      |       3,542 |    147,772,321 |
| Git index                               |       3,541 |    147,783,064 |
| Reachable history objects               |       8,157 |    248,301,924 |
| Ordinary raw total before ZIP expansion |      15,240 |    543,857,309 |

The unchanged aggregate cap is 536,870,912 bytes (512 MiB). This ordinary lower
bound exceeds it by 6,986,397 bytes. There are 3,536 identical same-path/current-
treatment working/index pairs totaling 146,814,818 bytes. Main increments and
rejects raw occurrence bytes before its old dedup, so those repeated bytes are
charged again even when scanner copies are already shared. The unique combined
Git-object read is only 248,301,924 bytes, below the same cap. This establishes
duplicate occurrence accounting, not an oversized unique object read. ZIP
expansion is additional work and is not required to establish the cause.

These diagnostic counts use actual file identities/sizes and Git metadata;
no secret values are printed. They do not invent retired masking, archive
member or scanner admission counts absent from the original failed result.

## One coherent existing correction

Reuse exact reviewed source from `c358434754014b561aec2ecd72e51fb6ab2613b4`
in only `scripts/lib/publication-audit.mjs`, `scripts/publication-scan.mjs` and
`scripts/publication.test.mjs`.

Main's original dedup key was **origin/hash**. The correction strengthens it
to **original filename, original bytes and actual retired-mask treatment**;
it is not described as retaining an existing filename key from main. Every
occurrence still receives original individual-size/path/private-value/LFS
checks before dedup. Only exact candidates share aggregate charges and staging.
Raw occurrence counters remain visible. Changed bytes, different paths and
current unmasked versus retired historical treatment cannot share a charge.

The 512 MiB distinct cap, individual and Git-object/output limits, complete
refs/history scan, scanner rules/deadlines, ZIP entry/expansion/depth/ratio/CRC
bounds and exact immutable retired-history exception remain unchanged.
Different original paths share ordinal directories; changed versions of one
path receive distinct files, so a later archive cannot overwrite an earlier
unsafe original-path copy. Neutral copies remain independent. No abstraction,
new dependency, gate waiver or feature behavior is added.

## Actual main regression and source proof

On physical main-worktree modules, Node 24.18.0 and pinned Gitleaks 8.30.1:

- `node --test scripts/publication.test.mjs`: **24 passed, zero failed/skipped**,
  terminal 0. The separate earlier receipt's 25-control count is historical and
  is not substituted for this actual 24-case file.
- Exact controls retain inspected-file/history/copy counts and reject changed
  paths, changed bytes and changed masking treatment. A distinct byte beyond
  the unchanged numeric cap is refused. Real original-path ZIP canaries prove
  red with the earlier unsafe member and green after removing it; neutral
  copies cannot conceal an overwritten path-specific unsafe source.
- Actual `npm run security:secrets` with a private report sink: terminal 0,
  **15,576 candidate/object checks, 13,340 scanner copies, 552,520,986 raw bytes,
  260,328,234 distinct bytes and 331 archive entries**, zero findings.
  Five revoked historical occurrences are masked and the single pre-existing
  exact historical exception remains unchanged. Configured live private-value
  count is zero; pattern/path/archive/history checks retain their full scope.

Raw inspected bytes exceed 512 MiB while genuinely distinct admitted bytes remain
below it. This is the reported accounting correction, not a hidden higher limit.
Source files match the reviewed c358 bytes. The publication policy and retired
history module are unchanged. Private logs/reports have mode 0600, outside the
publication candidate; no raw secret output is included here.

## Planning status and next slice

Fresh normal main `npm ci` also passed (737 installed/738 audited, zero
vulnerabilities); the separate Root-seeded 38-case Stylelint compatibility
proof remains correctly identified in the [dependency receipt](stylelint-main-audit-remediation-2026-10-03.md).
The first full-quality failure is preserved. Root approved one unchanged full
quality execution of this concrete corrected source, followed by exact-source
security/device and hosted checks. Until those complete, this is not full quality,
M19, protected-merge or production certification. No commit, push, PR, merge,
deployment or provider action has occurred. Feature expansion remains frozen.

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
