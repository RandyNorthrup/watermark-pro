# Security remediation verification — 2026-11-06/07

Pull request #40 (`fix/security-remediation`) restores the full
`npm audit --audit-level=high` gate on main `7c2ee21` and closes three confirmed
security defects. The change set and its reasons are in `CHANGELOG.md`
(Security remediation — 2026-11-06) and `PLAN.md` §3.1.

## Local evidence (macOS, Node 24.18.0)

| Gate                                       | Result                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run quality`                          | Exit 0. 278 unit files / 3,095 tests; coverage statements 92.77, branches 85.88, functions 92.52, lines 93.71; codecs 2 files / 18 tests; workerd 21 files / 86 tests; assets, vendor, CI tests and build passed; `security:audit` exit 0 with 17 moderate development-tool findings. |
| `npm run security:sast`                    | semgrep 1.174.0 (the CI pin): 510 rules, 2,240 files, 0 findings.                                                                                                                                                                                                                     |
| `playwright test --project=desktop-chrome` | 39/39 passed with axe, 12.9 minutes.                                                                                                                                                                                                                                                  |
| Regression proof                           | Each new test failed with its fix reverted: 2 recent-authentication, 4 URL-policy, 1 header. The workerd tier failed 15 of 21 files before migration `0023` and passed after.                                                                                                         |

The machine's default Node is 26, whose built-in `localStorage` shadows jsdom's
and breaks 109 tests in 11 files; every gate above ran under Node 24, the
`.nvmrc` major. `test:assets` calls `python`, which macOS does not provide; it
ran through a temporary `python` → `python3` shim outside the repository.

## CI attempt 1 — run 42355974514

Quality, semgrep, desktop-chrome and android passed. The required
End-to-end aggregate failed because both WebKit device jobs failed:

1. **iPad and iPhone, `e2e/video.spec.ts:281`** (all three tries). The test
   names the project `Track edit` and expected the download
   `Track edit-watermarked.mp4`; Linux WebKit reported
   `Track_edit-watermarked.mp4`.
2. **iPhone, `e2e/library.spec.ts:49`** (all three tries). WebKit's renderer
   crashed (`Target crashed`, then a closed page) while clicking **QR codes
   only** right after a sticker watermark was saved. `e2e/onboarding.spec.ts:66` failed once on iPhone and passed on retry.

### Cause of failure 1 (proven)

The application sets `anchor.download` to `${project.name}-watermarked.${container}`
(`src/client/components/video/video-tool.tsx:355`, `src/client/lib/download.ts`);
neither file changed in #40. A minimal reproduction, an anchor with
`download="Track edit-watermarked.mp4"`, reports the name unchanged in Playwright
1.63.0's Chromium and macOS WebKit. The CI runner's Linux WebKit is the only
engine that rewrites the space. The assertion arrived with the space-bearing
project name in `ff40994` (#28), whose CI records were deleted with the other
2026-10-02 to 2026-10-24 runs, so no earlier WebKit pass of it exists.

Correction: the test names the project `Track-edit`, so the exact filename
assertion holds on every engine without loosening it. Locally the test passes
on desktop-chrome and ipad (macOS WebKit).

### Failure 2 (cause not established)

The crash is in WebKit's renderer process, not in a failed assertion. #40 changes
no client source; the dependency updates that reach the client bundle are Vite
8.3.5, Zod 4.6.7, seroval 1.7.5 and Hono 4.13.14. No baseline exists to compare
against: main's own CI cannot reach the device jobs while its audit gate fails,
and the earlier run history is gone. CI attempt 2 carries only the failure-1
correction, so it shows whether failure 2 recurs unchanged. If it recurs, the next
step is a Linux WebKit reproduction on main versus this branch (Playwright's
1.63.0 Linux image), not another CI attempt.

## CI attempt 2 — run 42358751808

Every check passed: Quality gates, semgrep, desktop-chrome, android, iPad and
iPhone, and the required End-to-end aggregate. `e2e/video.spec.ts:281` passed on
both WebKit devices. On iPhone, four tests failed once and passed on retry:
`documents.spec.ts:88`, `documents.spec.ts:157`, `library.spec.ts:49` (failure 2)
and `offline.spec.ts:17`. They span unrelated journeys, and #40 changes no client
source, so this is recorded as iPhone WebKit runner instability to investigate
separately, not as a defect of this change.

## Production pre-merge checks — 2026-11-07

Merging to main runs `scripts/deploy.mjs`, which applies pending migrations to
production D1 before the Worker deploy. Production had applied migrations through
`0017_workspace_folders`, so this merge applies `0018`–`0022` from main as well as
`0023`. Read-only checks on production D1 (dashboard console and
`wrangler d1 migrations list --remote`):

| Check                                          | Result                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Duplicate `(provider_id, account_id)` pairs    | None                                                            |
| `account` indexes                              | `account_issuer_account_id_unique` present, as `0023` expects   |
| Objects created by `0018`–`0022`               | None present, so no migration collides with existing schema     |
| Pending remote migrations                      | `0018`–`0023`, in order                                         |
| Worker secrets required by `src/worker/env.ts` | All present, including the Turnstile and sign-in provider pairs |

Following the runbook's schema-change steps, a private D1 export and the current
Time Travel bookmark were captured outside the repository first. All six
migrations then applied cleanly to a copy of that export (SQLite 3.43.2, foreign
keys on): `foreign_key_check` empty, `integrity_check` ok, every workspace and
linked sign-in account preserved, every existing account kept in the private
cohort. No existing session carries credential proof after `0019`, so each user
re-enters credentials once before a sensitive action, as designed.
