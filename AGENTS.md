# Agent instructions — Lumafoil

These rules apply to every AI coding agent and every human contributor. They
are project-local; never modify global agent memory, IDE settings, or
machine-wide instructions from this repository.

## Read first

1. `PLAN.md` — decisions, milestones, certification checklists, tracked escape
   hatches. A milestone is not done until its checklist is green.
2. `CHANGELOG.md` — what actually shipped. Update it in the same change as the
   code.
3. `SECURITY.md` — controls the project commits to.

## Workflow

- Work milestone by milestone in the order given in `PLAN.md` §6. Do not start
  the next milestone before the current one is certified.
- Before adding a dependency: check its peer ranges against what is installed
  (`npm info <pkg> peerDependencies`), pin the exact version, and record the
  decision in `PLAN.md` §3.1 with the source of the verification.
- Run `npm run quality` before declaring anything done. Run `npm run test:e2e`
  and `npm run security:sast` for UI and security-relevant changes, and
  `npm run audit:lighthouse` plus `npm run audit:screenshots` when certifying a
  UI milestone.
- Never pass `--legacy-peer-deps`, never use `--no-verify`, never lower a
  coverage threshold or disable a rule to get green. Fix the code.
- If a gate cannot run on your machine, say so explicitly. A gate reported as
  passing when it was never executed is the single failure this project is
  designed to prevent.

## Code standards (enforced by the gates)

- **Constants:** no unexplained magic numbers, strings, booleans, or timeouts.
  Tunables live in `src/shared/constants.ts` or typed config objects. Idiomatic
  literals (`0`, `1`, `-1`, `2`, `100`, empty collections, index `0`) are fine.
- **Dead code:** none. No commented-out code, unused exports, unused files,
  unused dependencies, or stale configuration. knip, tsc, and ESLint enforce
  this; do not add ignore entries to satisfy them without a written reason.
- **Honesty:** no silent fallbacks, placeholder implementations, or mock data
  outside `*.test.ts`, `e2e/`, and named fixtures. A function that cannot do
  its job throws or returns a typed error; it never returns an empty success.
- **Escape hatches:** no `any`, no `!`, no `@ts-ignore`, no blanket
  `eslint-disable`. A `@ts-expect-error` or targeted rule suppression needs an
  inline reason and a row in `PLAN.md` §9.
- **TypeScript:** `erasableSyntaxOnly` is on — no enums, namespaces, or
  parameter properties. Use `as const` objects and literal unions.
- **Imports:** type-only imports use `import type`; externals first, then one
  block of project-local imports, alphabetised (ESLint auto-fixes).
- **Shared code:** `src/shared` compiles under both DOM and Workers libraries
  and must not reference `window`, `document`, or Workers bindings.
- **Naming:** kebab-case file names except TanStack route files
  (`__root.tsx`, `$id.tsx`), which follow the router convention.
- **Formatting:** Prettier owns formatting. Never fight it with lint rules.

## Testing rules

- New behaviour ships with tests that fail without the change.
- Assert behaviour, not downstream symptoms. Give assertions a case that must
  come back negative so a broken check is distinguishable from a passing one.
- API routes get positive and negative tests per role: owner, admin, editor,
  viewer, non-member, anonymous. The Node harness in `src/worker/test-support`
  runs real Better Auth on the memory adapter; use it rather than mocking auth.
- Coverage thresholds (lines 90, statements 90, functions 90, branches 85) are
  load-bearing. If a branch is unreachable, delete it rather than lowering the
  bar.
- Worker code is unit-tested in Node (`*.test.ts`) for coverage and
  integration-tested in workerd (`*.workers.test.ts`) for binding wiring.
- UI changes: run Playwright with axe; zero violations is the bar.

## Security rules

- Validate every input at the boundary with a Zod schema from `src/shared`.
- Never trust client-supplied MIME types, sizes, or IDs; check on the server.
- Never log secrets, tokens, or full request bodies.
- Every response carries the security headers; API responses use the locked
  policy in `src/worker/index.ts`, static responses use `public/_headers`.
  Keep the two in sync when adding origins.
- Secrets go in `.dev.vars` locally and `wrangler secret put` in production.
  `.dev.vars.example` must list every variable the Worker reads.
- Pin everything: npm versions exact, GitHub Actions by commit SHA, container
  images by digest.

## Documentation rules

- `README.md` contains only commands that have been run successfully and
  features that exist. No aspirational claims.
- `CHANGELOG.md` records what happened, including fixes to mistakes made
  earlier in the same milestone.
- `PLAN.md` is updated whenever a decision, assumption, or open question
  changes. Convert relative dates to absolute ones.
- Comments explain why, not what. Keep JSDoc on exported symbols.

## Communication

- Status updates: short and direct. Documentation, comments, commit messages,
  and `PLAN.md` rationale: complete and thorough. Brevity applies to chat only.
- Commit messages follow Conventional Commits and explain the why when it is
  not obvious from the diff.
