# Operations runbook

This runbook covers release and recovery for `https://lumafoil.com`. Select the
production environment explicitly. Keep account/database/user identifiers,
exports, bookmarks, credentials, cookies and raw provider responses in private
operator records, outside version control. The ignored `temp/` directory is for
temporary local evidence, not durable backups.

## Identify the deployment

Read the current production configuration in `wrangler.jsonc`, then verify the
Cloudflare identity and target bindings:

```powershell
npx wrangler whoami
npx wrangler d1 info DB --env production
npx wrangler d1 execute DB --remote --env production --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id"
```

Use the explicit `SELECT` for a read-only preflight. The installed Wrangler
`d1 migrations list` implementation initializes its bookkeeping table with
`CREATE TABLE IF NOT EXISTS`; it is therefore excluded from observation-only
checks. Applying migrations remains a deliberate release step below.

`DB` and `BUCKET` bind D1 and private R2 storage. Objects use workspace-scoped
keys. `AUTH_RATE_LIMITER`, `API_RATE_LIMITER` and `IMPORT_RATE_LIMITER` enforce
configured request limits. Production email uses the Cloudflare sending binding;
`support@lumafoil.com` is the public support contact. The canonical origin is
`https://lumafoil.com`; migration does not require legacy-domain redirects.
Target lookups may print identifiers: keep their output private.

## Release preparation

Reconcile `PLAN.md` and run the required quality, E2E/axe, SAST, screenshot,
Lighthouse and hosted checks. Focused results are not full release certification.
Automated browser gates use isolated storage and generated test secrets, separate
from manual QA and production. E2E, screenshots and Lighthouse share the one
synthetic global Owner in `scripts/lib/test-site-owner.ts`, with independent
sessions. The helper uses the console-only `/api/dev/promote-site-owner`
endpoint and verifies a fresh owner-role session before preparing its workspace.

Before schema or identity changes:

1. Capture a private D1 export and current Time Travel bookmark. Verify a
   recoverable copy of required R2 objects separately.
2. Record aggregate preservation counts and verify the intended site owner
   privately. Pause writers and cleanup when restoring or splitting existing
   data; restoring a database does not merge concurrent changes.
3. Review pending migrations and Worker compatibility. Complete explicit
   operator steps before opening access.
4. Stage complete matching settings and secrets. `env.ts` rejects incomplete
   provider/Turnstile pairs; half-configured running versions can return errors.

### Private admission and the initial owner

Site invitations create separate private accounts, never membership in the
inviter's workspace. Collaboration is a separate explicit operation. Exactly
one anchored global Owner exists; workspace ownership does not grant that role.

The unmerged M19 membership cutover (`0018_private-membership.sql`) preserves
historical private accounts, content and explicit workspace grants. Historical
accepted invitations do not spend the new grant. Up to two oldest live pending
promises per inviter survive; excess pending promises are revoked. Review those
pending rows before an eventual gated deployment and tell affected members to
reissue only after a reserved slot is freed. Reusable links share the two-new-
admission budget; accepted spend is permanent even after recipient deletion or
rotation. The own-account budget distinguishes used, reserved and available.

New rows default to pending. The initial-owner bootstrap explicitly selects
private membership, while keeping its email unverified until the normal mailbox
flow. Run that tool only after all current migrations; the historical owner
selection path remains a distinct reviewed procedure. A signup whose invitation
is revoked during creation stays pending and receives no workspace access even
if email verification later succeeds. Do not activate such rows with blanket SQL:
the intended invitation/identity must be reviewed, and a removed unadmitted row
can retry normal admission. Public registration stays closed until quotas and
billing policy are certified. Do not treat challenge success, payment or a
workspace role as private membership or site-administration authority.

The subsequent unmerged credential migration (`0019_recent-authentication.sql`)
adds a nullable session proof. Existing sessions remain usable for ordinary
authorized reads/saves/editing but must sign in again before invitations,
sharing/access changes, deletions, administration, cloud credential operations
or billing. A verified-email session or a renewed session is not fresh credential
proof. Operators must not backfill timestamps or repair refusals by changing
session dates. Complete the normal challenged sign-in; roles and membership
remain server checked afterward. Same-account sign-in retains a selection only
after current membership is checked. The dialog returns to a bounded internal
page and never automatically retries the refused mutation. Runtime `77f6a9a`
passed exact-commit implementation quality, SAST and all 144 device journeys in
workflow `37009328785`; final prompt captures were viewed. M19 release gates and
deployment remain separate, and no production enforcement is claimed.

### Stripe account boundary — 2026-10-03

Lumafoil uses a new separate Stripe business account under the owner's login.
The first renewed CLI authorization selected an unrelated account and performed
readback only; no catalog, payments or remote secrets were provisioned there.
A CLI project/profile name is a local credential label, not an account-creation
operation. Verify the actual Lumafoil account ID and test/live mode before every
provisioning batch; fail closed on mismatch. The official Stripe Codex plugin is
installed and enabled, but that does not establish an authenticated Lumafoil
connection. The separate account and test monthly catalog/portal are verified in
[the current account receipt](verification/m19/stripe-account-2026-10-03.md).
Live charges/payouts and submitted business details remain false. Complete actual
business activation, fees/tax review, permanent scoped credentials and sandbox
lifecycle verification before enabling billing. Public registration remains closed.

Service keys remain outside the public repository and are never pasted into chat,
CLI arguments, screenshots or logs. The local CLI credentials file is readable
only by its owner. Expiring interactive CLI keys are not production Worker
credentials. Use a dedicated restricted server key and endpoint signing secret
through Worker secrets after account and sandbox verification. Catalog IDs are
public identifiers; they must still be pinned server-side and bound to the intended
account. No successful redirect or client-selected plan establishes paid access.

For a new database, follow [self-hosting](self-hosting.md). The first-owner tool
creates an unverified account with global role `owner`, without generating a
password or creating an Admin account; mailbox verification and normal recovery
finish setup. Inspect the syntax without changing data:

```powershell
node scripts/bootstrap-owner.mjs --help
node scripts/split-empty-workspace.mjs --help
```

Historical migration 0010 accepts an empty database or exactly one account in its
former `admin` representation. Migration `0012_site_roles.sql` upgrades the
existing anchor to `owner` and the other existing accounts to `user`. Do not
rewrite the historical migration or treat today's owner selector as its old
admin-selection workaround.

For a reviewed pre-owner-guard migration procedure, `--existing-user-id` selects
an explicitly named, verified account as `owner` and assigns every other global
role `user`, leaving no admins. Identities, workspace roles, and content remain
unchanged. The current tool is not a migration planner; see the compatibility
boundary in [self-hosting](self-hosting.md#existing-deployments-and-the-anchored-site-owner).
After anchoring, ownership transfer requires a separately reviewed operator
migration. Normal APIs cannot demote/delete the owner, change the anchor,
impersonate users, or replace another user's email or password.

Migration 0008 is a no-op marker. For an old deployment containing only one
confirmed-empty shared workspace, `split-empty-workspace.mjs` takes exact private
target identifiers and the expected membership count. It refuses changed,
populated or active deployments and applies a temporary transactional migration.
Never weaken its guard to move populated content. See
[private accounts](private-accounts.md) for preconditions and ownership checks.

For that legacy transition, apply the remote schema migrations separately,
perform and verify the guarded private-workspace split, and only then run the
deployment command. Do not let its automatic migration-and-publish sequence
expose the new application before the required data split is complete.

### Stripe subscription candidate and activation

The backend candidate's exact API, account boundary, dependency version,
reconciliation policy and remaining gates are recorded in
[Stripe subscriptions](plans/stripe-subscriptions.md). It requires ordered
migrations 0022 and 0023. Billing remains disabled when all Stripe variables are
absent; partial configuration fails closed. No live setting has been provisioned.

Before activation, authenticate the owner in Dashboard and create/verify the
separate Lumafoil business account. Read its actual account ID, sandbox/live mode,
charges/payouts capabilities, country/currency, fees, statement descriptor and
support identity. A named CLI profile is not provider account verification. Never
reuse the unrelated AppBag business account or its CLI keys. Do not print secrets.

Only after account verification and successful sandbox lifecycle tests, create
or verify exact active licensed monthly USD Pro $9 and Team $24 prices, and an
active portal configuration with subscription updates disabled and cancellation
at period end. No annual catalog, trials, coupon or extra-seat settings are
supported. Exact-price reconciliation currently rejects tax-adjusted, credited,
prorated and multi-payment invoices: certify the tax/credit policy before enabling
any such catalog or account behavior.

Register the self-account snapshot webhook at `/api/billing/stripe/webhook` with
API 2026-08-26.dahlia. Subscribe only to checkout.session.completed,
checkout.session.async_payment_succeeded, customer.subscription.created/updated/
deleted, invoice.paid/payment_failed/payment_action_required, charge.refunded,
and charge.dispute.created/updated/closed. Use that endpoint's signing secret;
a local listener signing secret is not a production endpoint secret. Set only
matching account/mode credentials; Worker secret storage holds the secret key and
signing secret, while account/mode/price/portal IDs may be plain configuration.
The CLI's temporary credential is not the long-lived production Worker secret.

Account billing status is read-only at GET /api/me/billing. After returning to
/app/account, the payer explicitly refreshes the relevant pro/team financial
scope through POST /api/me/billing/reconcile. It uses current provider objects,
the same lease and generation fencing as a verified webhook, and can recover a
completed Team purchase without relying on a browser return as payment evidence.
An open Checkout is resumed; a different name requires explicit provider-verified
pending Checkout cancellation before replacement. Do not treat local expiry as
proof that a session or subscription cannot charge.

For delivery failure, inspect sanitized status and event IDs, verify account/mode
and provider connectivity, then resend the same Stripe event. Receipts and leases
make retries safe. Do not edit paid_plan or paid_through manually to unblock an
invoice, and do not acknowledge a failed event as completed. A held lease returns
503 and must be retried; expired leases are fenced from committing. Downgrades
preserve data and existing membership; excess new writes or member admission are
refused by existing atomic quota guards.

The lifecycle candidate closes self/admin removal before Better Auth removes
credential rows. It temporarily bans through a unique server-only banReason
marker, closes pending Checkout or immediately cancels the bound subscription
without a new invoice/proration, and verifies terminal chargeability under the
existing fenced lease. A busy lease or provider failure returns
`BILLING_CLOSURE_PENDING`; credentials remain and only the unchanged temporary
marker is rolled back. Concurrent moderator bans are retained. Paid suspension
and cleared local paidThrough remain after failed removal. Sign in, then use the
account's explicit billing Refresh action (POST reconcile) to verify and recover
a valid provider period, or retry removal. The isolated actual D1 cases prove
this recovery; full integrated/provider gates remain open.

A provider-confirmed closed payer can be deleted across a later webhook/cron
lease. All financial acquire/commit operations require the bound live owner;
late commits fail and removed-owner signed replay becomes an ignored receipt.
Security bans suspend immediately and register provider closure in background
work. Banned chargeable rows remain eligible for the existing cron retry. A
provider outage can delay remote cancellation. Do not clear chargeability or
delete payer rows to resolve that outage; restore configured account/mode/provider
connectivity and let the fenced closure confirm terminal state.

An unrelated local deletion failure after confirmed provider closure may leave
`billing-account-removal-<uuid>` in banReason. Review provider-confirmed closure
for every financial scope before clearing only that temporary marker and retrying
local removal. Never clear a moderation reason or reinstate paid capacity through
manual edits. Financial transfer and retention policy still need a reviewed
workflow. The candidate is not claimed privacy-complete or production-certified.

The original billing payer must keep owner membership while a subscription or
live pending Checkout can charge. Ownership/workspace changes require terminal
provider cancellation and reconciliation first. Account removal runs immediate
closure in its guarded path; portal period-end cancellation is not immediate
closure. A new owner cannot
enter the previous payer's portal; validated financial ownership transfer and
retention/deletion schedules remain open pre-launch decisions. No deletion script
should remove billing receipts/customer/subscription references until financial
retention obligations are explicitly decided. Application content deletion and
Stripe financial retention are separate operations.

### Deploy

PRs targeting `main` run automatic CI. A protected main merge starts the same
canonical quality, Semgrep and four-device checks, then the complete Lighthouse
and screenshot audit matrix before production deployment. Any failure blocks
migrations and publication. The owner may explicitly dispatch `deploy.yml` from
main for a retry; both source guards require the current main commit.
`docs/ci-cd.md` records repository controls and verification boundaries.
An explicitly authorized workstation release uses:

```powershell
npm run deploy
```

`scripts/deploy.mjs` builds for production, applies remote migrations with
noninteractive confirmation, refuses pending migrations, then deploys the
resolved build configuration. These steps are not a transaction across Worker
code, D1, R2, DNS and secrets. If a later step fails, inspect which earlier steps
completed before retrying.

Hosted deployment requires `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the GitHub `production` environment secrets.
Repository copies are removed only after successful scope relocation.
Scope credentials to the account, zone and Worker/D1/R2/email/DNS actions actually
needed. Never publish their values or raw configuration output.

After deployment, verify health/config, invite-only admission, returning
Google/Microsoft login, verification/reset delivery, cross-account gallery and
preset denial, administrator totals, cloud read/write/native sharing, offline
edits/reconnect, and expired/revoked gallery links. Check the canonical origin,
legal pages, provider callbacks/branding and absence of legacy redirects or
injected analytics. A health response alone does not prove these flows.

## Secrets and provider configuration

Local secrets belong in ignored `.dev.vars`; `.dev.vars.example` lists names
without values. Production credentials use Worker secrets. Use interactive
input, never literal credentials in command lines or printed generated values:

```powershell
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put GOOGLE_AUTH_CLIENT_SECRET --env production
npx wrangler secret put MICROSOFT_AUTH_CLIENT_SECRET --env production
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
npx wrangler secret list --env production
```

These are syntax examples, not instructions to rotate every secret each release.
Pair Google account credentials with `GOOGLE_AUTH_CLIENT_ID`; Microsoft with
`MICROSOFT_AUTH_CLIENT_ID` and the configured tenant; Turnstile with
`TURNSTILE_SITE_KEY`. Stage matching changes through a tested version workflow
or planned maintenance window. The deploy script does not make them atomic.

Account callbacks are:

- `https://lumafoil.com/api/auth/callback/google`
- `https://lumafoil.com/api/auth/callback/microsoft`

Account login requests identity scopes only. Cloud storage uses separate client
settings (`GOOGLE_OAUTH_CLIENT_ID`, Picker configuration, `MICROSOFT_CLIENT_ID`,
`DROPBOX_APP_KEY`) and explicit authorization. Do not substitute a cloud client
for an account client or grant file permissions to make login work. Password
users link providers from their authenticated Account page. Microsoft identities
without verified email must complete Lumafoil mailbox verification. Track
credential expiry/renewal in a private operator calendar.

### Rotating the authentication secret

`BETTER_AUTH_SECRET` protects sessions, gallery links, reusable invitations and
stored account-provider token encryption. Replacement invalidates sessions and
outstanding signed flows/links. Existing provider ciphertext is not automatically
re-encrypted. The app currently configures one secret, not a multi-key rotation
mechanism.

Plan rotation with a private backup of the prior configuration, account
recovery/reauthorization, replacement gallery links and rotated reusable
invitation links. Verification/reset flows need fresh messages. A blind rotation
does more than sign users out. Prove recovery on isolated state before changing
production, and never put either secret value in logs.

## Observability and privacy

```powershell
npx wrangler tail --env production --format pretty
npx wrangler tail --env production --status error
```

Application request logs use route patterns and correlation IDs rather than raw
query strings or parameter values. Unexpected-error diagnostics retain safe
classifications and omit raw stacks, database parameters, OAuth state/tokens,
request bodies and arbitrary provider/account objects. Better Call's raw error
fallback is routed through the sanitized Worker handler. The development mailbox
contains verification links and is forbidden in production.

Browser reports carry finite error classifications, bounded same-origin
compiled-JavaScript coordinates and known route shapes with content identifiers
redacted. Arbitrary exception/rejection messages and stack text are not sent.
The API normalizes direct callers again, and raw user-agent strings are not
stored. These application controls remain necessary even with platform
observability disabled.

Persistent Cloudflare Worker logs and traces are disabled in both Wrangler
environments. A hosted probe showed that even sanitized custom console records
retain request paths in platform enrichment when invocation logs are disabled;
query-string redaction cannot remove bearer credentials embedded in paths.
Query redaction remains configured as a defense, but it is not permission to
enable persistent request-context logs. See the
[hosted privacy evidence](verification/m19/platform-observability-privacy.md).

Live `wrangler tail` remains available with platform persistence disabled. Its
envelope still contains URLs, including path and query values, so use it only
for an authorized investigation and keep captured output in private operator
storage. Do not publish raw tails, provider events, identifiers or screenshots.
Application D1 diagnostics, scheduled health checks and audit records remain
independent of platform-log persistence. The site administrator can inspect
totals, moderation, audits, health and errors; workspace audit routes require
that workspace's owner/admin role. Recent-work history is user-specific.

After deploying this configuration, confirm **Workers Logs Disabled** and
**Workers Traces Disabled** on the exact production Worker, verify the generated
deployment configuration and check administrator diagnostics. This local change
does not erase previously stored provider events; review their retention and
access separately. Re-enabling persistence requires a reviewed design and new
hosted proof that bearer paths cannot reach stored metadata. The temporary
probe's passing checks are not production deployment evidence.

## Database backup and restore

Use the binding and an explicitly private output location:

```powershell
npx wrangler d1 export DB --remote --env production --output <private-backup.sql>
npx wrangler d1 time-travel info DB --env production
```

Replace angle-bracket parameters before running commands. Keep exports and
bookmarks in access-controlled storage outside the repository. Time Travel
currently retains seven days on Free and thirty on Paid; verify the plan and
available bookmark. Restoring overwrites D1 and cancels in-flight queries.
Capture a current recovery bookmark first.
[Cloudflare Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

For SQL-export recovery, use [the private replay preparation guide](recovery-sql.md)
before executing the export. The verified legacy export failed direct D1 replay
because data preceded a referenced table. The preparation helper verifies the
recorded hash and produces tables, data, then indexes/triggers in a new private
directory outside Git. It executes no backup rows and contacts no database.
Keep a replay target unserved until all phases and independent integrity,
account-preservation and access checks pass. See
[the isolated D1 rehearsal](verification/m19/d1-restore-rehearsal.md) for the
actual missing-table failure, successful replay and guarded workspace split.

```powershell
npx wrangler d1 time-travel restore DB --env production --bookmark <private-bookmark>
```

D1 recovery does not restore R2 objects. An older snapshot can reference deleted
objects or roll back upload receipts and admission state. Pause writers and
scheduled cleanup, restore coordinated state, reconcile D1 references with R2,
and verify private access before resuming. This repository does not provide an
automatic coordinated D1-plus-R2 disaster restore.

## Storage and failed uploads

Gallery/logo APIs verify session, supplied account binding, workspace membership
and role. Offline replay requires the expected account binding. Stream caps
precede parsing; individual file sizes and signatures are also checked. D1
atomically reserves count and the shared photo/logo byte budget, including
thumbnails, before R2 writes.

Metadata, audit and committed receipt form one D1 batch. A lost database reply
cannot delete a committed file. Deletion first removes accessible metadata and
persists cleanup. Failed R2 deletion keeps its quota charge and retries on later
uploads and scheduled maintenance. Do not delete receipts/reservations to clear
a quota warning.

Inspect private `upload_reservation` status counts and scoped usage when
troubleshooting. Restore D1/R2 availability so recovery can retry. Committed and
deleted receipts prevent duplicate or resurrected offline uploads. Migration
0009 charges old thumbnails the former 1 MiB maximum because their actual size
was not recorded; new uploads record exact sizes. Database guards prevent
referenced-logo deletion and workspace deletion with content/pending cleanup.

Installed Wrangler `r2 object` supports `get`, `put` and `delete`; it has no
`r2 object list`. Use the dashboard or authenticated R2 API for scoped inventory.
Normal deletion must use the app to coordinate metadata, audit and cleanup.
Manual object operations require a private inventory and a matching database
reconciliation plan.

## Worker rollback

```powershell
npx wrangler deployments list --env production
npx wrangler rollback <compatible-version-id> --env production
```

Choose a known compatible version from available history. Worker rollback
changes code and associated configuration, not D1/R2 data.
[Cloudflare rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

The migrations are not all behaviorally additive. Singleton-admin constraints,
private admission, operator workspace splitting and upload reservations change
required invariants. Older code may omit controls or disagree with the schema.
Do not cross those boundaries without a reviewed compatible release and an
explicit data/secret recovery plan. Prefer a tested forward fix when rollback
would reopen admission or bypass storage recovery.

## Incident actions

| Situation                 | Action                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposed gallery link      | Revoke it in the authorized workspace. New requests fail; prior downloads cannot be recalled.                                                         |
| Exposed native cloud link | Revoke/change permissions with that provider; gallery-link revocation does not revoke provider links.                                                 |
| Abusive account           | The site administrator bans it; server sessions and pending targeted/reusable invitations are revoked. Existing invitees remain independent accounts. |
| Credential exposure       | Identify the affected credential privately and plan its full rotation/recovery impact without publishing secret material.                             |
| Bad release               | Check code, schema, configuration and secret compatibility before choosing rollback or a forward fix.                                                 |
| Corruption/deletion       | Pause writers/cleanup, capture recovery points, restore coordinated D1/R2 state and verify isolation.                                                 |
| Reserved storage          | Inspect durable cleanup/status counts and service failures; restore connectivity rather than deleting receipts.                                       |
| Missing email             | Check provider settings, verified sender/domain and delivery errors without logging verification links.                                               |
| Revoked offline session   | Server access fails at the next identity check/reconnect; revocation cannot remotely erase disconnected copies.                                       |

Rate-limit values live in `src/shared/constants.ts` and Wrangler bindings; change
them together. Invitation/referral limits live in `src/shared/api-accounts.ts`.
Re-run boundary and concurrency tests when changing those policies.
