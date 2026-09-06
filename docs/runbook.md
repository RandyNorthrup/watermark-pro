# Operations runbook

How to deploy, roll back, rotate secrets, inspect and recover the production
deployment at `https://watermark.blowmoney.net`. Every command assumes an
authenticated `wrangler` (`npx wrangler whoami`) on an account that owns the
`blowmoney.net` zone, the `watermark-pro` D1 database and the `watermark-pro`
R2 bucket.

## Topology

| Piece          | Name                                                         | Notes                                                       |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Worker         | `watermark-pro`                                              | `env.production` in `wrangler.jsonc`; serves SPA and `/api` |
| Custom domain  | `watermark.blowmoney.net`                                    | Managed by wrangler on deploy                               |
| D1 database    | `watermark-pro`                                              | id `e142b088-c663-4276-bd39-5ded21775fb1`                   |
| R2 bucket      | `watermark-pro`                                              | Private; objects under `org/<organizationId>/…`             |
| Rate limiters  | `AUTH_RATE_LIMITER`, `API_RATE_LIMITER`                      | 10/min and 120/min per address                              |
| Email          | Cloudflare Email Sending, `no-reply@watermark.blowmoney.net` |                                                             |
| Bot protection | Turnstile (optional)                                         | Enabled when both Turnstile variables are present           |

## Deploy

### From CI (preferred)

Pushing a tag that starts with `v` runs `.github/workflows/deploy.yml`: the
full quality chain and the Playwright suite on the tagged commit, then
`npm run deploy` inside the `production` GitHub environment.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`: an account token with Workers Scripts: Edit, D1:
  Edit, Workers R2 Storage: Edit, Email Sending: Edit and Zone DNS: Edit for
  `blowmoney.net` (custom-domain provisioning).
- `CLOUDFLARE_ACCOUNT_ID`: from the Workers overview page.

### From a workstation

```bash
npm run deploy
```

`scripts/deploy.mjs` builds with `CLOUDFLARE_ENV=production`, applies pending
D1 migrations with `CI=true` (so wrangler never waits for a confirmation
prompt), refuses to continue if any migration is still unapplied, then runs
`wrangler deploy --env production`. Verify:

```bash
curl -s https://watermark.blowmoney.net/api/health
curl -s https://watermark.blowmoney.net/api/config
```

## Roll back

Workers keep the last ten uploads. List and roll back without rebuilding:

```bash
npx wrangler deployments list --env production
npx wrangler rollback --env production            # previous version
npx wrangler rollback <version-id> --env production
```

Rollback does not undo D1 migrations. Migrations here are additive (new
tables and columns only), so an older Worker keeps working against a newer
schema. If a future migration is destructive, restore the database first (see
Time Travel below) and then roll the Worker back.

## Secrets and variables

Secrets are stored on the Worker, never in the repository or CI logs.

```bash
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
npx wrangler secret list --env production
```

Non-secret variables live in `wrangler.jsonc` under `env.production.vars` and
ship with the next deploy. The Turnstile site key is public and belongs there:

```jsonc
"vars": { "TURNSTILE_SITE_KEY": "0x4AAAAAAA…" }
```

The Worker validates its environment on the first request an isolate handles
(`src/worker/env.ts`). Setting only one of the two Turnstile variables makes
every request fail with a configuration error, so set both or neither.

### Rotating `BETTER_AUTH_SECRET`

Rotation signs everybody out and invalidates every share link, because share
tokens are keyed from the same secret. Announce it, then:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" \
  | npx wrangler secret put BETTER_AUTH_SECRET --env production
```

Existing share rows stay in D1; owners can re-create links from the gallery.

## Observability

```bash
npx wrangler tail --env production --format pretty
npx wrangler tail --env production --status error
```

Workers Logs (observability is enabled in `wrangler.jsonc`) keep structured
logs in the dashboard under Workers & Pages → watermark-pro → Logs. The
application logs one line per unexpected error with the method, path and
stack; it never logs request bodies, tokens or addresses.

## Database

### Inspect

```bash
npx wrangler d1 execute watermark-pro --remote --env production \
  --command "select count(*) as users from user"
npx wrangler d1 migrations list watermark-pro --remote --env production
```

### Backups and point-in-time restore

D1 Time Travel keeps thirty days of history on the paid plan.

```bash
npx wrangler d1 time-travel info watermark-pro --env production
npx wrangler d1 time-travel restore watermark-pro --env production \
  --timestamp 2026-09-06T12:00:00Z
```

Restore is a full-database operation; take a bookmark first
(`time-travel info` prints the current one) so the restore itself can be
undone. R2 has no time travel: photo deletions remove the object at once.

### Migrations

Generated by `npm run db:generate` from `src/worker/db/schema.ts`, applied by
the deploy script. To apply by hand:

```bash
npm run db:migrate:remote
```

## Storage

```bash
npx wrangler r2 object list watermark-pro --prefix org/<organizationId>/
npx wrangler r2 object delete watermark-pro <key>
```

Per-organization usage is visible in the admin console (Organizations tab)
and comes from D1, not from listing the bucket.

## Platform administration

The first platform administrator is promoted directly in D1; after that the
admin console can promote others.

```bash
npx wrangler d1 execute watermark-pro --remote --env production \
  --command "update user set role = 'admin' where email = 'randy.northrup@gmail.com'"
```

The console at `/app/admin` can search users, ban and unban them with a
reason, grant or remove the platform role, sign a user out everywhere, list
organizations with member and storage counts, and browse the global audit
trail. Every one of those actions is itself audited.

## Incident playbook

| Situation                 | Action                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Leaked share link         | Owner or admin revokes it from Gallery → Shares; the token 404s immediately                                                    |
| Abusive account           | Admin console → Users → Ban with reason; sessions are revoked and sign-in is refused                                           |
| Credential stuffing       | Rate limiter already returns 429; lower `AUTH_RATE_LIMITER.limit` in `wrangler.jsonc` and redeploy if needed; enable Turnstile |
| Suspected secret exposure | Rotate `BETTER_AUTH_SECRET` (above); rotate the Turnstile secret in the dashboard and `secret put`                             |
| Bad deploy                | `wrangler rollback`; open an issue with the version id                                                                         |
| Data corruption           | D1 Time Travel restore to a timestamp before the incident                                                                      |
| Runaway storage           | Admin console shows per-organization bytes; quotas are constants in `src/shared/constants.ts`                                  |
| Email not arriving        | `wrangler tail --status error` for Email Sending failures; check the sender address is verified in the dashboard               |

## Rate limits

| Limiter             | Applies to                                | Limit           |
| ------------------- | ----------------------------------------- | --------------- |
| `AUTH_RATE_LIMITER` | sign-in, sign-up, reset, verification     | 10 / 60 s / IP  |
| `API_RATE_LIMITER`  | other auth endpoints, public share routes | 120 / 60 s / IP |

`src/shared/constants.ts` mirrors these values so the client and the
`Retry-After` header stay accurate. Change both places together.
