# Production deployment — 2026-09-12

The integrated changes are deployed at **https://lumafoil.com** from source commit
`0d764ecf9c88a002ac41fde24ca0cc02fba7a188`. Cloudflare reports Worker version
`fbbf320b-9041-4801-8373-f8d7fb022191`. The canonical protected deployment completed
with exit 0. This receipt uses the release owner's local date, 2026-09-12 PDT;
the public hosted check completed at 2026-09-13 04:46:41 UTC.

## Applied configuration and migrations

All four new Worker secret bindings were accepted: `DROPBOX_APP_SECRET`,
`CLOUD_TOKEN_SECRET`, `MICROSOFT_CLOUD_CLIENT_SECRET` and
`GOOGLE_CLOUD_CLIENT_SECRET`. Their values remained in protected transfer/storage
and are absent from this receipt. The deployment build passed all 42 artifact
checks and bundle budgets. Its protected built-publication scan passed 2,640
candidate/object checks and 114 archive entries while comparing all eight
configured private values, with no historical masks or accepted findings applied
to the current artifact.

The deploy applied migrations 0013 through 0017: guidance claims, workspace
access, invitation budgets, encrypted cloud connections and workspace folders.
The subsequent remote migration check reported the database current before
uploading the Worker. A fresh encrypted pre-cutover backup was verified before
these changes.

After deployment, read-only production checks confirmed the intended sole Owner,
absence of Admins and preservation of existing users, workspaces, photos and
presets. These checks wrote no rows. Private identities and content counts are
intentionally omitted from the public receipt.

Microsoft Cloud Storage registration cleanup was saved after the server callback
deployment. Its authentication table now contains only the Web callback
`https://lumafoil.com/api/cloud/onedrive/callback`; the two retired SPA callbacks
were removed. The separate account sign-in registration was not changed.

## Hosted verification

Post-deployment Cloudflare readback showed the new Worker version receiving
100% of traffic, with Workers Logs and Workers Traces disabled. The `workers.dev`
endpoint remained disabled. A secret-name inspection confirmed all four new
bindings have type `secret_text`; no value was included in public evidence.

The [public hosted receipt](hosted-release-public.json) records **12 passing
checks**:

- Health reports the production environment; the published sign-in/cloud client
  configuration matches the expected registrations.
- Anonymous requests receive 401 from cloud connections, platform workspace
  administration and the Google cloud callback. The callback also retains the
  no-referrer policy.
- The deployed service worker, offline manifest, template/font product images,
  light/dark editor images and PDF.js worker match the expected local SHA-256
  values exactly.

A fresh production browser tab displayed Image with New, Snap To Grid, the text
symbol controls and Manage Access. The existing 800 × 600 photo restored. The
current browser account correctly remained an ordinary User; it was not treated
as the site Owner. Account Settings showed all three cloud Connect buttons
enabled, each provider not connected, and the Microsoft tenant-consent note.
This is a focused hosted UI observation, separate from the earlier complete
local [screenshot inventory](audit-inventory.md).

## Evidence and remaining boundaries

The retained sanitized logs are:

- `temp/protected-publication-deploy.log`, SHA-256
  `b024c0806a52b784b1cc7770c46fbd8504366a06fe2fefe25e174cf1c2f105a5`.
- `temp/cloud-secret-bindings.log`, SHA-256
  `5c2681c80b4b36cd6ac9ed300ffb85152371988285b6520512db840018caca56`.
- `temp/hosted-release-public.json`, SHA-256
  `c1a059d740724de55e1f7b36780bfb53b9c36c854af5557f9073fa41c1f4c140`.
- `temp/post-release-preservation.json` retains the private operator preservation
  receipt; the public outcome above contains no account identity or content count.

No real Google Drive, Dropbox or OneDrive grant has been established during this
release verification. Consent, folder browsing, load/save/share/revoke and
refresh/reload reuse remain unverified against live provider accounts. Enabled
Connect buttons and configured credentials do not establish those round trips.
Microsoft publisher verification remains deferred because no verified Partner
Center/MPN account is available; some work/school tenants require administrator
approval. Lighthouse/performance remains after launch under the owner's existing
direction.

The source commit and production deployment are complete. This receipt accompanies
publication of the deployed source; remote-HEAD verification is recorded
separately. The owner requested stopping for the night. The pending Google
attempt was cancelled through the app, all providers remained Not Connected,
and no scope was granted. Live provider checks and performance work are left for
the next session. Earlier local quality,
E2E and screenshot evidence retains its original run distinctions in
[quality verification](quality.md).
