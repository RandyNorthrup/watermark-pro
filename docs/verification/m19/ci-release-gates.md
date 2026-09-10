# Version-tag deployment gates

Updated 2026-09-09. This records local configuration verification; it does not
claim that GitHub Actions or a production deployment ran.

The deployment job now requires both `gates` and `sast`. The tag's gates run the
shared generated-Worker-types check, repository quality, generated route-tree
drift check, and Playwright/axe. Static analysis uses the same reusable workflow
as branch/pull-request CI. Its original Semgrep image digest, four rulesets,
`--error`, and disabled metrics remain unchanged. No failure-swallowing or
unconditional deployment condition was added.

The local reusable-workflow reference selects the caller's commit, so a version
tag scans its own source rather than a moving default branch.
[GitHub reusable-workflow reference](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow).

Verification performed:

- Parsed the four changed/new workflow/action YAML documents and checked the
  job dependency graph, scanner pin/rules/failure behavior, external action SHA
  pins, and generated-file checks.
- Four in-memory negative controls were rejected: removing the SAST dependency,
  forcing deployment with `always()`, using an unpinned scanner, and removing the
  generated Worker type gate. Source files were not mutated for those controls.
- Prettier validation passed for the CI/deployment/SAST workflows, shared type
  action and runbook. The focused `.github` duplication scan found no clones.

Remote Actions execution and the remaining full-release gates still need their
own passing evidence before deployment.
