# CLAUDE.md

Project-local instructions for Claude Code. The full rule set lives in
[AGENTS.md](AGENTS.md); read it first, then `PLAN.md`. This file only adds what
is specific to working in this repository from Claude Code.

## Commands you will use most

```bash
npm run quality          # every local gate; must pass before "done"
npm run test:e2e         # Playwright + axe against the production build
npm run security:sast    # semgrep (needs semgrep on PATH)
npm run audit:lighthouse # UI milestones: desktop budgets against `npm run preview`
npm run audit:screenshots# UI milestones: every screen, light and dark
npm run cf-typegen       # after editing wrangler.jsonc; commit the result
npm run db:generate      # after editing src/worker/db/schema.ts
npm run db:migrate:local # apply migrations to the local D1 database
npm run dev              # local dev server on :5173 (needs .dev.vars + migrations)
```

## Non-negotiables

- Follow `PLAN.md` milestone order and certify each milestone before the next.
- Pin dependency versions exactly after checking peer ranges; record in
  `PLAN.md` §3.1.
- No `any`, `!`, `@ts-ignore`, blanket disables, lowered thresholds, or
  `--legacy-peer-deps`. Escape hatches need an inline reason and a `PLAN.md`
  §9 row.
- No dead code, no magic literals outside `src/shared/constants.ts`, no silent
  fallbacks, no mock data outside tests.
- Update `CHANGELOG.md` and, when decisions change, `PLAN.md` in the same
  change as the code.
- Report gate results faithfully. If a gate did not run, say so.

## Repository quirks worth knowing

- `knip` must run without `--strict` (knip 6 turns that into production mode
  and analyses almost nothing). The `deadcode` script is already correct.
- `compatibility_date` in `wrangler.jsonc` must stay within what
  `@cloudflare/vitest-pool-workers` supports, or the `workers` test project
  cannot start.
- `worker-configuration.d.ts` is generated and committed; CI diffs it.
- `src/client/routeTree.gen.ts` is generated and git-ignored; tests generate it
  through the router plugin in `vitest.config.ts`.
- Coverage is collected only for the jsdom and Node projects; workerd cannot be
  instrumented, so worker modules earn coverage from `*.test.ts` files. Node
  tests run real Better Auth on the memory adapter (`src/worker/test-support`);
  D1-only wiring is verified by `*.workers.test.ts`.
- Page tests replace `src/client/lib/auth-client` with the fake in
  `src/client/test-support/fake-auth-module.ts` and render the real router.
- Never `(await response.json()) as T` in worker tests: Cloudflare types make
  `json<T>()` generic, so ESLint's fixer deletes the assertion. Parse with Zod.
- `vite dev` and `vite preview` must both serve on :5173 (the `APP_URL`
  origin); the same-origin guard rejects other origins.
- TypeScript `erasableSyntaxOnly` is on: no enums, namespaces, or constructor
  parameter properties.
