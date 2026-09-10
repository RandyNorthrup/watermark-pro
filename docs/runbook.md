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
npx wrangler d1 migrations list DB --remote --env production
```

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
synthetic owner in `scripts/lib/test-site-owner.ts`, with independent sessions.

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
one anchored site administrator exists; workspace ownership does not grant it.

For a new database, follow [self-hosting](self-hosting.md). The first-owner tool
creates an unverified owner without generating a password; mailbox verification
and normal recovery finish setup. Inspect the syntax without changing data:

```powershell
node scripts/bootstrap-owner.mjs --help
node scripts/split-empty-workspace.mjs --help
```

Migration 0010 accepts an empty database or exactly one existing administrator.
An occupied database with zero or multiple administrators fails closed. Before
that migration, the bootstrap tool's `--existing-user-id` selects an explicitly
named verified owner, preserving accounts/content while normalizing site roles.
After anchoring, an ownership transfer requires a separately reviewed operator
migration. Normal APIs cannot add another administrator or demote/delete the
owner, change the anchor, impersonate users, or replace another user's email or
password.

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

### Deploy

Version tags matching `v*` trigger `.github/workflows/deploy.yml`. Deployment
requires its quality/generated-source/E2E gates and the shared pinned Semgrep
workflow to succeed on that tag. Branch/PR CI calls the same SAST workflow and
generated-Worker-types action. Review the tagged commit, workflow
origin, GitHub environment and remaining release gates before publishing a tag.
A workstation release uses:

```powershell
npm run deploy
```

`scripts/deploy.mjs` builds for production, applies remote migrations with
noninteractive confirmation, refuses pending migrations, then deploys the
resolved build configuration. These steps are not a transaction across Worker
code, D1, R2, DNS and secrets. If a later step fails, inspect which earlier steps
completed before retrying.

CI requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub secrets.
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
