# PLAN.md — Watermark Pro

Living planning document. Decisions, assumptions, open questions, architecture,
milestones, and certification gates. Update it whenever a decision changes.
`CHANGELOG.md` records what happened; this file records what is intended and why.

Last updated: 2026-09-06 (M2 certified)

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

| ID  | Assumption                                                                                                                                                                                                                                                                  | Why this default                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Package manager is **npm 11** (lockfile v3).                                                                                                                                                                                                                                | Installed, no pnpm/yarn present.                                                                                                                                                          |
| A2  | CI provider is **GitHub Actions**; the repository is **public** on GitHub.                                                                                                                                                                                                  | Confirmed by the owner on 2026-09-05. Public repo means gitleaks, pinned actions, and `SECURITY.md` matter from the first commit.                                                         |
| A3  | Frontend is a **single-page application** (no SSR).                                                                                                                                                                                                                         | Authenticated tool, not a content site; SPA keeps the Worker stateless and the CSP strict.                                                                                                |
| A4  | Image rendering runs **in the browser** (Web Worker + OffscreenCanvas), not on Cloudflare Workers.                                                                                                                                                                          | Workers CPU limits make bulk raster work impractical and costly; browser rendering is free, private, and parallel. Server stores results only.                                            |
| A5  | Authentication is **email + password with sessions**, self-hosted via Better Auth on D1, with the organization plugin for RBAC. Passkeys may be added later as a second factor.                                                                                             | No identity provider was specified and SSO was declined (Q2). The Paid plan CPU budget (A13) makes a proper password hash affordable; M1 still records the measured cost.                 |
| A6  | Transactional email goes through **Cloudflare Email Sending** (the `send_email` binding) from `no-reply@watermark.blowmoney.net`, behind a provider interface. A `console` provider exists for local development and tests; the app refuses to start with it in production. | Sender subdomain chosen by the owner on 2026-09-06 (Q9) so the apex domain's mail records stay untouched.                                                                                 |
| A7  | Fonts are **self-hosted** open-licensed families (OFL/Apache) bundled from `@fontsource` packages.                                                                                                                                                                          | Keeps CSP strict (`font-src 'self'`) and avoids third-party requests from an enterprise app.                                                                                              |
| A8  | Browser support: **evergreen browsers with OffscreenCanvas** (Chrome/Edge 69+, Firefox 105+, Safari 16.4+).                                                                                                                                                                 | Required for off-main-thread rendering.                                                                                                                                                   |
| A9  | Photo formats accepted for upload: JPEG, PNG, WebP, AVIF, GIF (first frame), HEIC where the browser can decode it.                                                                                                                                                          | Browser `createImageBitmap` coverage.                                                                                                                                                     |
| A10 | Export formats: **PNG, JPEG, WebP** in M5 (native `canvas.convertToBlob`), **AVIF** via WASM encoder as an M5 stretch item.                                                                                                                                                 | Native encoders are zero-dependency; AVIF needs `@jsquash/avif`.                                                                                                                          |
| A11 | The single origin is `https://watermark.blowmoney.net`; the `workers.dev` subdomain is disabled (`workers_dev: false`).                                                                                                                                                     | Owner supplied the domain on 2026-09-05. One origin keeps cookies, CSP, and share links unambiguous.                                                                                      |
| A12 | The owner has approved installing any tooling the project needs on this machine ("you install whatever is needed", 2026-09-05).                                                                                                                                             | Global installs are still avoided where a local devDependency works; machine-level installs are listed in README → Requirements.                                                          |
| A13 | Cloudflare **Workers Paid** plan ($5/month) for production, upgraded from Free on 2026-09-05.                                                                                                                                                                               | Stated by the owner. Gives 30 s CPU per request by default (raisable to 5 min with `limits.cpu_ms`), D1 and R2 paid quotas, and Email Sending. Rendering still stays in the browser (A4). |

---

## 3. Resolved decisions

### 3.1 Stack

| Layer          | Choice                                                                                            | Pinned version                                  | Source of verification                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language       | TypeScript                                                                                        | **6.0.3**                                       | `npm info typescript-eslint peerDependencies` → `typescript: '>=4.8.4 <6.1.0'` (checked 2026-09-05). TypeScript 7.0.2 is latest but would silently disable every type-aware lint rule. |
| Runtime        | Cloudflare Workers, single Worker serving Static Assets + API                                     | wrangler **4.129.0**                            | `@cloudflare/vite-plugin` peer `wrangler: '^4.129.0'`.                                                                                                                                 |
| Build          | Vite                                                                                              | **8.2.2**                                       | `@vitejs/plugin-react@6.1.1` peer `vite: '^8.0.0'`; `@cloudflare/vite-plugin@1.54.4` peer `vite: '^6.1.0 \|\| ^7.0.0 \|\| ^8.0.0'`.                                                    |
| UI             | React                                                                                             | **19.2.8**                                      | `@testing-library/react` peer `^18 \|\| ^19`.                                                                                                                                          |
| Routing        | TanStack Router (file-based, type-safe)                                                           | **1.170.32**                                    | `@tanstack/router-plugin` peer `@tanstack/react-router: '^1.170.32'`.                                                                                                                  |
| Data fetching  | TanStack Query                                                                                    | **5.102.8**                                     | —                                                                                                                                                                                      |
| Styling        | Tailwind CSS 4 via `@tailwindcss/vite`                                                            | **4.3.3**                                       | peer `vite: '^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8'`.                                                                                                                                         |
| Primitives     | Radix UI (`radix-ui` unified package), lucide-react icons                                         | 1.6.7 / 1.41.0                                  | —                                                                                                                                                                                      |
| API            | Hono                                                                                              | **4.13.7**                                      | exports `./secure-headers`, `./csrf`, `./cors`, `./validator` confirmed.                                                                                                               |
| Validation     | Zod 4                                                                                             | **4.5.4**                                       | better-auth depends on `zod ^4.3.6`; single Zod major across the project.                                                                                                              |
| Database       | Cloudflare D1 via Drizzle ORM                                                                     | drizzle-orm **0.45.2**, drizzle-kit **0.31.10** | better-auth peer `drizzle-orm: '^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0'`.                                                                                                                    |
| Object storage | Cloudflare R2                                                                                     | binding                                         | —                                                                                                                                                                                      |
| Rate limiting  | Workers Rate Limiting binding                                                                     | binding                                         | —                                                                                                                                                                                      |
| Auth + RBAC    | Better Auth (organization + admin plugins)                                                        | **1.7.2**                                       | peer ranges above.                                                                                                                                                                     |
| ZIP export     | fflate                                                                                            | **0.8.3**                                       | MIT, streaming, small.                                                                                                                                                                 |
| Unit tests     | Vitest                                                                                            | **4.1.11**                                      | `@cloudflare/vitest-pool-workers@0.22.0` peer `vitest: '^4.1.0'`. Vitest 5.0.0 is latest but unsupported by the Workers pool.                                                          |
| Worker tests   | `@cloudflare/vitest-pool-workers` (real D1/R2 in Miniflare)                                       | **0.22.0**                                      | —                                                                                                                                                                                      |
| E2E            | Playwright against the production build in workerd, `@axe-core/playwright` on every page          | 1.63.0 / 4.13.0                                 | `npm run test:e2e`                                                                                                                                                                     |
| UI kit         | Radix UI unified package, lucide-react, class-variance-authority, clsx, tailwind-merge            | 1.6.7 / 1.37.0 / 0.7.1 / 2.1.1 / 3.6.0          | lucide-react 1.41.0 was refused by `min-release-age=7`; 1.37.0 is the newest release older than seven days on 2026-09-06.                                                              |
| Fonts          | `@fontsource-variable/inter` (self-hosted)                                                        | 5.3.0                                           | OFL licence; no third-party font origin, so `font-src 'self'` holds.                                                                                                                   |
| Test tooling   | `@testing-library/user-event`, `@better-auth/core` (drift test only), lighthouse, chrome-launcher | 14.6.1 / 1.7.2 / 13.4.1 / 1.2.0                 | `@better-auth/core` is pinned to the better-auth version it ships with.                                                                                                                |
| ZIP            | fflate                                                                                            | **0.8.3**                                       | MIT, zero dependencies, streaming `Zip` with stored entries; also used in tests to unpack downloads.                                                                                   |

### 3.2 Quality gates

| Gate         | Tool                                                                                                                                                                                            | Version                                                                                                           | Command                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Format       | Prettier (+ tailwind class sorting)                                                                                                                                                             | 3.9.6 / 0.8.1                                                                                                     | `npm run format:check`                                  |
| Lint         | ESLint flat config, `strictTypeChecked` + `stylisticTypeChecked`, unicorn, import-x, react-hooks, react-refresh                                                                                 | eslint 10.10.0, typescript-eslint 8.69.0, unicorn 74.0.0, import-x 4.17.1, react-hooks 7.1.1, react-refresh 0.5.6 | `npm run lint` (`--max-warnings=0`)                     |
| Types        | `tsc --noEmit` per project reference, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noPropertyAccessFromIndexSignature` + `verbatimModuleSyntax` | 6.0.3                                                                                                             | `npm run typecheck`                                     |
| CSS          | stylelint + `stylelint-config-standard` (Tailwind at-rules allowlisted)                                                                                                                         | 17.15.0 / 40.0.0                                                                                                  | `npm run lint:css` (`--max-warnings=0`)                 |
| Dead code    | knip (`--treat-config-hints-as-errors`; **never** `--strict`, see §3.3)                                                                                                                         | 6.34.0                                                                                                            | `npm run deadcode`                                      |
| Cycles       | dpdm (`--exit-code circular:1`)                                                                                                                                                                 | 4.3.0                                                                                                             | `npm run lint:cycles`                                   |
| Duplication  | jscpd                                                                                                                                                                                           | 5.1.2                                                                                                             | `npm run lint:dup`                                      |
| Secrets      | gitleaks (pre-commit `--staged`, `security:secrets` over history, CI over full history)                                                                                                         | 8.30.1 (machine and CI)                                                                                           | `npm run security:secrets`                              |
| Dependencies | `npm audit --audit-level=high`                                                                                                                                                                  | npm 11.19.0                                                                                                       | `npm run security:audit`                                |
| SAST         | semgrep, rulesets `p/default`, `p/typescript`, `p/react`, `p/secrets` (`--config auto` requires telemetry and is not used)                                                                      | 1.174.0 (machine, `pip install semgrep`); CI container pinned by digest                                           | `npm run security:sast`                                 |
| Tests        | Vitest with V8 coverage thresholds                                                                                                                                                              | 4.1.11                                                                                                            | `npm run test`                                          |
| Build        | `vite build`                                                                                                                                                                                    | 8.2.2                                                                                                             | `npm run build`                                         |
| Lighthouse   | `scripts/lighthouse.mjs`: desktop preset, budgets from §5.5, signs in through the API for authenticated pages                                                                                   | lighthouse 13.4.1                                                                                                 | `npm run audit:lighthouse` (against `npm run preview`)  |
| Screenshots  | `scripts/screenshots.mjs`: every screen, light and dark, 1440×900                                                                                                                               | Playwright 1.63.0                                                                                                 | `npm run audit:screenshots` (against `npm run preview`) |
| Everything   | `npm run quality` (all gates except `security:sast` and `test:e2e`, which need machine tools; CI runs all three)                                                                                | —                                                                                                                 | fails on any blocking issue                             |

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

| ID  | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Default until answered                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Q1  | ~~Email provider?~~ **Answered 2026-09-05: Cloudflare.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Cloudflare Email Sending behind a provider interface (A6).                                    |
| Q2  | ~~Is SSO required?~~ **Answered 2026-09-05: no.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Out of scope. Better Auth has an SSO plugin if this changes.                                  |
| Q3  | ~~Retention policy?~~ **Answered 2026-09-05: no auto-delete.**                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Per-org storage quota constant; users delete manually.                                        |
| Q4  | ~~GitHub?~~ **Answered 2026-09-05: yes, public.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A2 updated.                                                                                   |
| Q5  | ~~Cloudflare plan?~~ **Answered 2026-09-05: Free.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A13 added; see Q7 and Q8 for the two consequences that need a decision.                       |
| Q6  | ~~Turnstile?~~ **Answered 2026-09-05: yes.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Enabled in M8 behind an env flag; needs site key + secret.                                    |
| Q7  | ~~Email needs a domain.~~ **Resolved 2026-09-05** (`blowmoney.net` zone) but superseded by Q9: the zone is not authorized for Email Sending.                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                             |
| Q9  | ~~Sender domain for Email Sending.~~ **Resolved 2026-09-06.** Email Sending enabled on `watermark.blowmoney.net` (`wrangler email sending enable`); Cloudflare created the `cf-bounce` MX/SPF, DKIM and `_dmarc` records under that subdomain only, so the apex domain's mail is untouched. Sender is `no-reply@watermark.blowmoney.net`; delivery verified against the live Worker. Alternatives considered: the already-authorized `projects.blowmoney.net`, or the apex (would add `_dmarc.blowmoney.net` `p=reject`). | —                                                                                             |
| Q8  | ~~Password hashing on the Free plan.~~ **Resolved 2026-09-05:** the owner upgraded to Workers Paid, so the CPU budget is no longer a constraint.                                                                                                                                                                                                                                                                                                                                                                          | M1 uses Better Auth's default password hash and records its measured CPU cost for the record. |

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

### M1 — Foundation: auth, RBAC, design system — certified 2026-09-06

- **Goal:** users can sign up, sign in, create an organization, invite members with roles, and see an empty dashboard in the final visual language.
- **Scope delivered:** D1 schema + migration; Better Auth integration with email verification and password reset; permission statements (`src/shared/permissions.ts`); `requireSession` / `requirePermission` / `requireSameOrigin` middleware; audit log; rate limiting; email providers (Cloudflare Email Sending, console); app shell (sidebar, organization switcher, account menu, theme toggle, light/dark, responsive); auth screens; dashboard; members management; audit log viewer; organization creation.
- **Tests delivered:** 113 Node/jsdom tests (real Hono + real Better Auth on the memory adapter; router-level page flows with a fake auth client), 5 workerd tests (real D1, real rate-limit bindings), 6 Playwright tests including the full onboarding journey with axe on every page. Coverage 97 % lines / 89 % branches / 93 % functions against 90/85/90 floors.
- **Security checks delivered:** cookie flag test (HttpOnly, SameSite=Lax, Path), CSRF negatives for JSON, form and missing-origin posts, rate limit negative (11th credential attempt → 429 with `X-Retry-After`), CSP header assertions in unit and e2e tests, zero CSP violations in the browser.
- **Docs:** README (install, D1, env table, roles, deployment), SECURITY.md controls, CHANGELOG 0.2.0.
- **Certification checklist:**
  - [x] all gates in §3.2 pass (`npm run quality`, `security:sast`, `test:e2e`)
  - [x] Lighthouse desktop on `/`, `/login`, `/signup`, `/app`, `/app/members`, `/app/audit`: Performance 96–98, Accessibility 100, Best Practices 100 (`docs/lighthouse/m1/summary.md`, uncompressed local preview; production adds brotli)
  - [x] screenshots in light and dark for every screen under `docs/screenshots/m1/`
  - [x] every route has positive and negative RBAC tests (audit route: owner 200, admin 200, editor 403, viewer 403, non-member 403, anonymous 401; invite: viewer 403)
  - [x] bugs found by tests fixed before certification (see §8)
- **Not in M1 (deferred to M8 by design):** production wrangler environment, admin console, Turnstile, actual deployment.

### M2 — Watermark engine — certified 2026-09-06

- **Goal:** deterministic engine that renders text/symbol/image watermarks with smart placement and auto contrast.
- **Scope delivered:** `src/shared/watermark.ts` (Zod spec: text / symbol (glyph or icon) / image marks, placement anchor|smart|custom, contrast auto|manual, style with opacity, rotation, scale, margin, tiling); `src/client/engine/` with `analysis.ts` (Rec. 709 luminance, Sobel, integral images, region statistics), `placement.ts` (nine anchors plus a 3×3 interior grid scored on edge density, variance, centre/contrast saliency and a convention prior), `contrast.ts` (variant and outline from the luminance under the mark), `layout.ts` (size, placement resolution, brick-pattern tiling), `render.ts` (canvas drawing for text, glyphs, icon paths and bitmaps), `encode.ts` (PNG/JPEG/WebP with verified MIME), `pipeline.ts` (crop → resize → analyse → place → draw → encode), `worker.ts` + `worker-client.ts` (typed Web Worker protocol, transferred bitmaps, font loading in the worker).
- **Tests delivered:** 36 engine tests: pure-math tests in Node with synthetic maps (busy-vs-flat placement, convention tie-break, subject avoidance, luminance readings, tiling), plus 13 tests in real Chromium via Vitest browser mode (pixels change only under the mark, ink variant flips with background, smart placement lands on the flat half, crop/resize, tiling, icons, image marks, WebP/JPEG/PNG encoding, worker round trip, worker failure and termination). Engine coverage 100 % lines except the worker thread script, which coverage cannot instrument.
- **Performance:** `docs/benchmarks.md`: 0.15 s per 4000×3000 image on one worker, 22.8 images/s with 8 workers (budget ≥ 2 images/s).
- **Certification checklist:**
  - [x] all gates in §3.2 pass
  - [x] benchmark within budget and recorded
  - [x] engine modules import nothing from React or the DOM (checked by the WebWorker-lib TypeScript project `tsconfig.engine-worker.json`)

### M3 — Watermark library, fonts, and symbols — certified 2026-09-06

- **Goal:** users build and save watermark presets from a wide font and symbol catalogue and uploaded logos.
- **Scope delivered:** D1 tables `watermark` and `asset` (migration `0001_library.sql`); R2 `BUCKET` binding in both wrangler environments; `src/worker/routes/library.ts` with `GET/POST /api/orgs/:orgId/watermarks`, `PUT/DELETE …/watermarks/:id`, `GET/POST …/assets`, `GET …/assets/:id/file`, `DELETE …/assets/:id`, every route behind `requireSession` + `requirePermission` (`watermark` resource: viewers read, editors and above write); upload validation by file signature (`src/worker/uploads.ts`, never the declared MIME), 5 MB limit checked on `Content-Length` and on the body, 50 logos per organization, logos served with `Cache-Control: private` through the Worker, deletion refused with 409 while a preset references the logo; audit entries for every mutation. Client: font catalogue of 51 Fontsource families across sans, serif, display, script and mono (`src/client/fonts/catalogue.ts`, data only) loaded on demand through `import.meta.glob` (`fonts/load.ts`, latin subset, weights 400/700 or the variable `wght` file); symbol catalogue of 8 glyph groups and 70 lucide icons flattened to path data (`src/client/symbols/catalogue.ts`); the designer (`src/client/components/designer/`) with mark / placement / style tabs, font and weight pickers, glyph and icon tiles, logo grid with upload and delete, smart / corner / custom placement, auto / manual contrast, opacity, size, rotation, margin and tiling controls, and a live preview rendered by the engine worker on a bundled sample scene or the user's own photo; library list with kind, placement and contrast summaries; routes `/app/library`, `/app/library/new`, `/app/library/$watermarkId`; "Library" navigation entry.
- **Tests delivered:** 11 Node route tests (CRUD with audit trail, malformed JSON and spec, foreign-logo rejection, sniffing of PNG/GIF/SVG bytes regardless of declared type, declared and actual oversize, malformed forms, the 50-logo quota, delete conflict, viewer / outsider / anonymous / editor matrix), 2 workerd tests over real D1 and R2 (json_extract reference count, R2 metadata round trip, conflict then delete), 7 sniffing and 8 spec-helper unit tests, 9 jsdom page tests through the real router with a fake API (list, delete, empty and error states, viewer gating, full designer flow, draft retention across mark kinds, logo upload including a non-image rejection, conflict on logo delete, edit and read-only view), 5 Chromium tests (`loadFont` registers a family on the page, **every catalogue family and weight loads**, sample scene, preview renderer over text / icon / glyph / logo marks with stale-frame discard and custom subject), and 2 Playwright journeys with axe on the library, the designer in every tab, and the read-only view. Total 234 unit/browser tests + 7 workerd tests + 8 e2e tests; coverage 94.5 % lines / 85.5 % branches / 91.3 % functions.
- **Security checks delivered:** content sniffing test with mismatched declared type, size limits before the body is read, quota, RBAC negatives for every write, same-origin guard unchanged, logo responses private and same-origin only.
- **Performance:** every bundled font file ≤ 120 kB (audit test over 51 packages); Lighthouse desktop `/app/library` 96 / 100 / 96 and `/app/library/new` 95 / 100 / 96 (`docs/lighthouse/m3/summary.md`); designer route chunk 72 kB raw / 21 kB gzip.
- **Docs:** README (library, fonts, symbols, logo limits), CHANGELOG 0.4.0, screenshots under `docs/screenshots/m3/` (library and designer, light and dark).
- **Certification checklist:**
  - [x] all gates in §3.2 pass (`npm run quality`, `security:sast`, `test:e2e`)
  - [x] font budget verified per file by `catalogue.audit.test.ts`
  - [x] Lighthouse desktop on all eight pages within §5.5 budgets
  - [x] screenshots in light and dark under `docs/screenshots/m3/`
  - [x] every library route has positive and negative RBAC tests
  - [x] bugs found by tests fixed before certification (see §8)

### M4 — Editor — certified 2026-09-06

- **Goal:** single-image editor with crop, resize, watermark placement, live preview, contrast slider, and apply-from-library.
- **Scope delivered:** `/app/editor` (optional `?preset=` search, validated with Zod) reachable from the navigation and from every library card. `src/client/editor/geometry.ts` (pure crop and resize arithmetic: clamping, eight aspect presets including the photo's own ratio, handle drags with ratio lock anchored at the opposite corner, minimum crop side, locked and free resize, percentage and long-edge fits, output side limits) and `src/client/editor/state.ts` (document + undo history with `checkpoint` / `set` / `commit` so a drag is one undo step; limit 50). `PreviewRenderer` gained `sourceSize`, `subjectScale`, source-pixel transforms scaled to the preview, and `exportFull` for full-resolution downloads; the engine now reports the mark's box and rotation so handles can be drawn. Components under `src/client/components/editor/`: `MarkOverlay` (drag to move, corner handle to scale, top handle to rotate; arrows, Shift, `+`/`-`, `[`/`]` on the keyboard), `CropOverlay` (eight handles, dimmed surround, thirds grid, arrow keys), watermark panel (preset select, "adjusted for this photo" with revert, placement and style panels shared with the designer), crop panel (aspect presets and numeric fields), resize panel (width/height with proportion lock, 25/50/75 %, fit 1080/2048/4096), export panel (PNG/JPEG/WebP, quality, download). Photos open from disk or by drag-and-drop and never leave the browser; the sample scene is the default subject. Ctrl/Cmd+Z, Ctrl+Shift+Z and Ctrl+Y undo and redo outside form fields.
- **Tests delivered:** 12 pure tests for geometry and history, 8 overlay tests with synthetic pointer and keyboard events at a non-1:1 display scale, 6 editor page tests through the real router (preset from URL, keyboard placement, undo/redo/revert, square crop and locked resize producing the expected transform, PNG export with the transform, photo open/reject/reset, drag-and-drop, tiled marks hiding the frame, export failure, keyboard shortcuts, empty library), 1 download helper test, 2 more Chromium tests (transforms scaled to a half-size preview and full-size export at 640×400 and 2560×1600), and a Playwright journey that places by keyboard and mouse, crops to 1:1, resizes to 50 %, downloads a real PNG and checks its IHDR is 320×320, with axe on every tool. Total 263 unit/browser tests + 7 workerd + 9 e2e; coverage 93.8 % lines / 85.2 % branches / 90.9 % functions.
- **Security checks delivered:** no new server surface; photos and exports stay client-side; downloads use a same-origin object URL released immediately.
- **Performance:** Lighthouse desktop `/app/editor` 95 / 100 / 96 (`docs/lighthouse/m4/summary.md`); preview renders are debounced and stale frames discarded; export re-decodes the original once.
- **Docs:** README (editor section), CHANGELOG 0.5.0, screenshots under `docs/screenshots/m4/` (editor and crop tool, light and dark).
- **Certification checklist:**
  - [x] all gates in §3.2 pass (`npm run quality`, `security:sast`, `test:e2e`)
  - [x] Lighthouse desktop on all nine pages within §5.5 budgets
  - [x] visual check: `docs/screenshots/m4/editor-*.png` and `editor-crop-*.png` reviewed (mark frame with handles, crop frame with thirds grid, panels in both themes)
  - [x] keyboard-only operation of both overlays covered by tests and axe
  - [x] bugs found by tests fixed before certification (see §8)

### M5 — Bulk processing and export — certified 2026-09-06

- **Goal:** apply a preset to many photos with progress, cancel, retry, and download as ZIP in PNG/JPEG/WebP (AVIF stretch).
- **Scope delivered:** `/app/bulk` ("Bulk" in the navigation). `src/client/bulk/queue.ts`: a generic concurrency-limited job queue (submission order, `AbortSignal` cancellation that keeps finished results, retry of failed and cancelled jobs, per-job duration, failure isolation, `onChange` snapshots). `worker-pool.ts`: a pool of engine workers sized to `hardwareConcurrency − 1` (max 8), least-busy dispatch. `processor.ts`: decode on the main thread, optional fit-to-long-edge resize, render and encode in a worker, output naming. `zip.ts`: fflate streaming ZIP with stored (uncompressed) entries and duplicate-name suffixes. `runtime.ts` ties them together behind one factory so the page can be tested with a fake. The bulk tool: multi-file picker and drag-and-drop with de-duplication and a 500-file cap, preset select, format, quality (disabled for PNG), size (original or fit 1080/2048/4096), Start / Cancel / Retry n, a `<progress>` bar with a live summary and throughput, per-file status, error and download, "Download n as ZIP", clear. `MarkResources` was extracted from the preview renderer so the editor, designer and bulk tool resolve fonts, icons and logos the same way. AVIF output was not attempted: Chromium cannot encode it through `canvas.convertToBlob`, and the engine verifies the encoded type, so it stays a stretch goal.
- **Tests delivered:** 5 queue tests in Node with a controllable runner (ordering and concurrency, failure isolation, cancel/retry, a runner that ignores the signal, non-Error rejections and clear); 4 Chromium tests (pool sizing, ZIP round trip through `unzipSync` with duplicate names, processor output naming / WebP and PNG output / long-edge resize / cancellation / undecodable input, and the 20-fixture throughput measurement); 3 page tests through the real router with a fake runtime (batch with a failure, per-file and ZIP downloads, retry; cancel mid-batch with finished results kept, ZIP failure, retry to completion, clear and disposal on unmount; drag-and-drop and the empty-library state); a Playwright journey that uploads twenty generated PNGs, runs the batch with axe on every state, downloads the ZIP and checks all twenty entries in Node. Total 275 unit/browser + 7 workerd + 10 e2e; coverage 93.9 % lines / 85.8 % branches / 91.2 % functions.
- **Performance:** `docs/benchmarks.md`: 20 × 1600×1200 JPEG through 8 workers in 0.18 s = 109.9 images/s end to end (budget ≥ 2 images/s). Lighthouse desktop `/app/bulk` 95 / 100 / 96 (`docs/lighthouse/m5/summary.md`).
- **Security checks delivered:** no new server surface; everything runs in the browser; the ZIP is built in memory from the batch's own outputs and downloaded through a revoked object URL.
- **Docs:** README (bulk section), CHANGELOG 0.6.0, `docs/benchmarks.md`, screenshots under `docs/screenshots/m5/`.
- **Certification checklist:**
  - [x] all gates in §3.2 pass (`npm run quality`, `security:sast`, `test:e2e`)
  - [x] throughput benchmark within budget and recorded
  - [x] Lighthouse desktop on all ten pages within §5.5 budgets
  - [x] screenshots in light and dark under `docs/screenshots/m5/`
  - [x] bugs found by tests fixed before certification (see §8)

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
- **Scope:** admin console (users, orgs, bans, audit log viewer), Turnstile on sign-up, rate limit tuning, CSP report-only → enforce review, threat model document, dependency review, `wrangler deploy` from CI on tags, runbook. (The `production` wrangler environment and the first deployment were pulled forward to 2026-09-06, right after M1; see CHANGELOG.)
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

Every gate must be seen to fail on a case it exists to catch.

### M0 (2026-09-05)

| Gate               | Deliberate defect                                                                                                            | Observed failure                                                     | Reverted     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| `format:check`     | Unformatted `src/shared/ugly.ts`                                                                                             | exit 1                                                               | yes          |
| `lint`             | `any` parameter + un-awaited promise                                                                                         | `no-explicit-any`, `no-floating-promises`; exit 1                    | yes          |
| `lint:css`         | `@nonsense` at-rule                                                                                                          | `at-rule-no-unknown`; exit 2                                         | yes          |
| `typecheck`        | `const n: number = 'x'`                                                                                                      | TS2322; exit 2                                                       | yes          |
| `deadcode`         | Orphan file, unused export, unused `left-pad` dependency                                                                     | all three listed; exit 1                                             | yes          |
| `lint:cycles`      | `cyc-a.ts` ↔ `cyc-b.ts` imported from the Worker entry                                                                       | cycle listed; exit 1                                                 | yes          |
| `lint:dup`         | Copy of `env.ts` under `src/shared`                                                                                          | 1 clone, 3.1 % over 0 % threshold; exit 1                            | yes          |
| `security:secrets` | Fake AWS-shaped access key (`AKIA` plus 16 random characters, deliberately not the allowlisted example key) in a source file | `gitleaks dir` 1 leak, exit 1; staged `--pre-commit --staged` exit 1 | yes          |
| `security:audit`   | Scratch project with `lodash@4.17.20`                                                                                        | GHSA-35jh-r3h4-6jhm high; exit 1                                     | scratch only |
| `security:sast`    | `eval(code)` in a source file                                                                                                | `javascript.browser.security.eval-detected`; exit 2                  | yes          |
| `test` (assertion) | `expect(1).toBe(2)`                                                                                                          | 1 failed; exit 1                                                     | yes          |
| `test` (coverage)  | 12 uncovered lines in `src/shared/uncovered.ts`                                                                              | lines 87.83 % < 90 %, functions 89.47 % < 90 %; exit 1               | yes          |
| `test:e2e` (axe)   | `<img>` without `alt` in the shell                                                                                           | `image-alt` violation; exit 1                                        | yes          |
| `build`            | Import of a missing module in `main.tsx`                                                                                     | "error during build"; exit 1                                         | yes          |
| Husky pre-commit   | Staged fake secret, `git commit`                                                                                             | gitleaks rejects, commit aborted                                     | yes          |

Bugs the gates caught in M0's own code: `onError` turned the CSRF
`HTTPException` (403) into a 500 (caught by the CSRF unit test); an unused
`AppEnvironment` type and `ApiErrorCode` type (caught by knip); the
`--strict` knip trap itself (caught by the fire test, not by the tool).

### M1 (2026-09-06)

Tests that failed first and drove a fix:

| Defect                                                                                                                                                            | Caught by                                                       | Fix                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| JSON posts from a foreign origin were accepted (Better Auth checks origins only on requests with redirect URLs; Hono's `csrf()` only inspects form content types) | flow test "rejects a JSON sign-in posted from a foreign origin" | `requireSameOrigin` middleware on every state-changing request                            |
| drizzle schema lacked `account.issuer`, required by Better Auth 1.7                                                                                               | first workerd sign-up                                           | schema drift test against `getAuthTables` (proven to fail when `issuer` is made nullable) |
| Better Auth CLI 1.4.21 generated a schema without `issuer`                                                                                                        | manual comparison                                               | CLI dropped; the drift test is the source of truth                                        |
| Switching organizations kept stale queries and parent route context                                                                                               | shell test, e2e journey                                         | `invalidateQueries()` + `router.invalidate()` after `setActive`                           |
| Organization creation left the `/app` context without the new organization                                                                                        | e2e journey                                                     | same reload after create and after accepting an invitation                                |
| `eslint --fix` deleted `as` assertions on `Response.json()` (generic in Cloudflare types), silently turning typed values into `unknown`                           | `no-unsafe-*` errors after the fix pass                         | tests parse responses with Zod; no assertions on `json()`                                 |
| Empty `role="alert"` rendered for every field, confusing screen readers and `findByRole('alert')`                                                                 | page tests                                                      | alert element rendered only when a message exists                                         |
| Zod's `new Function` JIT probe reported as a CSP violation on every page                                                                                          | Lighthouse best-practices + a Playwright CSP probe              | `z.config({ jitless: true })` from the first client import                                |
| Preview on port 4173 was rejected by the same-origin guard                                                                                                        | e2e                                                             | preview and e2e pinned to the `APP_URL` port                                              |
| Lighthouse ran the mobile throttling preset against desktop budgets (scores ~58)                                                                                  | reading the report's `configSettings`                           | desktop config passed explicitly; retries on `NO_NAVSTART`                                |

Gate fire checks in M1: knip flagged `AuditEntryDto`, `AssignableRole`, `fetchHealth` as unused (removed); jscpd flagged three real duplicates (extracted `useAuthMutation`, `EmailField`/`PasswordField`, timestamp column helpers, a shared fake-auth module); semgrep flagged mutable action tags, missing `min-release-age`, and hand-rolled HTML escaping (all fixed); `min-release-age` refused `lucide-react@1.41.0` as too new; the schema drift test was shown to fail on a nullability change.

### M3 (2026-09-06)

Tests that failed first and drove a fix:

| Defect                                                                                                                                              | Caught by                      | Fix                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Font catalogue carried 102 per-family loader functions; coverage counted each as an uncovered function and the file dominated the functions floor   | coverage gate (74 % functions) | catalogue reduced to data; loaders come from two `import.meta.glob` patterns in `fonts/load.ts`; a Chromium test loads every family |
| Loading a family's `index.css` pulled every subset and weight (200+ font assets in the build)                                                       | build output listing           | latin-only, weight-specific stylesheets (`latin-400.css` / `latin-700.css` / `wght.css`)                                            |
| Tab and radio controls failed axe colour contrast mid-`transition-colors`                                                                           | Playwright axe on the designer | transitions removed from state-driven controls (tabs, choice groups, tiles)                                                         |
| Style panel headings were `h3` under a page with no `h2` before them                                                                                | Playwright axe (heading order) | section headings promoted to `h2`                                                                                                   |
| Two file inputs with the same `accept` list (preview subject and logo upload) were indistinguishable to assistive technology and to the e2e locator | e2e strict-mode violation      | explicit `aria-label` on both inputs                                                                                                |
| axe ran before the lazily loaded route chunk rendered (no `main`, no `h1`) once the bundle grew                                                     | onboarding e2e                 | e2e helpers wait for the page heading before analysing                                                                              |
| `URL` stub in page tests replaced the constructor and broke `new URL()` inside the fake API                                                         | library page tests             | `createObjectURL` / `revokeObjectURL` assigned onto the real `URL`                                                                  |
| Radix `Switch` and `RadioGroup` need `ResizeObserver`, which jsdom lacks                                                                            | designer page tests            | stub in `test-setup.ts`                                                                                                             |
| knip regex entries are compiled with `new RegExp(value)` directly, so the documented `/…/` form never matched                                       | knip configuration hint        | bare pattern `^@fontsource(-variable)?/` with a comment                                                                             |

Gate fire checks in M3: coverage floors refused the first cut (74 % functions, 83.9 % branches) and were satisfied by restructuring rather than lowering; jscpd flagged four real duplicates (shared `parseSaveRequest`, `deleteScoped`, `seedViewerWorkspace`, `TestClient.createOrganization`); knip flagged `FONT_CATEGORY_LABELS`, `DEFAULT_ICON` and three DTO types before they were used; `no-magic-numbers` pushed file signatures into readable Latin-1 strings; `prefer-iterator-to-array` moved the TypeScript `lib` to ES2025 (Iterator helpers are shipped by every supported runtime); axe caught two real accessibility defects listed above.

### M4 (2026-09-06)

Tests that failed first and drove a fix:

| Defect                                                                                                                                         | Caught by                            | Fix                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `useElementSize` took a ref object, so an image that mounted after the first effect run was never measured; overlays stayed hidden             | editor page tests (no overlay found) | hook takes the element from a callback ref and (re)measures whenever it changes                    |
| jsdom's `ResizeObserver` stub never reported, so the first measurement depended on a synchronous `setState` in an effect (React compiler lint) | React hooks lint + page tests        | stub delivers one entry on `observe`, as the real API does; the hook relies on that first delivery |
| Page test read the last rendered spec before the preset render replaced the photo-only render (opacity 0) and was flaky under load             | full-suite coverage run              | assertion waits for the preset's opacity                                                           |
| Resize labels used CSS `capitalize` on lowercase text, so the accessible name was "width (px)"                                                 | page test query                      | explicit label text                                                                                |
| Playwright `getByRole('link', { name })` matched both the card title and the "Open … in the editor" link                                       | e2e strict-mode violation            | `exact: true` on card title lookups                                                                |

Gate fire checks in M4: coverage refused the first cut at 84.7 % branches and was satisfied with tests for drag, drop, tiled marks and export failure rather than a lower floor; jscpd flagged the duplicated `image-size` mock factory and the crop setup in the editor page test (extracted to `fake-image-size.ts` and a helper); the React compiler lint refused a synchronous `setState` in an effect; unicorn refused an event handler named `useSample` as a hook-like name.

### M5 (2026-09-06)

Tests that failed first and drove a fix:

| Defect                                                                                                                            | Caught by                  | Fix                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| TypeScript narrowed `signal.aborted` to `false` across an `await`, so the post-render cancellation check was flagged as dead code | `no-unnecessary-condition` | `isAborted(signal)` helper read through a function call                    |
| Throughput was computed from `performance.now()` during render (impure under the React compiler)                                  | `react-hooks/purity`       | start and finish times recorded in state when the batch starts and settles |
| The preset loading / error / empty block was duplicated between the editor's watermark panel and the bulk tool                    | jscpd                      | `PresetGate` render-prop component                                         |
| `Array#sort()` without a comparator in tests                                                                                      | unicorn                    | `toSorted` with `localeCompare`                                            |

Gate fire checks in M5: the page test proved cancellation keeps finished outputs and that the runtime is disposed on unmount; the e2e test proved the ZIP contains twenty decodable PNGs of the expected size; `min-release-age` accepted `fflate@0.8.3` (published 2024).

---

## 9. Tracked escape hatches

Every suppression, `@ts-expect-error`, cast, or config loosening. Empty is the goal.

| Location                       | What                                                                                                                                                                | Why                                                                                                                                                                                                                                                 | Remove when                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `public/_headers`              | `style-src 'unsafe-inline'`                                                                                                                                         | UI primitives set inline `style` attributes; see §5.4.                                                                                                                                                                                              | Radix/Base UI ship nonce or CSS-only positioning, or `style-src-attr` is universally supported. |
| `eslint.config.mjs`            | `unicorn/prevent-abbreviations` and `unicorn/name-replacements` off                                                                                                 | Cloudflare (`env`) and React (`props`) vocabulary is short by API design; the rules generate churn against vendor names.                                                                                                                            | Never; documented choice.                                                                       |
| `eslint.config.mjs`            | `unicorn/single-line-block-comment-style` off                                                                                                                       | One-line `/** */` is still JSDoc and feeds editor hover text.                                                                                                                                                                                       | Never; documented choice.                                                                       |
| `eslint.config.mjs`            | `unicorn/prefer-global-this` off for `src/client/**`                                                                                                                | `globalThis` lacks `Window` members in TypeScript; obeying the rule is a hard type error in browser code.                                                                                                                                           | TypeScript types `globalThis` as `Window` in DOM projects.                                      |
| `eslint.config.mjs`            | `unicorn/filename-case` and `react-refresh/only-export-components` off for `src/client/routes/**`                                                                   | TanStack Router file naming (`__root.tsx`, `$id.tsx`) and the required `Route` export.                                                                                                                                                              | Router changes its conventions.                                                                 |
| `eslint.config.mjs`            | `no-magic-numbers` off for `src/shared/constants.ts`, tests, e2e, and `*.config.ts`                                                                                 | Constants must be assigned literals; assertion values are the meaning; config tables read better inline.                                                                                                                                            | Never; documented choice.                                                                       |
| `eslint.config.mjs`            | `@typescript-eslint/no-confusing-void-expression` with `ignoreArrowShorthand`                                                                                       | `onClick={() => setOpen(true)}` is the React handler idiom; the other cases of the rule stay on.                                                                                                                                                    | Never; documented choice.                                                                       |
| `eslint.config.mjs`            | `@typescript-eslint/only-throw-error` allows `Response`                                                                                                             | TanStack Router signals redirects by throwing `Response` objects.                                                                                                                                                                                   | Router offers a non-throwing redirect API.                                                      |
| `eslint.config.mjs`            | test files, `test-support/**`, `e2e/**`, `scripts/**` may use magic numbers, non-null assertions, `beforeEach` fixture assignment, devDependencies                  | Test and tooling idioms; production code keeps the strict set.                                                                                                                                                                                      | —                                                                                               |
| `eslint.config.mjs`            | `import-x/core-modules: ['cloudflare:workers', 'cloudflare:test']` and knip `ignoreDependencies: ['cloudflare']`                                                    | workerd virtual modules have no package on disk.                                                                                                                                                                                                    | knip/import-x learn the `cloudflare:` scheme.                                                   |
| `tsconfig.base.json`           | `skipLibCheck: true`                                                                                                                                                | Type-checking third-party `.d.ts` is slow and fails on bugs we cannot fix.                                                                                                                                                                          | Never; documented choice.                                                                       |
| `vitest.config.ts`             | coverage excludes `main.tsx`, `test-setup.ts`, `routeTree.gen.ts`, `src/worker/db/**`, `src/worker/services.ts`, `src/client/lib/auth-client.ts`, `test-support/**` | DOM bootstrap and generated code; D1 and binding wiring only runs in workerd (verified by the `workers` project, which cannot report coverage); the auth client module is replaced by a fake in page tests and exercised by Playwright.             | Cloudflare adds coverage to the Workers pool.                                                   |
| `src/worker/test-support/*.ts` | `{} as never` binding placeholders and one `as unknown as` for the migration binding                                                                                | Test-only stand-ins for Cloudflare bindings the memory adapter never touches.                                                                                                                                                                       | —                                                                                               |
| `src/client/lib/zod-config.ts` | Zod `jitless: true`                                                                                                                                                 | Avoids the `new Function` probe that strict CSP reports; costs the JIT fast path on a client that parses tiny payloads.                                                                                                                             | Zod stops probing under CSP.                                                                    |
| `wrangler.jsonc`               | `compatibility_date` held at 2026-08-22                                                                                                                             | Newest date the Workers pool's workerd accepts (pool 0.22.0).                                                                                                                                                                                       | Pool ships a newer workerd; bump both.                                                          |
| `eslint.config.mjs`            | `no-magic-numbers` off for `src/client/**/catalogue.ts`                                                                                                             | Font and symbol catalogues are literal data tables; the numbers (font weights) are the data.                                                                                                                                                        | Never; documented choice.                                                                       |
| `knip.jsonc`                   | `ignoreDependencies` pattern for `@fontsource/*` and `@fontsource-variable/*`                                                                                       | Fonts are reached through `import.meta.glob`, which knip cannot follow; `catalogue.audit.test.ts` checks every catalogue entry against the installed package and `preview.browser.test.ts` loads each one, so an unused package still fails a gate. | knip follows `import.meta.glob`.                                                                |
| `package.json`                 | `quality` omits `security:sast`, `test:e2e`, and the audits                                                                                                         | They need machine tools (semgrep, browsers, Chrome); CI runs sast and e2e unconditionally, audits run at UI milestones.                                                                                                                             | —                                                                                               |
