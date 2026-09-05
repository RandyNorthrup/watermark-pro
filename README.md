# Watermark Pro

Watermark photographs at scale, beautifully. Bulk jobs, a reusable watermark
library, smart placement that keeps the mark off the subject, auto-contrast, an
editor with crop and resize, storage, sharing, multi-format export, and
role-based access control. A spiritual competitor to eZy Watermark, MIT
licensed, hosted on Cloudflare Workers at `watermark.blowmoney.net`.

**Status:** milestone M0 (scaffold and quality gates) is complete. No product
features are implemented yet. See [PLAN.md](PLAN.md) for the roadmap and
[CHANGELOG.md](CHANGELOG.md) for what has actually shipped.

## Stack

| Layer           | Choice                                                               |
| --------------- | -------------------------------------------------------------------- |
| Runtime         | Cloudflare Workers (one Worker: Static Assets for the SPA, Hono API) |
| Language        | TypeScript 6.0.3 (pinned; see PLAN.md §3.1)                          |
| Frontend        | React 19, Vite 8, TanStack Router, Tailwind CSS 4                    |
| API             | Hono 4, Zod 4                                                        |
| Data (M1+)      | Cloudflare D1 via Drizzle ORM, Cloudflare R2                         |
| Auth (M1+)      | Better Auth with organization roles                                  |
| Tests           | Vitest 4 (jsdom, Node, and real workerd), Playwright + axe           |
| Package manager | npm 11                                                               |

## Requirements

- Node.js 24 (see `.nvmrc`) and npm 11.10 or newer (`min-release-age` support).
- Git.
- [gitleaks](https://github.com/gitleaks/gitleaks) on `PATH` (8.30.1 verified).
  Used by the pre-commit hook and `npm run security:secrets`.
- [semgrep](https://semgrep.dev/) on `PATH` for `npm run security:sast`
  (1.174.0 verified; `pip install semgrep`). CI runs it regardless.
- Playwright browsers for `npm run test:e2e`: `npx playwright install chromium`.
  If the Playwright downloader times out on your network, fetch the zip with
  `curl` and unpack it under `%LOCALAPPDATA%\ms-playwright\` with an empty
  `INSTALLATION_COMPLETE` marker file; that is what was done on the original
  development machine.
- A Cloudflare account for deployment (`wrangler login`). Development and
  tests run fully offline in workerd.

## Installation

```bash
npm ci
```

`npm ci` also installs the Husky pre-commit hook. Copy `.dev.vars.example` to
`.dev.vars` if you need to override any Worker variable locally.

## Development

```bash
npm run dev        # Vite dev server; Worker runs in workerd with HMR
npm run preview    # serve the production build through workerd
npm run build      # production build into dist/
npm run deploy     # build, then `wrangler deploy` to watermark.blowmoney.net
npm run cf-typegen # regenerate worker-configuration.d.ts after editing wrangler.jsonc
```

The dev server listens on `http://localhost:5173`; preview on `:4173`.

## Quality gates

Every command exits non-zero on a finding. Each one was deliberately broken
and observed to fail before being trusted; the log is in PLAN.md §8.

| Command                    | Gate                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `npm run format:check`     | Prettier (with Tailwind class sorting)                        |
| `npm run lint`             | ESLint, type-checked, zero warnings                           |
| `npm run lint:css`         | stylelint, zero warnings                                      |
| `npm run typecheck`        | `tsc -b` over client, worker, and tooling projects            |
| `npm run deadcode`         | knip: unused files, exports, dependencies                     |
| `npm run lint:cycles`      | dpdm: circular imports                                        |
| `npm run lint:dup`         | jscpd: copy-paste, zero tolerance                             |
| `npm run security:secrets` | gitleaks over git history                                     |
| `npm run security:audit`   | `npm audit --audit-level=high`                                |
| `npm run security:sast`    | semgrep (`p/default`, `p/typescript`, `p/react`, `p/secrets`) |
| `npm run test`             | Vitest with coverage thresholds, then the workerd project     |
| `npm run test:e2e`         | Playwright against the production build, with axe             |
| `npm run build`            | Vite production build                                         |
| `npm run quality`          | All of the above except `security:sast` and `test:e2e`        |

`npm run quality` omits semgrep and Playwright so it stays runnable on a
machine without those tools installed. CI runs all three (`quality:ci`, the
e2e job, and the semgrep job) on every push and pull request.

Other test commands: `npm run test:unit` (jsdom + Node projects),
`npm run test:workers` (workerd only), `npm run test:watch`.

## Environment variables

| Name      | Where                                | Values                                         |
| --------- | ------------------------------------ | ---------------------------------------------- |
| `APP_ENV` | `wrangler.jsonc` `vars`, `.dev.vars` | `development`, `test`, `staging`, `production` |

Every variable is validated on the first request an isolate handles
(`src/worker/env.ts`). Secrets, when they exist, go in `.dev.vars` locally and
`wrangler secret put` in production. `.dev.vars.example` is the authoritative
list.

## Project structure

```
src/client/       React SPA (routes/, components/, lib/, styles/)
src/worker/       Hono API on Workers (index.ts entry, env.ts validation)
src/shared/       constants and Zod schemas used by both sides
e2e/              Playwright specs
public/           static files, including _headers for security headers
.github/          CI workflow and Copilot instructions
.husky/           pre-commit hook
```

TypeScript is split into three projects (`tsconfig.client.json`,
`tsconfig.worker.json`, `tsconfig.node.json`) so browser code, Worker code,
and Node tooling each get the right library types. `src/shared` is compiled
under both the DOM and Workers projects and must not touch either runtime.

`worker-configuration.d.ts` is generated by `npm run cf-typegen` and committed;
CI fails if it is stale. `src/client/routeTree.gen.ts` is regenerated by the
router plugin on every dev/build/test run and is git-ignored.

## Deployment

```bash
npx wrangler login
npm run deploy
```

The Worker is named `watermark-pro` in `wrangler.jsonc` and is routed to the
Custom Domain `watermark.blowmoney.net`; wrangler creates the DNS record and
certificate on the first deploy, provided the `blowmoney.net` zone is in the
logged-in account. The `workers.dev` subdomain is disabled. Bindings for D1,
R2, and rate limiting are added in milestone M1 together with the commands to
create them.

These two commands are the only ones in this file that have not been executed
yet: deployment needs the owner's Cloudflare login and is certified in
milestone M8. Everything up to `wrangler deploy` (the build and the workerd
preview of the built artefact) has been run.

## Security

See [SECURITY.md](SECURITY.md) for the reporting process and the list of
controls. Headline items: strict CSP on both API and static responses, CSRF
origin checks, fail-closed configuration validation, secret scanning in the
hook and in CI, dependency audit, semgrep, exact pins with a seven-day release
age, and GitHub Actions pinned to commit SHAs.

## Troubleshooting

- **`tsc -b` reports stale errors after renaming files.** Delete
  `node_modules/.tmp` (build info cache) and rerun.
- **The `workers` test project fails with "compatibility date not supported".**
  `compatibility_date` in `wrangler.jsonc` must not exceed the newest date the
  Workers pool's bundled workerd supports (2026-08-22 for pool 0.22.0).
- **`npm run security:sast` says semgrep is not found.** Add your Python
  `Scripts` directory to `PATH` (on Windows,
  `%APPDATA%\Python\Python3xx\Scripts`).
- **`npm install` refuses a brand-new package version.** That is
  `min-release-age=7` in `.npmrc` doing its job; wait, or pin an older version.
- **knip reports nothing at all.** Do not add `--strict`; in knip 6 it implies
  `--production` and skips everything without a production suffix.
