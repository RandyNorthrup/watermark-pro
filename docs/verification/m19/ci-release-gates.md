# Manual deployment gates

Updated 2026-09-12. The owner disabled automatic GitHub Actions to control usage.
Local quality, security and browser checks are the default; hosted workflows run
only through an explicit manual dispatch or a reusable call from that dispatch.
Pushes, pull requests, version tags and dependency updates do not start workflows.

The manually dispatched deployment job requires both `gates` and `ui`. Its gates run the
shared generated-Worker-types check, repository quality, generated route-tree
drift check, and Playwright/axe. Static analysis uses the same reusable workflow
as the manually dispatched CI workflow. Its original Semgrep image digest, four rulesets,
`--error`, and disabled metrics remain unchanged. No failure-swallowing or
unconditional deployment condition was added.

The local reusable-workflow reference selects the caller's commit, so a manual
release scans its selected source rather than a moving default branch.
[GitHub reusable-workflow reference](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow).

Original gate verification (2026-09-09):

- Parsed the four changed/new workflow/action YAML documents and checked the
  job dependency graph, scanner pin/rules/failure behavior, external action SHA
  pins, and generated-file checks.
- Four in-memory negative controls were rejected: removing the SAST dependency,
  forcing deployment with `always()`, using an unpinned scanner, and removing the
  generated Worker type gate. Source files were not mutated for those controls.
- Prettier validation passed for the CI/deployment/SAST workflows, shared type
  action and runbook. The focused `.github` duplication scan found no clones.

The 2026-09-12 source review confirms that CI and UI audits expose only
`workflow_dispatch`/`workflow_call`, and Deploy exposes only `workflow_dispatch`.
The local deployment path remains `npm run deploy`. Local results do not imply
that hosted Actions ran; current release evidence is recorded in `quality.md`
and the relevant device, screenshot and hosted verification records.
