# CI/CD and GitHub protection

Policy decision: 2026-10-01. The owner requested automatic production deployment
after all gates pass, required PRs/checks and zero independent reviewers. This
supersedes the earlier manual-only Actions and direct-main workflow.

## Merge and deployment path

1. Work on a branch and open a PR to `main`. CI runs without production secrets:
   canonical quality, generated Worker/route-tree drift checks, checksum-pinned
   actionlint, pinned Semgrep and every Playwright/axe device.
2. GitHub requires `Quality gates` and `End-to-end (Playwright + axe)` from the
   GitHub Actions app, with the branch current against main. The E2E aggregate
   rejects any failed, skipped, cancelled or absent prerequisite/device. All
   review threads must be resolved. No ruleset actor bypasses these requirements.
3. Squash-merge the green PR. Main history is linear and main cannot be deleted or
   force-pushed. CODEOWNERS identifies the owner; its review is advisory because
   a single maintainer cannot approve their own PR.
4. A main push starts Deploy: current-main source check, the same reusable CI,
   the complete Lighthouse/screenshot audit matrix, then migration/deployment and
   a JSON health check. A second current-main check immediately before publishing
   rejects a release superseded while its audits ran. Deployment is serialized;
   an in-flight migration is never cancelled by another merge.
5. A manual main dispatch can retry the same pipeline. Feature branches, PR refs
   and tags cannot access the production environment. Publish a release/tag only
   after the separate milestone certification checklist is complete.

The existing 2026-09-22 Lighthouse failures remain release blockers. Automatic
deployment is wired; it does not imply the application has passed those budgets
or that this change has already been deployed.

## Supply chain and credentials

Only reviewed full-SHA checkout, setup-node and upload-artifact actions are
allowed. Updating an action pin requires changing both the workflow/composite and
the GitHub allowlist in `.github/repository-policy.json`; read back the live
allowlist before running the new pin. Local/reusable workflows within this
repository remain available. Gitleaks and actionlint downloads are checksum-pinned;
Semgrep's container is digest-pinned. Checkout does not retain GitHub credentials.

Main and production have administrator bypass disabled. Tokens default to
read-only and cannot approve PRs. All external fork workflow
runs need maintainer approval; CI uses `pull_request`, never
`pull_request_target`. Dependabot opens bounded weekly npm/Actions PRs plus
security-update PRs, retains exact versions and a seven-day npm cooldown, and
does not auto-merge. Repository artifacts/logs retain 14 days; individual traces
and coverage retain seven days, and UI captures one day.

Cloudflare deployment credentials belong to the `production` environment.
Authentication/provider credentials remain Cloudflare Worker secrets; they do
not enter CI. The 2026-10-01 relocation transfers the two existing repository
deployment credentials through a one-time RSA-OAEP-SHA256 encrypted artifact,
recreates environment secrets, verifies their names, then removes repository
copies and the isolated transfer branch/artifact/key. The private key and any
decrypted values never enter Git or logs. See the verification receipt for the
actual completion status.

Secret scanning, push protection, dependency alerts and private vulnerability
reporting remain enabled. Version tags matching `v*` cannot be deleted or
force-pushed; this preserves released source history.

## Maintenance and evidence

`npm run test:ci` exercises the actual aggregate/source-guard shell and remote
policy comparison with negative cases. `npm run lint:workflows` validates Actions
syntax and shell with actionlint 1.7.12. Both are included in canonical quality.

`npm run github:verify` uses authenticated `gh` to read back every control listed
in `.github/repository-policy.json`. It changes nothing and reports field paths
only. It is an administrator maintenance command, kept outside unprivileged PR
CI because repository policy endpoints require access unavailable to fork tokens.
An API error or any drift returns failure; it is never treated as a passing
snapshot. Updating remote settings also requires updating this policy and the
verification record.

Current run evidence: [2026-10-01 receipt](verification/github-ci-2026-10-01.md).
Current product release work: [PLAN.md](../PLAN.md). No milestone checkbox is
closed by repository protection alone.
