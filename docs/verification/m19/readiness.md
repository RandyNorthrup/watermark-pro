# M19 takeover and readiness review — 2026-09-08

Source inspected: `8a94fbdf9d091c9afca4b2a7d33c0e55ea60a88a`, initially clean.
Runtime observed on Windows: Node 24.20.0, npm 11.19.0, Python 3.14.0.
Reviewed the root instructions, PLAN, CHANGELOG, SECURITY, M19 specification,
Claude's project memory and latest session tail, client boot/data paths,
Worker routes/stores, service workers, and deployment/verification tooling.

## Authoritative scope

The owner's current offline/sync clarification in `docs/plans/m19-performance.md`
controls implementation. The offline requirement is not satisfied by a cached
shell or a paused in-memory mutation. Local commits must be durable before a
success message; remote acknowledgements require server confirmation. Online-only
administration and sharing must explain their connection requirement. Server
authorization remains mandatory regardless of cached roles.

## Baseline findings

| Area                | Current observation                                                                                                                                                                                               | Required action                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Offline sync        | No durable outbox or reconnect replay exists. Library and photo mutations call the API directly. The persister explicitly excludes library/gallery data.                                                          | Implement durable scoped data, pending operations, acknowledgements, retry/conflict handling, and browser restart/reconnect proof. |
| Shell privacy       | `query-persister.ts` serializes complete Better Auth responses, including the session object, with no field allowlist or stored-shape validation. The active organization includes members/invitations.           | Persist a validated display projection; exclude tokens and unnecessary member data; verify logout and account isolation.           |
| Boot regression     | HEAD's CI run 34280598935 failed: 34 failed, 16 passed, 2 skipped. Repeated onboarding failure expects the created workspace heading but receives "Your workspace".                                               | Repair mutation/loader cache coherence and reproduce through real Better Auth in Playwright.                                       |
| Dependencies        | `npm run quality` passed format, ESLint, CSS, types, dead code, i18n, cycles, duplication and secrets, then failed audit: 9 advisories (5 high, 4 moderate). The high path is Miniflare's exact sharp 0.35.2 pin. | Verify and pin a compatible patched sharp; retain the audit gate and resolve the remaining advisory paths where possible.          |
| Tests               | `npm run test` passed 878 unit/browser tests and 16 workerd tests. Coverage: statements 94.19%, branches 85.79%, functions 92.08%, lines 94.14%.                                                                  | Treat as the pre-change baseline, not certification for new offline behavior.                                                      |
| SAST                | `npm run security:sast` cannot locate semgrep in npm's PATH. Direct installed `pysemgrep.exe` ran 267 rules over 557 tracked files with zero findings.                                                            | Make the documented command reproducible; rerun after changes.                                                                     |
| Performance/release | Budget script is not in quality; it measures the SPA entry for both surfaces. Deploy builds without prerender. M19 update/offline/browser/visual gates remain open.                                               | Finish the M19 build, budget and release chain and obtain fresh device/visual evidence.                                            |
| Documentation       | PLAN's last-updated line still says M2; M18's release box is open despite GitHub release v1.10.0 existing. Threat model still labels the review M8.                                                               | Reconcile current implementation and evidence without rewriting historical results.                                                |

Baseline command logs are retained in the local temporary directory as
`watermark-pro-{quality,tests,sast}-baseline.log`, `watermark-pro-sast-direct.log`,
and `watermark-pro-ci-baseline.log`. GitHub evidence:
<https://github.com/RandyNorthrup/watermark-pro/actions/runs/34280598935>.

## Readiness decision

The requested behavior is sufficiently defined to implement. Important failure
cases are loss of connection after the server commits, browser restart while
queued, revoked membership, changed account, concurrent preset edits, denied or
full local storage, and two tabs trying to sync. Each needs behavioral evidence.
The current code is not production certified. A requirements review does not
turn any executable gate green.
