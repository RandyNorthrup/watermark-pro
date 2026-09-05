# Copilot instructions

This repository follows the rules in `AGENTS.md`; read it and `PLAN.md` before
suggesting changes. In brief:

- Milestones are worked in the order given in `PLAN.md` §6 and certified
  before moving on.
- `npm run quality` must pass. Never suggest lowering coverage thresholds,
  disabling lint rules, `any`, non-null assertions, `@ts-ignore`, or
  `--legacy-peer-deps`.
- Dependencies are pinned exactly after checking peer ranges, and recorded in
  `PLAN.md` §3.1.
- No dead code, no magic literals outside `src/shared/constants.ts`, no silent
  fallbacks, no mock data outside tests.
- Every input is validated with a Zod schema from `src/shared`; every response
  carries the security headers.
- TypeScript `erasableSyntaxOnly` is on: no enums, namespaces, or parameter
  properties.
- Update `CHANGELOG.md` with every meaningful change.
