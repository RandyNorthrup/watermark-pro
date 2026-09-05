# CLAUDE.md

Project-local instructions for Claude Code. The full rule set lives in
[AGENTS.md](AGENTS.md); read it first, then `PLAN.md`. This file only adds what
is specific to working in this repository from Claude Code.

## Commands you will use most

```bash
npm run quality          # every local gate; must pass before "done"
npm run test:e2e         # Playwright + axe against the production build
npm run security:sast    # semgrep (needs semgrep on PATH)
npm run cf-typegen       # after editing wrangler.jsonc; commit the result
npm run dev              # local dev server on :5173
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
  instrumented, so worker modules earn coverage from `*.test.ts` files.
- TypeScript `erasableSyntaxOnly` is on: no enums, namespaces, or constructor
  parameter properties.
