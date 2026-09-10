# Domain and provider migration verification

Updated 2026-09-10. Live deployment evidence with explicit post-launch gaps.
The public repository records configuration shape and outcomes; live account
identifiers, user records, credentials and private operational logs remain in
ignored operator records.

## Canonical domain and deployment

The app's only intended production origin is **https://lumafoil.com**. The owner
requires an actual migration, without redirects from retired app domains.
Preserve existing accounts and stored data. Existing Worker, D1 and R2 resource
identities remain stable unless an explicitly guarded operator migration changes
their contents.

The new Cloudflare zone is active. Turnstile recognizes the new hostname.
The repository's About description now names Lumafoil and its website points to
`https://lumafoil.com`; that metadata was independently read back. The existing
source repository URL remains the footer's GitHub target.
The production cutover completed on 2026-09-10. A private D1 export and Time
Travel bookmark preceded the changes. Migrations 0005–0011 applied, and the
guarded empty legacy-workspace operation preserved the existing accounts while
giving each its own private workspace. The sole-administrator anchor and empty
content state passed aggregate verification. Worker version 43 then deployed
the complete static asset set and custom domain.

Public DNS, TLS, production health, CSP/HSTS/nosniff, detailed landing content,
GitHub footer, provider configuration, uninvited-signup refusal and anonymous
admin/photo denial passed. Phone and desktop anonymous browser checks cover Home,
Login, Signup and Privacy with zero axe findings or horizontal overflow. The
retired app hostname has no DNS record and no redirect; its Turnstile allowance
was removed. Do not modify unrelated sites or tenant-wide policies.

Cloudflare's zone-level Web Analytics setting still injects a beacon that the
application CSP blocks. The app has no other observed browser errors. Disable
Web Analytics completely in the Lumafoil zone, then repeat the console check.

## Email

**support@lumafoil.com** is a working Microsoft 365 shared mailbox. Direct sign-in
is blocked; access and Send As are limited to the existing licensed operator.
No new mailbox license was purchased. Shared sent-item copies are enabled.

Exchange MX, autodiscover, SPF and both Microsoft DKIM selectors are configured.
Existing Cloudflare sending records remain, so **no-reply@lumafoil.com** can send
transactional mail independently. Actual inbound and Send As messages arrived;
the receiving provider reported SPF, DKIM and DMARC pass. Private message IDs,
headers and account identities are not published.

## Google

The existing Google project and cloud-picker client use Lumafoil branding,
lumafoil.com policy URLs and authorized browser origins. A separate confidential
account-sign-in client registers these Web callbacks:

- `https://lumafoil.com/api/auth/callback/google`
- `http://localhost:5273/api/auth/callback/google`

Account sign-in requests only basic identity scopes; Drive access uses the
separate picker client and `drive.file`. Public client identifiers do not grant
access without a user's OAuth consent. The replacement Picker API key has API
and HTTP-referrer restrictions and is stored as an encrypted Worker binding.
The old key was deleted and its GitHub alert resolved as revoked; see
[the retirement record](picker-key-rotation.md).
Both Google Drive API and Google Picker API were confirmed in the project's
enabled-services inventory on 2026-09-09.
The project display name is now Lumafoil; its immutable resource identity was
preserved.

The OAuth audience is External / In production. Search Console verified domain
ownership through a single public DNS TXT record; Google was not granted DNS
account access. Keep the ownership record.

Actual Google invited account creation, sign-out and returning sign-in without
another invitation passed on the local built app. The first delayed manual
attempt exceeded the signed-state-cookie window; the retry succeeded. Source now
uses an app-specific cookie namespace and aligned state/cookie expiry, retaining
state validation. Final hosted proof is still required.

Google branding verification must be resubmitted once the new homepage and
privacy page are reachable. The current console displays the previous attempt's
unreachable-page and domain-ownership errors; it no longer lists a logo error.
Ownership has since been verified and the owner-approved rounded icon is in
place. The console explicitly reports that data-access verification is not
required for the configured scopes. This does not constitute branding approval;
do not mark issues fixed until the hosted pages are reachable.

## Dropbox

A new Lumafoil scoped **App Folder** registration replaces the retired one.
PKCE public clients, production/localhost callbacks and Chooser hosts are
configured. Read, write, metadata-read and sharing scopes were saved; no contacts
or account-write scope was added.

Additional development users are enabled, subject to Dropbox's 500-user
development limit. Both approved rounded icon sizes, name, description, publisher
and policy URLs are configured. Actual read/write/link/revocation checks remain
open; obtain provider production approval before exceeding its limit.

## Microsoft

The cloud-storage registration uses Lumafoil branding, policy URLs, publisher
domain and these SPA callbacks:

- `https://lumafoil.com/oauth/microsoft`
- `http://localhost:5273/oauth/microsoft`

A separate confidential account-sign-in registration supports work/school and
personal accounts. The owner approved Microsoft Platform Policies before its
creation. Its Web callbacks are:

- `https://lumafoil.com/api/auth/callback/microsoft`
- `http://localhost:5273/api/auth/callback/microsoft`

The preferred icon and publisher domain were applied. Confidential credentials
are stored in ignored local configuration and encrypted production Worker
bindings. Google account credentials were installed through the same bounded
configuration update; existing authentication and Turnstile secrets were
preserved. The existing Worker remained healthy afterward. This installed
configuration without deploying the new account-sign-in application code.
Rotation reminders belong in private operator records.
The separate cloud app's declared Microsoft Graph permissions were checked:
delegated `Files.ReadWrite` and `User.Read`, with no application permission or
tenant-wide grant added.

Actual invited Microsoft account creation and returning sign-in passed on the
local built app. The callback required Lumafoil email verification before access;
after verification, returning sign-in entered a separate one-member private
workspace without another invitation. Tenant-wide consent was not granted.

Microsoft can restrict consent to new multitenant apps without verified
publishers. Respect tenant policies. Hosted identity proof, OneDrive file consent
and real read/write/sharing checks remain open.

## Release evidence boundary

Provider setup, local protocol tests, live configuration and mailbox delivery do
not substitute for interactive hosted consent journeys. Google/Microsoft invited
account entry, Drive/Dropbox/OneDrive read/write/native link creation and
revocation, verification/reset mail, reconnect sync and cross-account denials
remain post-launch checks on the deployed origin. Mobile Lighthouse timing also
remains open by the owner's explicit launch decision. Only synthetic screenshots
and redacted evidence belong in the public repository.
