# PLAN.md — Watermark Pro

Living planning document. Decisions, assumptions, open questions, architecture,
milestones, and certification gates. Update it whenever a decision changes.
`CHANGELOG.md` records what happened; this file records what is intended and why.

Last updated: 2026-09-05 (M0 certified)

---

## 1. Product summary

Watermark Pro is a web application for watermarking photographs, positioned as a
spiritual competitor to eZy Watermark. It is MIT licensed, hosted on Cloudflare
Workers at `watermark.blowmoney.net`, and is built to enterprise-grade security
standards with role-based access control.

### Required capabilities (from the product brief)

| #   | Capability                                                                                                                               | Milestone                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| R1  | Watermark photos with text, symbol, or image watermarks                                                                                  | M2, M4                               |
| R2  | Bulk watermarking of many photos in one job                                                                                              | M5                                   |
| R3  | Library of saved, reusable watermarks                                                                                                    | M3                                   |
| R4  | Smart Apply: analyse each photo and choose the best watermark placement                                                                  | M2                                   |
| R5  | Watermark contrast auto-chosen by default, manually adjustable                                                                           | M2, M4                               |
| R6  | Watermarked photos stored in the app after processing                                                                                    | M6                                   |
| R7  | Share from the app                                                                                                                       | M7                                   |
| R8  | Export in multiple image formats                                                                                                         | M5                                   |
| R9  | Editor to create custom watermarks and apply library watermarks                                                                          | M4                                   |
| R10 | Editor supports crop and resize                                                                                                          | M4                                   |
| R11 | Wide variety of fonts and symbols to choose from                                                                                         | M3                                   |
| R12 | Fully secure, enterprise grade                                                                                                           | every milestone; hardening in M8     |
| R13 | RBAC for users                                                                                                                           | M1, M8                               |
| R14 | Modern, beautiful UI and UX                                                                                                              | M1 design system; every UI milestone |
| R15 | Hosted on the owner's Cloudflare account at **watermark.blowmoney.net** (updated 2026-09-05; the brief originally said no custom domain) | M0 config, M8 certification          |

---

## 2. Assumptions

Each assumption is a default taken because the choice is cheap to reverse now
and expensive to block on. If any is wrong, say so and the plan will be revised.

| ID  | Assumption                                                                                                                                                                                                                                                                              | Why this default                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Package manager is **npm 11** (lockfile v3).                                                                                                                                                                                                                                            | Installed, no pnpm/yarn present.                                                                                                                                                                                                          |
| A2  | CI provider is **GitHub Actions**; the repository is **public** on GitHub.                                                                                                                                                                                                              | Confirmed by the owner on 2026-09-05. Public repo means gitleaks, pinned actions, and `SECURITY.md` matter from the first commit.                                                                                                         |
| A3  | Frontend is a **single-page application** (no SSR).                                                                                                                                                                                                                                     | Authenticated tool, not a content site; SPA keeps the Worker stateless and the CSP strict.                                                                                                                                                |
| A4  | Image rendering runs **in the browser** (Web Worker + OffscreenCanvas), not on Cloudflare Workers.                                                                                                                                                                                      | Workers CPU limits make bulk raster work impractical and costly; browser rendering is free, private, and parallel. Server stores results only.                                                                                            |
| A5  | Authentication is self-hosted via Better Auth on D1 with the organization plugin for RBAC. **Whether passwords are used at all is decided by a CPU measurement in M1** (see Q8): magic-link + passkey sign-in is the default if password hashing does not fit the Free plan CPU budget. | No identity provider was specified and SSO was declined (Q2). Better Auth supports both password and passwordless flows without changing the RBAC model.                                                                                  |
| A6  | Transactional email goes through **Cloudflare Email Sending** (the `send_email` binding) behind a provider interface, sending from an address on `blowmoney.net`. A `console` provider exists for local development only and the app refuses to start with it in production.            | Chosen by the owner on 2026-09-05; the sending domain is the zone that also hosts the app (Q7 resolved).                                                                                                                                  |
| A7  | Fonts are **self-hosted** open-licensed families (OFL/Apache) bundled from `@fontsource` packages.                                                                                                                                                                                      | Keeps CSP strict (`font-src 'self'`) and avoids third-party requests from an enterprise app.                                                                                                                                              |
| A8  | Browser support: **evergreen browsers with OffscreenCanvas** (Chrome/Edge 69+, Firefox 105+, Safari 16.4+).                                                                                                                                                                             | Required for off-main-thread rendering.                                                                                                                                                                                                   |
| A9  | Photo formats accepted for upload: JPEG, PNG, WebP, AVIF, GIF (first frame), HEIC where the browser can decode it.                                                                                                                                                                      | Browser `createImageBitmap` coverage.                                                                                                                                                                                                     |
| A10 | Export formats: **PNG, JPEG, WebP** in M5 (native `canvas.convertToBlob`), **AVIF** via WASM encoder as an M5 stretch item.                                                                                                                                                             | Native encoders are zero-dependency; AVIF needs `@jsquash/avif`.                                                                                                                                                                          |
| A11 | The single origin is `https://watermark.blowmoney.net`; the `workers.dev` subdomain is disabled (`workers_dev: false`).                                                                                                                                                                 | Owner supplied the domain on 2026-09-05. One origin keeps cookies, CSP, and share links unambiguous.                                                                                                                                      |
| A12 | The owner has approved installing any tooling the project needs on this machine ("you install whatever is needed", 2026-09-05).                                                                                                                                                         | Global installs are still avoided where a local devDependency works; machine-level installs are listed in README → Requirements.                                                                                                          |
| A13 | Cloudflare **Workers Free** plan for production.                                                                                                                                                                                                                                        | Stated by the owner on 2026-09-05. Consequences: 10 ms CPU per request, 100k requests/day, D1 5 GB and 5 M row reads/day, R2 10 GB. Rendering stays in the browser (A4); server work must be I/O-bound; password hashing is at risk (Q8). |

---

## 3. Resolved decisions

### 3.1 Stack

| Layer          | Choice                                                                                   | Pinned version                                  | Source of verification                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language       | TypeScript                                                                               | **6.0.3**                                       | `npm info typescript-eslint peerDependencies` → `typescript: '>=4.8.4 <6.1.0'` (checked 2026-09-05). TypeScript 7.0.2 is latest but would silently disable every type-aware lint rule. |
| Runtime        | Cloudflare Workers, single Worker serving Static Assets + API                            | wrangler **4.129.0**                            | `@cloudflare/vite-plugin` peer `wrangler: '^4.129.0'`.                                                                                                                                 |
| Build          | Vite                                                                                     | **8.2.2**                                       | `@vitejs/plugin-react@6.1.1` peer `vite: '^8.0.0'`; `@cloudflare/vite-plugin@1.54.4` peer `vite: '^6.1.0 \|\| ^7.0.0 \|\| ^8.0.0'`.                                                    |
| UI             | React                                                                                    | **19.2.8**                                      | `@testing-library/react` peer `^18 \|\| ^19`.                                                                                                                                          |
| Routing        | TanStack Router (file-based, type-safe)                                                  | **1.170.32**                                    | `@tanstack/router-plugin` peer `@tanstack/react-router: '^1.170.32'`.                                                                                                                  |
| Data fetching  | TanStack Query                                                                           | **5.102.8**                                     | —                                                                                                                                                                                      |
| Styling        | Tailwind CSS 4 via `@tailwindcss/vite`                                                   | **4.3.3**                                       | peer `vite: '^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8'`.                                                                                                                                         |
| Primitives     | Radix UI (`radix-ui` unified package), lucide-react icons                                | 1.6.7 / 1.41.0                                  | —                                                                                                                                                                                      |
| API            | Hono                                                                                     | **4.13.7**                                      | exports `./secure-headers`, `./csrf`, `./cors`, `./validator` confirmed.                                                                                                               |
| Validation     | Zod 4                                                                                    | **4.5.4**                                       | better-auth depends on `zod ^4.3.6`; single Zod major across the project.                                                                                                              |
| Database       | Cloudflare D1 via Drizzle ORM                                                            | drizzle-orm **0.45.2**, drizzle-kit **0.31.10** | better-auth peer `drizzle-orm: '^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0'`.                                                                                                                    |
| Object storage | Cloudflare R2                                                                            | binding                                         | —                                                                                                                                                                                      |
| Rate limiting  | Workers Rate Limiting binding                                                            | binding                                         | —                                                                                                                                                                                      |
| Auth + RBAC    | Better Auth (organization + admin plugins)                                               | **1.7.2**                                       | peer ranges above.                                                                                                                                                                     |
| ZIP export     | fflate                                                                                   | **0.8.3**                                       | MIT, streaming, small.                                                                                                                                                                 |
| Unit tests     | Vitest                                                                                   | **4.1.11**                                      | `@cloudflare/vitest-pool-workers@0.22.0` peer `vitest: '^4.1.0'`. Vitest 5.0.0 is latest but unsupported by the Workers pool.                                                          |
| Worker tests   | `@cloudflare/vitest-pool-workers` (real D1/R2 in Miniflare)                              | **0.22.0**                                      | —                                                                                                                                                                                      |
| E2E            | Playwright against the production build in workerd, `@axe-core/playwright` on every page | 1.63.0 / 4.13.0                                 | `npm run test:e2e`                                                                                                                                                                     |

### 3.2 Quality gates

| Gate         | Tool                                                                                                                                                                                            | Version                                                                                                           | Command                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Format       | Prettier (+ tailwind class sorting)                                                                                                                                                             | 3.9.6 / 0.8.1                                                                                                     | `npm run format:check`                  |
| Lint         | ESLint flat config, `strictTypeChecked` + `stylisticTypeChecked`, unicorn, import-x, react-hooks, react-refresh                                                                                 | eslint 10.10.0, typescript-eslint 8.69.0, unicorn 74.0.0, import-x 4.17.1, react-hooks 7.1.1, react-refresh 0.5.6 | `npm run lint` (`--max-warnings=0`)     |
| Types        | `tsc --noEmit` per project reference, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noPropertyAccessFromIndexSignature` + `verbatimModuleSyntax` | 6.0.3                                                                                                             | `npm run typecheck`                     |
| CSS          | stylelint + `stylelint-config-standard` (Tailwind at-rules allowlisted)                                                                                                                         | 17.15.0 / 40.0.0                                                                                                  | `npm run lint:css` (`--max-warnings=0`) |
| Dead code    | knip (`--treat-config-hints-as-errors`; **never** `--strict`, see §3.3)                                                                                                                         | 6.34.0                                                                                                            | `npm run deadcode`                      |
| Cycles       | dpdm (`--exit-code circular:1`)                                                                                                                                                                 | 4.3.0                                                                                                             | `npm run lint:cycles`                   |
| Duplication  | jscpd                                                                                                                                                                                           | 5.1.2                                                                                                             | `npm run lint:dup`                      |
| Secrets      | gitleaks (pre-commit `--staged`, `security:secrets` over history, CI over full history)                                                                                                         | 8.30.1 (machine and CI)                                                                                           | `npm run security:secrets`              |
| Dependencies | `npm audit --audit-level=high`                                                                                                                                                                  | npm 11.19.0                                                                                                       | `npm run security:audit`                |
| SAST         | semgrep, rulesets `p/default`, `p/typescript`, `p/react`, `p/secrets` (`--config auto` requires telemetry and is not used)                                                                      | 1.174.0 (machine, `pip install semgrep`); CI container pinned by digest                                           | `npm run security:sast`                 |
| Tests        | Vitest with V8 coverage thresholds                                                                                                                                                              | 4.1.11                                                                                                            | `npm run test`                          |
| Build        | `vite build`                                                                                                                                                                                    | 8.2.2                                                                                                             | `npm run build`                         |
| Everything   | `npm run quality` (all gates except `security:sast` and `test:e2e`, which need machine tools; CI runs all three)                                                                                | —                                                                                                                 | fails on any blocking issue             |

### 3.3 Deferred gates

| Gate                        | Reason                                                                                            | Compensating control                                                                                                               | Revisit when                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `eslint-plugin-jsx-a11y`    | Peer `eslint: '^3 … ^9'`; incompatible with ESLint 10.                                            | `@axe-core/playwright` in every UI e2e spec (M1+); Lighthouse Accessibility ≥ 95 at visual milestones.                             | jsx-a11y publishes ESLint 10 support.         |
| `eslint-plugin-react`       | Peer `eslint: '… ^9.7'`; incompatible with ESLint 10.                                             | TypeScript catches most of what the plugin catches; React 19 runtime warnings for keys are surfaced in tests.                      | plugin publishes ESLint 10 support.           |
| Coverage inside workerd     | `@vitest/coverage-v8` cannot instrument the Workers pool (`node:inspector` is a stub in workerd). | Worker modules are unit-tested in Node (`*.test.ts`) where coverage is measured; `*.workers.test.ts` verifies runtime wiring only. | Cloudflare adds coverage support to the pool. |
| `@jsquash/avif` AVIF export | Stretch item; WASM size budget needs measuring.                                                   | PNG/JPEG/WebP exports.                                                                                                             | M5.                                           |

Gate traps found and neutralised during M0 (each would have passed silently):

- **`knip --strict` in knip 6 implies `--production`.** With it, only the two
  entry files were parsed and a deliberately unused `zod` dependency was not
  reported. Confirmed by instrumenting `dist/graph/build.js`: project patterns
  arrived negated and `walkAndAnalyze` ran in 0.1 ms. The gate now runs without
  `--strict` and with `--treat-config-hints-as-errors`.
- **`import-x/no-cycle` is not used.** dpdm is the cycle gate and was verified
  on a real two-module cycle.
- **`gitleaks git` on an empty repository reports "no leaks"** because there is
  no history yet. The gate was proven with `gitleaks dir` and with a staged
  secret under `--pre-commit --staged` before the first commit.

Reasoning for taking ESLint 10 over ESLint 9 with the two React plugins: ESLint's
support policy gives the previous major about six months of maintenance after a
new major; ESLint 10 shipped in early 2026, so starting a new project on 9 in
September 2026 would begin on an end-of-life line. `eslint-plugin-unicorn@74`
also requires ESLint ≥ 10.4.

### 3.4 Repository layout

Single npm package. Three TypeScript projects share one root so that
`src/shared` is type-checked under both the DOM and Workers libraries.

```
watermark-pro/
├── .github/workflows/ci.yml       CI: quality (incl. build) → e2e; semgrep in parallel
├── .husky/pre-commit              gitleaks --pre-commit --staged + lint-staged
├── e2e/                           Playwright specs (+ axe)
├── migrations/                    D1 migrations generated by drizzle-kit (M1)
├── public/                        static assets copied verbatim
├── src/
│   ├── client/                    React SPA (DOM lib)
│   │   ├── routes/                TanStack Router file routes
│   │   ├── components/            UI components
│   │   ├── engine/                watermark engine (pure TS, runs in a Web Worker) (M2)
│   │   ├── lib/                   client utilities
│   │   └── styles/app.css         Tailwind entry + design tokens
│   ├── worker/                    Hono API on Cloudflare Workers (Workers lib)
│   │   ├── index.ts               entry: env validation, middleware, routes
│   │   ├── env.ts                 zod schema for bindings + vars
│   │   ├── db/                    drizzle schema + client (M1)
│   │   ├── auth/                  Better Auth instance + RBAC statements (M1)
│   │   └── routes/                one file per resource (M1)
│   └── shared/                    constants, zod schemas, types (no DOM, no Workers globals)
├── index.html                     Vite entry
├── wrangler.jsonc                 Worker + bindings + assets config
├── vite.config.ts
├── vitest.config.ts               projects: unit-client (jsdom), unit-worker (Node), workers (workerd)
├── vitest.workers.config.ts
├── playwright.config.ts
├── drizzle.config.ts              (M1)
├── tsconfig.json                  references only
├── tsconfig.base.json             strict compiler options
├── tsconfig.client.json / tsconfig.worker.json / tsconfig.node.json
├── eslint.config.mjs, knip.jsonc, .prettierrc.json, .stylelintrc.json, .jscpd.json
├── worker-configuration.d.ts      generated by `wrangler types`; committed
├── PLAN.md, README.md, CHANGELOG.md, SECURITY.md, LICENSE
└── AGENTS.md, CLAUDE.md, .cursor/rules/, .github/copilot-instructions.md
```

### 3.5 Code standards (enforced by the gates above and by the agent instruction files)

- No unexplained magic numbers or strings. Tunables live in `src/shared/constants.ts`
  (the one file where `no-magic-numbers` is off) or in typed config objects.
- No dead code, commented-out code, unused exports, or unused dependencies.
- No silent fallbacks. A function that cannot do its job throws or returns a typed error.
- No mock data outside `*.test.ts`, `e2e/`, and explicitly named fixtures.
- No `any`, no `!`, no `@ts-ignore`. `@ts-expect-error` and rule suppressions need
  an inline reason **and** an entry in §9 of this file.
- Every dependency added must be justified here with version and peer check.

---

## 4. Open questions

| ID  | Question                                                                                                                                                                                                                                                                                                                                                                                        | Default until answered                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Q1  | ~~Email provider?~~ **Answered 2026-09-05: Cloudflare.**                                                                                                                                                                                                                                                                                                                                        | Cloudflare Email Sending behind a provider interface (A6).              |
| Q2  | ~~Is SSO required?~~ **Answered 2026-09-05: no.**                                                                                                                                                                                                                                                                                                                                               | Out of scope. Better Auth has an SSO plugin if this changes.            |
| Q3  | ~~Retention policy?~~ **Answered 2026-09-05: no auto-delete.**                                                                                                                                                                                                                                                                                                                                  | Per-org storage quota constant; users delete manually.                  |
| Q4  | ~~GitHub?~~ **Answered 2026-09-05: yes, public.**                                                                                                                                                                                                                                                                                                                                               | A2 updated.                                                             |
| Q5  | ~~Cloudflare plan?~~ **Answered 2026-09-05: Free.**                                                                                                                                                                                                                                                                                                                                             | A13 added; see Q7 and Q8 for the two consequences that need a decision. |
| Q6  | ~~Turnstile?~~ **Answered 2026-09-05: yes.**                                                                                                                                                                                                                                                                                                                                                    | Enabled in M8 behind an env flag; needs site key + secret.              |
| Q7  | ~~Email needs a domain.~~ **Resolved 2026-09-05: `blowmoney.net` is a zone in the account.** Sender address to confirm in M1 (default `no-reply@blowmoney.net`).                                                                                                                                                                                                                                | M1 enables Email Sending on the zone and verifies the sender.           |
| Q8  | **Password hashing on the Free plan.** Workers Free allows 10 ms CPU per request. A memory-hard password hash (scrypt/argon2) or an OWASP-strength PBKDF2 typically needs far more than that. M1 will measure the real cost in workerd; if it exceeds the budget, sign-in will be **magic link + passkeys (WebAuthn)** with no passwords at all, which is also the stronger option. Acceptable? | Measure first; default to passwordless if the budget is exceeded.       |

---

## 5. Architecture notes

### 5.1 Request flow

1. Browser loads the SPA from Workers Static Assets. `not_found_handling` is
   `single-page-application`; `run_worker_first` is `["/api/*"]` so only API
   paths invoke the Worker and everything else is served from the asset store.
2. `/api/auth/*` is handled by Better Auth. Sessions are HttpOnly, Secure,
   SameSite=Lax cookies. CSRF protection is Hono's `csrf` middleware plus Better
   Auth's origin checks.
3. `/api/*` routes are Hono handlers. Every handler runs `requireSession` and
   `requirePermission(resource, action)` before touching data. Every body and
   query is parsed with a Zod schema from `src/shared/schemas`.
4. D1 holds metadata (users, orgs, members, watermarks, photos, jobs, share
   links, audit log). R2 holds bytes (originals, outputs, thumbnails, logo
   assets), keyed `org/{orgId}/…` so authorization is a prefix check.
5. R2 objects are never public. Downloads stream through the Worker after an
   authorization check, or through a signed, expiring share token.

### 5.2 Watermark engine (client)

Pure TypeScript module in `src/client/engine/` with no React imports, executed
in a dedicated Web Worker via `OffscreenCanvas`. Inputs: `ImageBitmap`,
a `WatermarkSpec` (text | symbol | image; font, size, colour, opacity,
rotation, tiling, margin, anchor or explicit box), and render options. Output:
`Blob` in the requested format plus placement metadata.

**Smart placement (R4).** For each candidate box (nine anchors plus a coarse
sliding grid), compute on a downscaled luminance map:

- edge density (Sobel magnitude mean) — busy regions are bad hosts;
- local variance and entropy — flat regions read cleanly;
- centre-weighted saliency proxy (distance from image centre and colour
  contrast against the global mean) — avoid the subject;
- a small prior favouring bottom-right, then bottom-left, then top corners,
  matching photographer convention.

The lowest-cost box wins. All weights are named constants; the algorithm is
deterministic and unit-tested against synthetic fixtures with known answers.

**Auto contrast (R5).** Sample mean relative luminance under the chosen box.
If it is above the mid threshold, use the dark variant of the watermark;
otherwise the light variant. Add a soft shadow or outline scaled by how close
the region's luminance is to the watermark's own. Expose the result as the
default position of a contrast slider that the user can override.

### 5.3 RBAC model

Organizations are the tenancy boundary. Roles inside an organization:

| Role   | Watermarks | Photos | Jobs | Sharing       | Members            | Org settings  | Audit log |
| ------ | ---------- | ------ | ---- | ------------- | ------------------ | ------------- | --------- |
| owner  | CRUD       | CRUD   | run  | create/revoke | invite/remove/role | update/delete | read      |
| admin  | CRUD       | CRUD   | run  | create/revoke | invite/remove/role | update        | read      |
| editor | CRUD       | CRUD   | run  | create/revoke | —                  | —             | —         |
| viewer | read       | read   | —    | —             | —                  | —             | —         |

Permissions are declared once with Better Auth's `createAccessControl` in
`src/worker/auth/permissions.ts` and enforced by middleware. A platform-level
`admin` role (Better Auth admin plugin) can list, ban, and impersonate users
for support; impersonation is audit-logged.

### 5.4 Security controls

- Secure headers on every response (CSP `default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation).
- Startup validation of every binding and variable with Zod; the Worker refuses
  requests with a 500 and a logged reason if configuration is invalid.
- Upload validation: size limit, MIME sniffed from magic bytes (not trusted from
  the client), dimension limit, EXIF stripped by re-encode on the client.
- Rate limiting on auth endpoints and upload endpoints via the Workers Rate
  Limiting binding.
- Audit log table written for every mutating action (who, what, target, when, IP hash).
- Secrets only via `wrangler secret` / `.dev.vars`; `.dev.vars` and `.env` are git-ignored;
  `.dev.vars.example` documents every variable.
- gitleaks in pre-commit and CI; `npm audit` in CI; semgrep in CI.
- Dependency updates reviewed against peer ranges before merging.

Accepted residual risks (re-evaluated in M8):

- `style-src 'unsafe-inline'` in the static-asset CSP (`public/_headers`). UI
  primitives position popovers with `style` attributes, and CSS Level 3
  `style-src-attr` is not yet universally honoured. Scripts remain strictly
  self-hosted; inline styles cannot exfiltrate data on their own. Tracked in §9.
- `blowmoney.net` hosts other properties besides this app. Cookies are scoped
  to `watermark.blowmoney.net` (no `Domain` attribute), HSTS is set on the
  subdomain only, and nothing served from the apex is trusted by the app.

### 5.5 Performance budgets

| Metric                                                            | Budget                        |
| ----------------------------------------------------------------- | ----------------------------- |
| Initial JS (gzip) for the shell route                             | ≤ 180 kB                      |
| Editor route chunk (gzip)                                         | ≤ 250 kB excluding fonts      |
| Any single font file                                              | ≤ 120 kB (variable, subset)   |
| Lighthouse Performance / Accessibility / Best Practices (desktop) | ≥ 90 / ≥ 95 / ≥ 95            |
| Bulk job throughput (4000×3000 JPEG, text watermark, 8 workers)   | ≥ 2 images/s on a 2023 laptop |
| API p95 (D1 read routes)                                          | ≤ 150 ms at the edge          |

---

## 6. Milestones

Every milestone is complete only when its certification checklist is fully
green. No milestone starts before the previous one is certified.

### M0 — Scaffold and gates (this session)

- **Goal:** empty, buildable, fully gated project with documentation.
- **Scope:** configs, gate scripts, minimal SPA + Worker "hello", one unit test,
  one Workers test, one e2e smoke spec, CI workflow, docs, first commit.
- **Files:** see §3.4.
- **Acceptance:** `npm run quality` passes; every gate has been shown to fail on
  a deliberate defect and then pass after revert; `npm run build` produces
  `dist/`; `npm run dev` serves the shell.
- **Certification checklist:**
  - [x] `npm ci` clean, lockfile committed
  - [x] `format:check`, `lint`, `lint:css`, `typecheck`, `deadcode`, `lint:cycles`, `lint:dup`, `security:secrets`, `security:audit`, `security:sast`, `test`, `test:e2e`, `build` all pass
  - [x] each gate proven to fire (table in §8)
  - [x] README commands all executed successfully
  - [x] CHANGELOG has the 0.1.0 entry
  - [x] git initialised, `.gitignore` present before first commit, first commit made

### M1 — Foundation: auth, RBAC, design system

- **Goal:** users can sign up, sign in, create an organization, invite members with roles, and see an empty dashboard in the final visual language.
- **Scope:** D1 schema + migrations; Better Auth integration; permission statements; `requireSession` / `requirePermission` middleware; audit log; app shell (navigation, theme tokens, light/dark, responsive layout); auth screens; org switcher; member management screen.
- **Tests:** Workers tests for every auth-gated route (positive and negative per role); unit tests for permission helpers; e2e: sign-up → create org → invite → role denied path, with axe on every page.
- **Security checks:** cookie flags verified in a test; CSRF negative test; rate limit negative test; CSP header snapshot test.
- **Docs:** README env vars and migration commands; CHANGELOG.
- **Certification:** all gates + Lighthouse (Perf ≥ 90, A11y ≥ 95, BP ≥ 95) on `/login` and `/dashboard`, screenshot recorded under `docs/screenshots/m1/`.

### M2 — Watermark engine

- **Goal:** deterministic engine that renders text/symbol/image watermarks with smart placement and auto contrast.
- **Scope:** `src/client/engine/` (spec types, luminance map, Sobel, region scoring, contrast chooser, renderer, format encoder), Web Worker wrapper with a typed message protocol.
- **Tests:** ≥ 95 % line coverage on the engine; fixtures with known best-region answers; snapshot tests of placement metadata; property test that opacity/rotation never produce out-of-bounds boxes.
- **Performance:** benchmark script recorded in `docs/benchmarks.md`.
- **Certification:** gates + benchmark within budget.

### M3 — Watermark library, fonts, and symbols

- **Goal:** users build and save watermark presets from a wide font and symbol catalogue and uploaded logos.
- **Scope:** watermark CRUD routes with RBAC; logo upload to R2 with validation; font catalogue (≥ 40 open-licensed families across sans, serif, display, script, handwriting, mono; variable fonts where available; lazy-loaded per family); symbol catalogue (legal marks, arrows, stars, geometric, dingbats, currency, plus lucide icons as SVG); preset picker UI.
- **Tests:** route tests per role; font manifest test that every family has a licence file and size within budget; e2e create/edit/delete preset with axe.
- **Certification:** gates + font budget + Lighthouse on `/library`.

### M4 — Editor

- **Goal:** single-image editor with crop, resize, watermark placement, live preview, contrast slider, and apply-from-library.
- **Scope:** canvas editor component, crop tool with aspect presets, resize with constraint lock, drag/rotate/scale watermark handles, keyboard accessibility, undo/redo.
- **Tests:** unit tests for crop/resize math; component tests for handles; e2e with axe.
- **Certification:** gates + Lighthouse on `/editor` + manual visual check recorded.

### M5 — Bulk processing and export

- **Goal:** apply a preset to many photos with progress, cancel, retry, and download as ZIP in PNG/JPEG/WebP (AVIF stretch).
- **Scope:** browser job queue with worker pool, progress UI, per-file error reporting, fflate streaming ZIP, quality/size settings per format.
- **Tests:** queue unit tests (ordering, concurrency, cancel, failure isolation); e2e bulk of 20 fixtures.
- **Certification:** gates + throughput benchmark.

### M6 — Storage and gallery

- **Goal:** watermarked outputs persisted to R2 with thumbnails and metadata, browsable gallery with filters and bulk delete.
- **Scope:** multipart upload routes with quota enforcement, thumbnail generation client-side, gallery routes and UI, storage quota display.
- **Tests:** quota negative test; role tests; e2e gallery with axe.
- **Certification:** gates + Lighthouse on `/gallery`.

### M7 — Sharing

- **Goal:** share individual photos or albums via revocable, expiring links and the Web Share API.
- **Scope:** share-link table, signed token, public view route with its own strict CSP, revoke UI, audit entries.
- **Tests:** expired/revoked/tampered token negatives; role tests.
- **Certification:** gates + Lighthouse on the public share page.

### M8 — Enterprise hardening and release

- **Goal:** production deployment at `watermark.blowmoney.net`, admin console, hardening, documentation.
- **Scope:** admin console (users, orgs, bans, audit log viewer), Turnstile on sign-up, rate limit tuning, CSP report-only → enforce review, threat model document, dependency review, a wrangler `production` environment that sets `APP_ENV=production` (the top-level default is `development` and must never be what gets deployed), `wrangler deploy` from CI on tags, runbook.
- **Tests:** full e2e regression; semgrep clean; `npm audit` clean at high.
- **Certification:** every gate, every Lighthouse target, SECURITY.md complete, README deployment section executed end to end.

---

## 7. Definition of done (applies to every milestone)

1. All gates in §3.2 pass locally and in CI.
2. New behaviour has tests that fail without the change.
3. Coverage thresholds hold (lines 90, statements 90, functions 90, branches 85).
4. No new entries in §9 without a linked justification.
5. README, CHANGELOG, and this PLAN are updated in the same change.
6. For UI work: axe passes with zero violations and Lighthouse targets are met.
7. For API work: every route has positive and negative RBAC tests.

---

## 8. Gate verification log

Every gate must be seen to fail on a case it exists to catch. Filled in during M0.

| Gate                  | Deliberate defect | Observed failure | Reverted |
| --------------------- | ----------------- | ---------------- | -------- |
| (filled in during M0) |                   |                  |          |

---

## 9. Tracked escape hatches

Every suppression, `@ts-expect-error`, cast, or config loosening. Empty is the goal.

| Location   | What | Why | Remove when |
| ---------- | ---- | --- | ----------- |
| (none yet) |      |     |             |
