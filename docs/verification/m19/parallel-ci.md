# Parallel release verification

The full local 104-case device attempt took 19.5 minutes and finished with
75 passes, 27 failures and two cases not run. It exposed a real WebKit PDF
canvas-capability defect, fixture races/selectors and local contention. Both
complete desktop offline journeys then passed together in 1.1 minutes using
two workers, the same 2,175-file / 37 MiB inventory and unchanged deadlines.
The local runner now schedules two browsers; all four device projects remain.

GitHub device jobs run separately so browser engines do not compete for one
machine's cold installation workload. The required aggregate check retains its
existing name and cannot pass if a prerequisite or device job fails or skips.
Tag deployment also requires the UI release audit workflow. No test job receives
production credentials.

`audit-ui.yml` derives its matrix from the same page inventory as the local
runners. Each of the 33 prepared surfaces receives five desktop and five mobile
Lighthouse traces on separate standard runners; four screenshot jobs cover all
device profiles, both themes and English/Arabic. At most eight UI jobs run in
parallel. Browser storage remains cold between Lighthouse traces; budgets and
content/HTTP checks are unchanged. Each job uploads only compact measured
results or screenshots, retained for one day. Full Lighthouse HTML, gate logs,
fixture cookies and bearer URLs are not uploaded by this workflow.

The workflow can be called by deployment, dispatched manually, or requested
on a pull request carrying `release-audit`. Remote execution and artifact
inspection remain required; workflow source alone is not passing evidence.
Source/publication review precedes the release-candidate push, and production
migration, domain cutover and hosted checks remain separate.

This repository is public. Standard GitHub-hosted runner execution is free
for public repositories, according to [GitHub's current billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
The workflow uses standard Ubuntu runners, not the separately billed larger
runner service.
