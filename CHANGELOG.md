# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Entries record what happened, not
what was planned; superseded entries stay.

## [Unreleased]

## [0.1.0] - 2026-09-05

Milestone M0: scaffold and quality gates. No product features yet.

### Added

- Single Cloudflare Worker serving a React 19 + Vite 8 single-page application
  from Workers Static Assets and a Hono 4 JSON API under `/api`.
- `GET /api/health` returning the validated environment name.
- Runtime configuration validation (`src/worker/env.ts`) that fails closed with
  a JSON 500 and a logged reason when `APP_ENV` is missing or unknown.
- Hardened response headers on API responses (CSP `default-src 'none'`, HSTS,
  `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`) and on
  static responses via `public/_headers`.
- CSRF origin check on state-changing requests (Hono `csrf` middleware).
- TanStack Router file-based routing with a root layout shell and a home route
  that loads the health check through a schema-validated API client.
- Tailwind CSS 4 design tokens (brand palette, semantic surface/ink/line
  tokens, light and dark schemes) in `src/client/styles/app.css`.
- Quality gates wired as npm scripts and proven to fail on deliberate defects:
  Prettier, ESLint 10 (type-checked, unicorn, import-x, react-hooks,
  react-refresh), `tsc -b` across three project references, stylelint, knip,
  dpdm, jscpd, gitleaks, `npm audit`, semgrep, Vitest with coverage
  thresholds, Playwright + axe end-to-end smoke, production build.
- Vitest projects: `unit-client` (jsdom), `unit-worker` (Node), `workers`
  (real workerd via `@cloudflare/vitest-pool-workers`).
- Husky pre-commit hook running gitleaks on the staged diff and lint-staged.
- GitHub Actions workflow with quality, e2e, and semgrep jobs; actions pinned to
  commit SHAs; semgrep image pinned by digest.
- `.npmrc` with `save-exact`, `engine-strict`, and `min-release-age=7`.
- Documentation: `README.md`, `PLAN.md`, `SECURITY.md`, `CHANGELOG.md`,
  agent instruction files (`AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot
  instructions).

### Fixed

- `onError` initially converted Hono's CSRF `HTTPException` (403) into a 500;
  caught by the CSRF unit test and corrected to pass `HTTPException`
  responses through.

### Decisions recorded

- TypeScript pinned to 6.0.3 because typescript-eslint's peer range excludes
  6.1+ and TypeScript 7 would silently disable type-aware linting.
- Vitest pinned to 4.1.11 because the Workers pool does not support Vitest 5.
- `compatibility_date` pinned to 2026-08-22, the newest date the Workers pool's
  bundled workerd accepts.
- knip runs without `--strict`: in knip 6 that flag implies `--production` and
  analysed only two files while a real unused dependency went unreported.
- `eslint-plugin-jsx-a11y` and `eslint-plugin-react` deferred (ESLint 9 only);
  axe in e2e and a Lighthouse accessibility budget compensate.
