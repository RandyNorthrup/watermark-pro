# Private accounts, invitations, and account sign-in

Implemented during the M19 production-readiness work on 2026-09-08. This document
describes the account boundary; cloud-file connections have separate clients and
permissions.

## Admission and workspace access

Lumafoil registration is invitation-only. Every verified, signed-in user can
invite someone, regardless of their role in a collaboration workspace.

| Action                           | Result                                                                                  | Information visible to the inviter                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Send an email invitation         | One account admission for the exact email, valid for seven days                         | The address they entered, expiry, and pending/accepted/revoked/expired status                          |
| Share a personal invitation link | Recipients can create independent accounts; the owner can replace or disable the link   | Their own link and the number of accounts created through it; no recipient profiles or email addresses |
| Invite a workspace member        | An already admitted account can deliberately join that separate collaboration workspace | Workspace membership and role, as allowed by the workspace permissions                                 |

A site invitation never creates membership in the inviter's workspace. New
accounts start with a separate personal workspace. Its owner is its only member;
membership invitations, member changes, and deleting the personal workspace are
refused by the authentication server. A separate workspace can be created for
intentional collaboration. The Members screen explicitly explains that a
workspace invitation grants access to its photos and presets.

Targeted invitations are limited to 20 per inviter per hour. Reusable links admit
at most 100 distinct email reservations per owner per day; retrying the same
pending email does not spend another reservation, and replacing a link does not
reset the limit. Reservations and limits are enforced by conditional D1 writes.
The sent-invitation list returns the newest 100 targeted invitations. Referral
recipient addresses are excluded from that list.

The sole site administrator can read aggregate registered-account, verified-account,
pending-invitation, and accepted-invitation counts. Ordinary users receive 403.
These counts do not contain names, addresses, workspace data, or file IDs.
Existing owner user-management and audit views retain their separately
authorized administrative scope. Account impersonation, administrative password replacement, and administrative identity rewriting are disabled. Workspace owners are not site administrators.

## Google and Microsoft sign-in

Dedicated confidential Web clients authenticate accounts. They request
`openid`, `profile`, and `email`; they do not request file access. Client-supplied
cloud scopes are rejected on account sign-in and linking endpoints. File
providers must be connected separately inside the app.

Configure these server variables in pairs:

| Provider  | Variables                                                                                       | Production callback                                |
| --------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Google    | `GOOGLE_AUTH_CLIENT_ID`, `GOOGLE_AUTH_CLIENT_SECRET`                                            | `https://lumafoil.com/api/auth/callback/google`    |
| Microsoft | `MICROSOFT_AUTH_CLIENT_ID`, `MICROSOFT_AUTH_CLIENT_SECRET`; optional `MICROSOFT_AUTH_TENANT_ID` | `https://lumafoil.com/api/auth/callback/microsoft` |

Microsoft's default tenant is `common`, supporting personal and work/school
accounts. Local callbacks replace the origin with `http://localhost:5273`.
Production secrets are installed with Wrangler, never shipped in client config.
The public config exposes only whether account providers are enabled.

New OAuth identities pass the same invitation gate as password registration.
Better Auth carries a server-controlled invitation hash through its state/cookie
flow; client `additionalData` cannot supply that trusted state. Admission is
checked at the user-creation boundary, including callbacks. Returning, linked
identities do not need another invitation.

Email ownership is mandatory. Google or Microsoft identities without a verified
email claim receive a Lumafoil verification email and no session until that email
is verified. Microsoft usernames and `preferred_username` are not treated as
proof of mailbox ownership.

Existing password accounts link providers explicitly from **Account settings**
while signed in. Automatic linking by matching email is disabled. Linking uses
the same email and a fresh authenticated session; returning sign-in then works
with that provider. The login page explains this recovery path when social
sign-in cannot finish.

Access and refresh tokens are encrypted at rest. ID tokens are discarded after
callback verification: the installed Better Auth implementation does not encrypt
every ID-token write path. Provider avatar URLs are discarded at creation, so
displaying a profile does not contact an external image server.

Record provider credential expiration dates in private operator records. Rotate
credentials before their provider-recorded expiry, install the replacement Worker
secret, verify sign-in and linking, then retire the old credential. Never commit
credential values or account-specific operator records.

## Account and offline boundaries

Online app navigation validates the live cookie identity before reading cached
workspace data. Account changes clear private query state, invalidate in-flight
responses, and notify other tabs. The app does not render a route's old account
while the active offline owner differs. Session expiry locks the UI and preserves
pending offline work for its original account; explicit sign-out clears local
private storage only after the pending-work check.

`x-lumafoil-account-id` binds authenticated requests to the account whose UI
initiated them. Mismatched live sessions are refused before reading or mutating
data. Offline create replay additionally requires that header alongside its
operation ID. This is an account-consistency check, not an authentication token.
Better Auth organization/account operations use the same binding. Workspace
reads check membership before returning tenant data and use the same refusal for
unknown and inaccessible workspace identifiers. API responses default to
`Cache-Control: no-store`.

## Existing empty-account cutover

Legacy deployments with only an initial empty shared workspace can be split into
personal workspaces through a guarded operator procedure. Record deployment
identifiers, account identities, and operational observations privately.

Migration `0008_isolate_initial_accounts.sql` is a no-op journal marker. It
contains no deployment identity or data-selection instruction. The original
unpublished version had only been a no-op locally; it was never applied remotely.
Actual empty-workspace splitting is now an explicit operator action through
`scripts/split-empty-workspace.mjs`, with identifiers supplied privately at runtime.

Before using that tool, capture a D1 export or Time Travel bookmark and recheck the
database. The operator supplies the exact account, database ID, workspace ID, and
expected member count. Its guard requires that the selected workspace comprises
the entire initial deployment, with matching users/members, zero sessions,
invitations, private mappings, presets, logos, photos, and shares. If those
conditions changed, investigate rather than weakening the guard.

The tool applies a temporary D1 migration, preserving user IDs, verification,
password accounts, site roles, and audit history. It replaces only the confirmed
empty shared workspace with one personal workspace and owner membership per
account. The temporary SQL/config files are removed after execution and never
belong in the public repository. Wrangler documents transaction rollback for
failed migrations: [D1 migration application](https://developers.cloudflare.com/d1/wrangler-commands/).

Migration `0010_sole_site_admin.sql` anchors an already-single administrator and
adds database constraints and triggers preventing another administrator, owner
demotion/deletion, or changes to the ownership anchor. An empty database is ready
for the explicit bootstrap procedure. An occupied database with zero or multiple
administrators fails closed. Before applying it, an operator may explicitly
select a verified existing owner with the bootstrap tool's
`--existing-user-id` option; this changes roles only and never chooses an arbitrary
account. Keep that identifier in private operator records.

After operator work, verify account counts remain unchanged, each personal
workspace has one matching owner, the former shared workspace is absent, and
there is exactly one anchored site administrator. Test ordinary users against
another account's gallery/library and the global-count API. Domain migration does
not require or install legacy-domain redirects.

## Verification limits

Admission also requires a present, verified, non-banned inviter on each lookup,
including a callback after OAuth consent. An application ban revokes all pending
targeted invitations and the reusable link. Unbanning does not reactivate those
records; new invitations or a rotated link are required. Deleting an inviter
cascades their invitation/link rows without merging or removing invitees'
independent accounts. Recipients receive the ordinary invalid-invitation error,
not the inviter's moderation details.

Authentication cookies use the `lumafoil` prefix. The signed OAuth state cookie
and persisted state both last ten minutes; the cookie comparison remains
mandatory. This fixes the earlier five-minute cookie expiry during a longer
provider consent flow. A pending invitation is retained only in the originating
tab's session storage so an interrupted OAuth attempt can be retried. It is
cleared after successful authentication or an account change. Tokens are not
added to OAuth error callback URLs or diagnostic logs.

Authentication diagnostics retain sanitized messages and known error
classifications while discarding arbitrary state, provider-token, request-body,
stack, and account fields. Unhandled Worker failures also omit raw database
errors and SQL parameters from logs. Development email is restricted to the
console provider in non-production environments; its mailbox is a test tool and
must never be enabled on a deployed production origin.

Logout does not send global `Clear-Site-Data`. That earlier policy could wipe a
newer account's device queue when an old response arrived late. Session
revocation and API `no-store` remain; the client awaits cleanup scoped to the
departing account. Public service-worker assets do not contain private data.
The account-boundary browser race tests remain required before certification.

API request limits count bytes from the actual stream, including requests with
missing or misleading `Content-Length`. JSON/auth requests allow 256 KiB. Photo
multipart requests allow the photo and thumbnail ceilings plus 64 KiB framing;
logo requests allow the logo ceiling plus the same framing. Individual file
limits and signature validation still apply after parsing.

Photo and logo uploads share the workspace storage budget. D1 reserves both
count and bytes atomically before any R2 writes; thumbnails, logos, pending
uploads, and pending deletion cleanup all count. Metadata, audit, and the
committed receipt are one D1 batch. Different lease keys fence abandoned writers
from retries. A lost commit acknowledgment cannot delete an already saved file.
Deletion removes accessible metadata and saves a durable cleanup job before
physical object deletion. Failed cleanup keeps its quota reservation and retries
on subsequent uploads and scheduled maintenance. A retained deletion receipt
prevents an old offline upload from recreating a deleted item.

Migration 0009 records exact thumbnail sizes for new uploads. Pre-existing
thumbnails receive the former 1 MiB upload ceiling as a conservative charge;
their previous rows did not record actual size. Removing those legacy photos
releases the charge. Database triggers also prevent dangling or foreign logo
references and prevent workspace deletion while saved content or pending
storage cleanup exists.

Focused tests cover real Better Auth handlers and memory-adapter routes, real D1
provisioning and quota writes, a guarded migration with a populated-data rollback
case, and authentication/invitation UI behavior. OAuth tests replace only provider
transport responses; state, cookies, callbacks, linking, admission, and database
hooks remain real. Actual Google and Microsoft invited signup and returning
sign-in were also verified on the local preview; Microsoft required Lumafoil
email verification before admission. Production email delivery, final
four-device Playwright/axe, full quality, and deployment verification remain
separate release gates. See the current evidence in
`docs/verification/m19/private-accounts.md`.
