# Production Deployment — 2026-09-13

Source `4c5a2ed65ed4b6425ebe40befa10db855335d54e` is deployed at
**https://lumafoil.com** as Worker version
`94614672-421b-4ef6-bb85-a577e6f19914`. Direct `origin/main` readback matched that
source commit. The image toolbar action is **Save Image**, retaining its existing
output controls. This receipt uses the operator's local date; hosted checks ran
on 2026-09-14 UTC.

## Build And Deployment

The protected canonical deployment passed all 42 artifact checks and bundle
budgets, including the 138.0 kB initial application shell against its unchanged
140.0 kB ceiling. The built-publication scan passed 2,637 candidate/object checks
and 114 archive entries while comparing all eight configured private values.
No historical exception applied to the current artifact. Existing encrypted
cloud credentials were reused; no new secret binding or schema change was needed.

The first deployment attempt completed its build and stopped at the remote D1
check with Cloudflare error 7403. After the existing Wrangler identity session
refreshed, the read-only migration check succeeded. The complete canonical
deployment was then rerun successfully; D1 reported no pending migrations and
the new Worker uploaded. The failed attempt remains in
`temp/ui-release-deploy-first-attempt.log`.

An encrypted pre-release database backup had passed round-trip verification at
2026-09-14 00:38:19 UTC. Post-release read-only checks found one anchored Owner,
no Admins, and no reduction in existing user, workspace, membership, photo or
watermark counts. This is aggregate preservation evidence, not a byte-for-byte
comparison of every record.

## Hosted Evidence

The retained public receipt `temp/ui-organization-hosted-public.json` records 12 passing
checks: production health and configured sign-in/cloud clients, anonymous 401s
on protected routes, callback no-referrer policy, and exact hashes for the
service worker, offline manifest, updated editor/font/preset product images and
PDF.js worker. Production settings readback reported Logs and Traces disabled.

Sanitized local evidence:

- `temp/ui-organization-deploy-success.log`, SHA-256
  `6eef2ba0538ed9aec56de59ab3e97970da240f1a99019344d87f4abe431e5ac5`.
- `temp/ui-organization-hosted-public.json`, SHA-256
  `625d8d6aa8a9a8986cea964e46b6b86af33cc795bea6200ee10b1c309f31c3df`.
- `temp/ui-release-preservation.json` records the private aggregate check without
  publishing identities or content counts.

## Verification Boundaries

All 128 distinct four-device E2E cases have passing evidence across the initial
run and targeted closures; this is not one uninterrupted green matrix. The
current quality stages passed 2,781 unit/browser tests, 63 real Worker tests,
unchanged coverage floors, build checks and SAST. The canonical quality invocation
and its continued stages retain their separate results. See
[UI integration evidence](ui-organization-2026-09-13.md).

The optional tour, refreshed product captures and four representative rendered
light/dark desktop/phone contrast/layout states passed. The broader screenshot
inventory remains incomplete after retained desktop/tablet failures. Whole-app
WCAG certification, deferred performance and physical-device encoding checks,
offline upgrade verification and the final release tag remain open in PLAN.md.

Google Drive and Dropbox completed real authorization on this deployment. Both
also passed canonical refresh-token exchange and matching provider-account
identity in an isolated, no-log Worker probe. The probe changed no production
rows or expiry timestamps; it did not observe natural token expiry. OneDrive
still requires investigation, and file/folder/share/reconnect workflows remain
open until their live results are recorded in [cloud verification](cloud-storage.md).
