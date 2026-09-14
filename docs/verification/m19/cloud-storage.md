# Cloud Storage and Native Sharing — 2026-09-12

## Current Live Closure — 2026-09-13

The shared runtime correction is live. Google Drive and Dropbox now complete
real authorization. Both passed real refresh-token exchange and matching account
identity through the canonical crypto/token code in an isolated no-log Worker.
The probe changed no production rows or expiry timestamps, and retained returned
credentials only as encrypted, DPAPI-protected evidence. Natural expiry was not
observed. Private finite summaries are under `temp/private-config/`.

Google's live UI journey created a synthetic QA folder, saved and reopened a
480 × 320 PNG, created a native public link, revoked it back to private access,
and reused the connection from a fresh Lumafoil page without OAuth. The QA folder
and file were moved to recoverable Trash. Dropbox file-flow checks are ongoing.

OneDrive reached successful token exchange but failed identity parsing. Source
`a31b1f7`, deployed as Worker `e16ff83b-fa27-4984-ad0e-a4ba9361faf2`, records only
finite private callback audit stage/reason/status fields; the observed result was
`identity / invalid_data`. No provider messages, URLs, codes, tokens or claims
were recorded. Microsoft's discovery endpoint matches the pinned UserInfo URL.
Its [UserInfo contract](https://learn.microsoft.com/en-us/entra/identity-platform/userinfo)
makes name/email claims conditional on availability. The parser now keeps `sub`
mandatory and uses available name claims, email, or the actual subject for its
bounded display label. Four intended failures with the previous required-name
parser and two still-rejected missing-subject controls establish the regression;
the corrected focused suite passed 47 cases. The live OneDrive retry remains
pending until this parser correction is deployed.

The earlier checkpoints below retain their original scope. They are not current
claims that every provider remains disconnected or that the revised UI has a
complete screenshot certification.

## Earlier Deployment Checkpoint — 2026-09-12

The durable-connection changes are deployed at `https://lumafoil.com` from source
commit `0d764ec`, Worker version `fbbf320b-9041-4801-8373-f8d7fb022191`.
All four cloud secret bindings were accepted and migrations 0013–0017 applied.
The [deployment receipt](deployment-2026-09-12.md) records twelve passing hosted
public checks and a fresh browser showing all three Connect controls enabled.
No provider was connected during that observation. Live consent and provider
storage/refresh round trips remain separate, unverified acceptance evidence.
The complete screenshot/axe inventory is recorded in [audit verification](audit-inventory.md).
Provider registration preparation and production binding are complete; Microsoft
Cloud Storage's two retired SPA callbacks were removed after the server deployment.

## Connections and Account Boundaries

Google Drive, Dropbox and OneDrive use confidential authorization-code flows with
S256 PKCE. Connect is an explicit user action. Each random state is stored as a
SHA-256 digest and bound to the exact Lumafoil account, session and provider.
Attempts expire after ten minutes and are consumed atomically once. Replaying a
callback, returning it under another account/session, or cancelling an old popup
cannot replace a newer connection.

Access tokens, refresh tokens and temporary PKCE verifiers are encrypted with
AES-GCM using an HKDF-derived key. Authenticated data binds each ciphertext to its
account, provider and credential purpose. The encryption key remains a Worker
secret. Browser state receives only short-lived access tokens in memory for direct
provider transfers; refresh credentials never reach browser storage, application
caches, logs or public configuration.

The account page lists connected cloud accounts and explicit Connect/Disconnect
actions. A cloud account may differ from the Google/Microsoft account used to sign
in to Lumafoil. Connections belong to the individual user, regardless of which
workspace is open or shared. Workspace access does not share cloud credentials.

A reload or another browser session reuses the server connection. Expired access
tokens refresh under an atomic D1 lease. Concurrent requests wait for that refresh
instead of opening consent. Refresh rotation replaces encrypted credentials only
while the connection generation and lease still match. Disconnect or a newer
connection prevents late refresh/callback responses from restoring old access.
Changing a provider client ID requires reconnecting the associated grant.

Transient provider failures remain visible and retryable. Revoked/insufficient
grants require an explicit reconnect. Token/profile responses are bounded to
128 KiB; arbitrary provider error text is never reflected in application errors.
Cloud operations require a connection; this does not change the separate offline
queue for Lumafoil photos, gallery saves, presets and folders.

## Folder Browsing and Original Files

The shared browser provides folder navigation, breadcrumbs, folder creation,
selection and explicit save destinations. Image defaults to supported photos;
Documents requests PDFs, Video requests supported video containers and Bulk can
request all three. Downloads retain the original bytes. Native Google Docs are
not silently exported or converted; the selected editor validates/decode-checks
the resulting media.

Google retains the narrow
[drive.file permission](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
Only authorized items appear in its list. Browse Drive opens Google's native
Picker to authorize additional files or a destination folder without another
OAuth consent flow. Shared-drive API operations include the appropriate
supportsAllDrives flags; access still depends on the actual per-file grant.

Dropbox lists folders within the registration's actual access boundary.
DROPBOX_ACCESS_TYPE defaults to app_folder and the UI explicitly labels that
limitation. Set it to full only with a matching Full Dropbox registration and
fresh grant. Changing a configuration label never expands provider permissions.
A chosen path stays relative to the granted root, with traversal and unsafe names
rejected.

OneDrive navigates the connected account's own drive through Microsoft Graph.
It does not claim that arbitrary SharePoint sites or another user's drives are
available through the current Files.ReadWrite scope.

Every destination carries the provider account identity and connection generation.
A changed app account or replaced cloud connection invalidates that destination.
In-flight transfers are aborted on account/connection changes and stale results
are not shown. Pagination is bounded; Graph next links remain on the same folder
endpoint. Preauthenticated download/upload URLs are validated against exact
provider domain boundaries and never receive bearer headers. Authenticated API
writes refuse redirects.

## Saves and Native Links

All providers preserve existing files. Dropbox uses add plus autorename;
OneDrive uses rename; Google creates a new file. The UI asks for a destination
before generating exports. Programmatic callers without an explicit destination
retain compatible defaults: Lumafoil folders in Drive/OneDrive and the granted
Dropbox root.

Large media uses resumable uploads: Google above 5 MiB with 8 MiB chunks,
Dropbox above 128 MiB with 8 MiB chunks, and OneDrive sessions with 5 MiB aligned
chunks. Completed file identities are accepted only after provider acknowledgement.
A failed batch reports confirmed files separately and stops before later files;
an unacknowledged request is not declared saved.

Saving does not create a public link. Saved Cloud Files offers a separate explicit
public-link action and provider management link. Google requests an undiscoverable
anyone/reader permission; OneDrive requests view/anonymous access; Dropbox creates
or finds that file's direct shared link. Revoke removes the represented native
link/permission, not the file or other existing folder permissions. Provider
policy refusals remain visible.

The current saved-file/link list is temporary page state. Returning later does
not reconstruct that list; existing access can be managed at the provider.
Native cloud links complement Lumafoil gallery links.

Disconnect immediately clears the local server grant. Google and Dropbox also
attempt provider revocation. If remote removal cannot be confirmed, the response
and UI say so. Microsoft local disconnect does not claim global consent removal:
the UI links separately to personal-account and work/school permission settings.

## Deployment Configuration

Migration 0016 creates encrypted connections and exact-session attempts.
Migration 0017 adds first-party workspace folders and their independent content
placement revisions. Both are applied in production, together with migrations
0013–0015; the canonical deploy confirmed the remote database current.

Use distinct confidential Web callbacks:

| Provider     | Callback                                         | Required Worker Secret        |
| ------------ | ------------------------------------------------ | ----------------------------- |
| Google Drive | https://lumafoil.com/api/cloud/google/callback   | GOOGLE_CLOUD_CLIENT_SECRET    |
| Dropbox      | https://lumafoil.com/api/cloud/dropbox/callback  | DROPBOX_APP_SECRET            |
| OneDrive     | https://lumafoil.com/api/cloud/onedrive/callback | MICROSOFT_CLOUD_CLIENT_SECRET |

CLOUD_TOKEN_SECRET must be independently generated with cryptographic randomness,
at least 32 characters, and retained securely for decryption. Losing/changing it
makes existing grants unusable and requires reconnecting. Public IDs remain
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_PICKER_APP_ID, DROPBOX_APP_KEY and MICROSOFT_CLIENT_ID.
The Picker API key remains server configuration and is exposed only as needed
through the existing public-config contract. Secrets belong in .dev.vars locally
and Worker secret bindings in production; .dev.vars.example lists all names.

The Full Dropbox registration's public application identifier is explicitly
recognized by the publication scanner, alongside the two retired public IDs.
The three allowlist patterns match whole identifiers only; they do not exclude
files, rules, app secrets or OAuth tokens. A real scanner test accepts the
registered public ID and rejects an unrelated 15-character Dropbox app-secret
canary in the same configuration file. This is a public-identifier classification,
not a credential exception.

Google requests drive.file plus access_type=offline. Dropbox requests
token_access_type=offline with files.content.read, files.content.write,
files.metadata.read, sharing.read, sharing.write and account_info.read.
Microsoft requests openid, profile, offline_access and Files.ReadWrite using a
confidential Web callback. Account-sign-in registrations and cloud-file grants
remain separate.

Google branding publication does not establish OAuth audience publishing status:
external apps left in Testing can receive refresh tokens with a seven-day
lifetime. The live Audience console was checked on 2026-09-12 and reports External,
In production. Microsoft uses a Web registration rather than the shorter-lived
SPA refresh model.

### Provider Preparation — 2026-09-12

- Created the owner-approved **Lumafoil Cloud** Dropbox registration with Full
  Dropbox access, the canonical callback, metadata/content/sharing scopes and
  Lumafoil publisher, website, privacy URL and description. Additional users are
  enabled; the console reports Development with a 500-user allowance. This is
  not Dropbox production approval. A fresh Branding page visually confirms both
  the 64-pixel and 256-pixel rose Lumafoil icons. Production now uses the Full
  registration. Removal of the former App Folder registration is not claimed.
- Saved the Google **Lumafoil Web** server callback and created a cloud client
  secret with the owner's approval. The existing account sign-in client was
  not changed. Google Audience is In production, independently of branding
  verification status.
- Saved a Web callback on **Lumafoil Cloud Storage** for OneDrive and created
  the approved 180-day client secret. The console gives an expiration date of
  **2027-03-11**; replace this secret before expiry to preserve refresh and new
  connections. After deploying the server flow, the two retired SPA callbacks
  were removed and the saved authentication table showed only the Web callback
  `https://lumafoil.com/api/cloud/onedrive/callback`. No separate sign-in app changed.
- Captured each new credential through encrypted transfer and protected local
  staging. Generated an independent cryptographically random cloud-token
  encryption key. None of these values is in the repository or documentation;
  all four were subsequently accepted as production Worker secret bindings.

Microsoft's console reports that this application lacks a verified publisher.
The owner confirmed on 2026-09-12 that no verified Microsoft Partner Center
account/MPN ID is available. Publisher verification is therefore deferred;
external work/school access depends on each tenant's administrator/consent policy.
This is an explicit provider limitation, not permission to weaken those policies
or claim universal work/school consent. It does not require blocking the entire
invitation-only service while other supported sign-in and storage paths work.
Website/domain branding alone does not complete publisher verification. External
work/school tenants can require administrator approval, particularly for newly
registered multitenant applications requesting file permissions. Do not weaken
tenant consent policies to bypass that requirement. See Microsoft's
[publisher verification policy](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview).
Personal-account and external-tenant round trips remain separate acceptance
checks; successful client-secret creation is not proof of user consent.

## Request Metadata Privacy

Both local and production Wrangler configurations disable observability,
invocation logs, log persistence and trace persistence. The deploy Wrangler
supports redact_query_string but the pinned Workers test Wrangler does not; that
unsupported setting was removed. Privacy relies on supported disabled-log/trace
controls, not an ignored redaction flag.

Sanitized application diagnostics remain in the admin client-error and health
views. Authentication diagnostics retain fixed classifications while omitting
provider bodies and stacks. Worker errors use route templates rather than raw
request URLs. Request IDs are generated on the server; caller-supplied IDs cannot
inject private content into logs or D1 reports. Callback HTML has no scripts,
tokens or postMessage payload, uses no-store and no-referrer, and directs the
user back to the existing Lumafoil window.

The release owner's read-only production Worker overview check on 2026-09-12
explicitly showed Workers Logs and Workers Traces disabled. The canonical custom
domain remains configured, and the `workers.dev` endpoint is disabled. The
release owner repeated this readback after deployment: the new version received
100% of traffic with Logs/Traces and `workers.dev` still disabled. External Tail
Workers remain a separate request-metadata boundary.
Do not use live tail while processing real OAuth callbacks. Zone-level HTTP
request logs are separate controls: remove URL queries and bearer-link paths
from any such external export or disable that job for this application.

The release owner's read-only dashboard inspection on 2026-09-12 closed the
Logpush inspection gap left by an API 403. The exact account's Investigate →
Logpush page displayed no configured jobs and 0 GB. Selecting `lumafoil.com`
showed a Free-plan zone with the Logpush feature unavailable and a Contact Sales
offer, rather than configured jobs. This is dashboard-observed absence of
account jobs and zone feature availability, not a successful API response or a
claim that an API returned an empty job list. No dashboard setting was changed.
The separately observed disabled Worker logging/tracing and any external Tail
Worker checks remain distinct from this Logpush evidence. The historical probe
and current configuration correction are recorded in
[platform observability privacy](platform-observability-privacy.md).

## Verification and Remaining Gates

The combined focused run passed 190 tests across 30 files:
temp/cloud-final-focused.log. It covers account/session isolation, PKCE and
encryption, state replay, generation changes, refresh contention and rotation,
provider errors/scopes, folder navigation, original PDF/video bytes, chosen save
destinations, large upload acknowledgements, native sharing, account settings,
and logging privacy. TypeScript passed in temp/cloud-final-typecheck.log.

Two real-D1 connection tests passed with the supported Wrangler configuration:
temp/cloud-d1-final.log. They exercise atomic claims, leases,
encrypted storage, cancellation and generation isolation using the actual
migration-backed store. First-party folder proofs are recorded by that subtask.

The canonical `npm run quality` completed successfully after integration:
temp/quality-staged-release.log, process exit 0. All 2,742 unit/browser tests and
61 workerd tests passed. Coverage was 92.43% statements, 85.17% branches, 92.2%
functions and 93.33% lines, with every original threshold retained. Bootstrap,
gate, performance, publication and asset suites passed, along with all 42 built
artifact checks. Source and built publication scans passed; dependency audit
reported no vulnerabilities and the application shell stayed within its bundle
budget. Additional cloud tests cover delayed modal completion, cancelled consent,
remote revocation refusal, pending refresh and provider download boundaries.

The separate staged-source SAST passed 509 rules over 2,098 targets with zero
findings. The four-device E2E case inventory is closed through the initial 88
passes and the corrected 49-case rerun, with nine repeated setup cases; this is
128 distinct passing cases across two runs, not one clean full-matrix run. See
[quality verification](quality.md) and [release E2E triage](release-e2e-triage.md)
for the logs, exact accounting and remaining gates.

The consolidated screenshot/axe inventory now covers all 752 required combinations
with 800 PNGs across completed profile runs. These completed local checks do not
replace real Google/Dropbox/Microsoft connect → browse →
load → save → share → revoke round trips, reload/refresh reuse, or final production
verification. Simulated provider responses do not establish console correctness,
tenant-policy support or a successful live grant.
No new dependency was added by this cloud work; obsolete browser OAuth paths
were removed.

## Live Connection Failure and Runtime Repair — 2026-09-13

The live Google Drive, OneDrive personal-account and Dropbox connection journeys
all reached their authenticated Lumafoil callbacks and displayed **Cloud
Connection Not Completed**. Google showed the previously granted app-selected
Drive-file permissions; Microsoft reused the approved personal account without a
new consent prompt. Dropbox reached the new Full Dropbox application's exact
permission request, and the owner explicitly approved that persistent grant at
the action point. No remote QA files, folders or public links were created by
these failed attempts. Existing photo tabs and the persisted editor draft were
preserved; the separate Bulk task page contains only a synthetic QA image.

The release owner verified that a fresh live Google attempt's encrypted PKCE
verifier decrypts with the prepared encryption key using the canonical crypto
implementation. A separate private real-workerd probe then isolated the shared
failure: `redirect: 'error'` throws before the outbound provider request. Plain
fetch, `cache: 'no-store'`, and `redirect: 'manual'` with that cache setting reach
Google's token endpoint and return the expected `invalid_grant` response for a
deliberately invalid authorization code. The error-mode negative control still
fails before the provider responds. This is executable runtime evidence; the
documented redirect enum alone did not establish support in the deployed runtime.
The sanitized five-mode receipt is retained under ignored
`temp/private-config/cloud-runtime-probe-result.json`. No real authorization
codes, tokens, provider response bodies or callback URLs were logged or published,
and no OAuth live tail was used.

The server now uses manual redirects for credential exchange, provider identity
lookups and revocation. Provider JSON requests reject every non-success response
below HTTP 400 before reading its body, including every redirect; they never
follow `Location`. Revocation reports a redirect as unsuccessful while still
clearing local credentials. Browser-side transfer rules are unchanged.

The new workerd regression constructs real runtime `Request` objects before
returning synthetic provider responses. Both cases failed against the old mode:
the successful exchange could not start, and the redirect-refusal case observed
zero constructed requests. After the fix, the final focused command passed all
43 tests across four files, including the existing real-D1 lifecycle tests:

```sh
node node_modules/vitest/vitest.mjs run --project unit-worker --project workers src/worker/cloud/provider-tokens.test.ts src/worker/cloud/connections.test.ts src/worker/cloud/provider-tokens.workers.test.ts src/worker/cloud/connections.workers.test.ts
```

Evidence: `temp/lumafoil-cloud-runtime-redirect-red.log` and
`temp/lumafoil-cloud-redirect-final-tests.log`. The cases cover successful
exchange/account identification, confidential request fields, five redirect
statuses for each provider without body reads or follow-up requests, and
accepted/refused/redirected/unavailable revocation. Focused ESLint and the full
TypeScript build also passed. The native-constructor fixture is not presented as
a live provider round trip; the independent runtime probe supplies that narrower
outbound-fetch evidence.

The repaired source still requires the combined release and successful live
connect → browse → load → save → share → revoke journeys. A fresh Lumafoil page
reusing a connection will prove persistence, but not by itself a refresh-token
exchange: the canonical server reuses the encrypted access token until it is
within 60 seconds of expiry. No production token expiry was changed to manufacture
refresh evidence.

Primary protocol references:
[Google Web-Server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Google Token Expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
[Dropbox OAuth Guide](https://developers.dropbox.com/oauth-guide),
[Microsoft Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[Microsoft Refresh Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens),
[Microsoft UserInfo](https://learn.microsoft.com/en-us/entra/identity-platform/userinfo).
