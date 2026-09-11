# M19 — Performance and production hardening

## Goal

### Current owner clarification — 2026-09-08

Randy confirmed that offline operation **and synchronization after reconnecting**
are production requirements. The accepted scope is photos, gallery saves, and
preset edits. Account management, publishing share links, and membership/admin
changes require a connection. This clarification supersedes the earlier section
4 proposal wherever that proposal only caches the application shell.

Saved offline work must survive reload and browser restart in IndexedDB. The
application must distinguish a successful local save from a confirmed server
save, resume pending synchronization after reconnect or reopen, and preserve
failed/conflicting work with a visible recovery action. Synchronization rechecks
the signed-in user and organization permission on the server. Replayed requests
must not create duplicate photos or presets, and a concurrent remote preset edit
must not be overwritten silently. Cached credentials, session tokens, and another
account's workspace data must never be used to authorize a sync.

The existing library/gallery APIs, rendering engine, query definitions, and
share-target IndexedDB integration remain the canonical integration points.
Durable workspace data and its outbox need their own store: the share-target
inbox intentionally drains imported files and cannot provide durable saves or
acknowledgements. The root service worker owns immutable application resources;
authenticated data belongs in the user/organization-scoped workspace store.

Randy added a visual polish pass for the landing and the complete app, rejected
purple, and suggested `#C86B82`. The accepted direction and visual acceptance
scope are recorded in [the design review](../verification/m19/design.md).
Production readiness and offline synchronization remain required.

Randy also clarified that project processes may be stopped after verifying that
they belong to this checkout. Processes belonging to other projects must remain
untouched; the older blanket prohibition in Claude's handoff is superseded.

Current scan and executable baseline are recorded in
[the readiness review](../verification/m19/readiness.md). Existing M19
certification remains open; previous milestone checkmarks are historical claims,
not evidence that current HEAD passes.

Every page paints fast on a slow phone, the budgets say ≥ 90 instead of
≥ 85, a bundle-size gate stops regressions, the app works offline for the
editor once installed, and the whole product is re-certified against the
competitor list after the feature series. This milestone is last so that
every feature is measured once, in its final shape.

Measured before this series (M10, mobile, simulated slow 4G, median of
five): landing FCP 2.7 s / LCP 2.9 s / 91; library FCP 2.7 s / LCP 3.2 s /
89; editor FCP 2.9 s / LCP 3.5 s / 85. Cause: a client-rendered SPA paints
nothing until ~220 kB gzipped JS runs; signed-in pages then wait on three
serial fetches (session → organization list → organization detail and
role) before rendering.

### Additional owner decisions — 2026-09-08

- Product name: **Lumafoil**. Canonical domain: **lumafoil.com**. No redirects
  from wtrmrk.app or watermark.blowmoney.net. Preserve existing production accounts;
  verify pre-cutover counts privately and retain account identities.
- Launch is **invite-only**. Public signup must be blocked in the server as well
  as removed from marketing. Invited users need a coherent verification flow.
- Replace the rejected generic editorial landing with a product-led design
  based on real competitor research and authentic app views. Deliver a complete
  branding kit, and link to the actual GitHub repository from the footer.
- More than **500 unique font families**, plus a varied, high-quality sticker
  library. Assets must be licensed for use in users' exported content.
- Users must generate and save multiple QR-code watermarks. Verify actual scans.
- Cloud providers must support import, writing and **native sharing links** as
  well as Lumafoil gallery links. Finish provider registrations on the new domain.
- The owner deleted the old Dropbox registration. A replacement Lumafoil app
  was created with app-folder access; its new public key is recorded in migration evidence.
- Set up **support@lumafoil.com** as a Microsoft 365 shared mailbox using the
  owner's existing licensed operator account. Keep Cloudflare transactional sending.

- Every user may invite others; each gets a unique rotatable invitation link with private count-only attribution. Administrators can track aggregate user numbers.
- Each account owns a private workspace. Invitations do not grant access to inviter content. Test server IDs, downloads, caches, offline queues, account changes and explicit sharing.
- Google and Microsoft support account creation/sign-in separately from cloud-file consent. New users still need invitation admission; existing accounts link identities through authenticated settings.
- Landing copy must explain real features in depth, using https://www.ezywatermark.com/features as the requested structural reference. Preserve original writing and Lumafoil artwork.
- The owner selected the original rounded landing icon over the heavier OAuth icon; all kit/provider assets must use its exact geometry.
- Parallel agents are explicitly authorized. Root owns integration/provider setup/landing; scoped agents own private accounts, offline reliability and creative/cloud capabilities.

- The 2026-09-10 correction supersedes the earlier single-administrator wording:
  Randy is the immutable global Owner; the initial state has zero Admins; Owner
  and later Admins may manage non-owner users, while no Admin can alter the
  Owner. Private workspace ownership is distinct from global site roles.
- Explain invitation-only hosting and free self-hostable GitHub source clearly near the landing actions; add a secure empty-database owner procedure.

### Additional owner decisions — 2026-09-09

- Standard-user dashboards need Recent work with thumbnail, list and details views, remembered per account.
- No secrets, private user data or sensitive operational records may be published in the public source or release artifacts; audit history and current candidates and enforce commit/CI checks.
- Apply the supplied MIT Liquid Glass UI Kit style to the app in the current rose palette. The landing layout is approved; replace its product screenshots after app UI changes. Preserve the supplied kit notice.
- The owner explicitly made the complete production launch an active goal; continue implementation, verification and cutover autonomously within the accepted boundaries.

### Additional owner decisions — 2026-09-10

- Standard users open directly in the Editor. They do not need a dashboard;
  Owners and Admins retain a compact operational Overview.
- Preset recents belong in Library and photo recents belong in Gallery, with
  thumbnail, list and details views. Synchronization status, counts and the
  manual Sync now action belong at the bottom of the desktop rail and phone menu.
- The Editor side panel contains the complete watermark designer. No separate
  Create watermark popup remains. Both the designer and editor expose undo and
  redo, and a continuous canvas gesture is one history step.
- Canvas input and rendering must stay responsive for mouse, touch, pen,
  keyboard, sliders and form controls. Preview rendering is frame-scheduled with
  a single in-flight render and a latest-only pending request.
- The 551-family picker is one clipped, wheel/touch/keyboard-scrollable dropdown
  with account-scoped recent fonts and each family name rendered in its face.
- Export destinations use a uniform action layout. Imported images preserve
  their intrinsic aspect ratio under simultaneous viewport width/height limits.
- Presets and Watermark are separate Editor tools. The inline designer has no
  nested card, Editor is first in workspace navigation, scrollbars use the rose
  theme and stay clipped inside rounded panels, and Sync now is centered.
- Canvas documents, draft marks and source photos restore from account/workspace
  scoped IndexedDB after reload. Native canvas-image drags cannot import a
  duplicate, empty Logo drafts do not request an asset, and placement/appearance
  sliders expose one-click default resets.

## Targets (`PLAN.md` §5.5 after M19)

| Metric                                      | Budget                                     |
| ------------------------------------------- | ------------------------------------------ |
| Lighthouse Performance, mobile, every page  | ≥ 90 (median of five)                      |
| Lighthouse Performance, desktop, every page | ≥ 95                                       |
| Accessibility / Best practices              | 100 / ≥ 95                                 |
| FCP mobile (simulated slow 4G)              | ≤ 1.8 s on public pages, ≤ 2.2 s signed in |
| LCP mobile                                  | ≤ 2.5 s everywhere                         |
| Initial JS for `/` (gzip)                   | ≤ 90 kB                                    |
| Initial JS for `/app/*` shell (gzip)        | ≤ 140 kB                                   |
| Route chunk, any (gzip)                     | ≤ 60 kB excluding the engine worker        |
| CLS                                         | ≤ 0.02                                     |
| TBT mobile                                  | ≤ 150 ms                                   |

## Work, in order (measure after each step; keep what helps)

### 1. Paint before JavaScript

- The application HTML carries a static branded skeleton and an early theme
  script. Its inline script hash is added to the built CSP; source headers are
  not mutated by building. Actual first-paint/theme proof remains a UI gate.
- The canonical React landing, privacy and terms components are rendered during
  the build for all twelve supported locales by `src/client/prerender.tsx` and
  `scripts/prerender.mjs`. This replaced the proposed browser/server capture:
  no running preview, signed-in session or credentials are required. Public
  pages use small native theme/language controls rather than the private app
  bootstrap. Login, signup and dynamic bearer-link pages retain the app shell.
- Hero screenshots use one themed responsive picture; feature screenshots have
  responsive sources. Final captures must follow the accepted glass app UI.

### 2. Verify the account and collapse the fetch chain

- The original cache-first private rendering proposal is superseded. Online
  boot verifies live identity before admitting cached private state. Only an
  actual transport outage may use prepared display state; 401/403 responses,
  malformed/future snapshots, owner mismatches and changed account generations
  cannot authorize fallback. Valid display snapshots have no arbitrary age
  limit during a sustained outage. They contain no session/provider tokens.
- One origin-checked `POST /api/me/bootstrap` response returns the caller's
  session, workspace list, selected workspace and role, and seeds the four
  existing query keys. POST is required because onboarding may ensure a private
  workspace or repair the caller's active selection. Canonical Better Auth
  operations remain the underlying source of truth.
- A private workspace is always ensured, including for someone whose first
  admission was to a collaboration. A valid selected collaboration is preserved;
  no selection defaults to the personal workspace. A revoked/foreign selection
  is cleared only for that caller and returns `selectionRequired`, with no
  selected content or role. The existing chooser handles recovery without a
  sign-in loop. Account checks cover response headers/body, request completion,
  SDK callbacks/retries and query adoption.
- The existing lightweight `zod/mini` shell schemas validate and cross-link
  display fields. No parallel hand-written validator or new persistence
  dependency was introduced. `query-persister.ts` owns display snapshots;
  durable edits remain in account/workspace-scoped IndexedDB stores.
- Editor/designer frame and sample-scene readiness remain measured obligations;
  a skeleton alone does not count as completed private content or an LCP pass.

### 3. JavaScript diet

- Measure with `scripts/bundle-report.mjs` (new: reads
  `dist/client/.vite/manifest.json`, prints gzip and brotli sizes per
  entry and per route with the initial-load set marked).
- Boot display schemas use `zod/mini`; form-specific classic Zod validation
  remains lazy. Do not remove validation or pull unrelated form validators into
  an initial chunk. Inspect the actual rendered module graph and bytes after
  grouping changes, rather than assuming a chunk label proves a smaller boot.
- Radix UI chunk (54 kB gz): audit which primitives the shell needs
  (Dialog for the menu sheet, DropdownMenu for the account menu); move
  `Select`, `Slider`, `Tabs`, `RadioGroup`, `Switch` imports into the
  routes that use them so the `ui` chunk group splits into `ui-shell` and
  `ui-editor`.
- `better-auth` client (14.5 kB gz): needed on every signed-in page for
  the session; check for tree-shaking of unused plugins (organization
  and admin plugins are needed; `two-factor` etc. must not be included).
- `lucide-react`: confirm every icon import is a named import (tree-shaken)
  and that no dynamic `icons` map is bundled in the shell.
- Fonts: Inter variable is 49 kB; keep it, but `font-display: optional`
  on the landing page's first paint is not acceptable (brand); keep
  `swap` with the metric-matched fallback (already done).

### 4. Durable offline work and installed app updates

The canonical root worker is `public/sw.js`, registered by the mounted
`OfflinePanel` through `offline-registration.ts`. The build produces a complete
byte-versioned static inventory and independent offline shell. The installer
fetches immutable app, font and sticker assets with bounded concurrency; it
does not cache API responses, authenticated media or navigation URLs containing
invitation/share tokens. The narrow `/share-target` worker remains separate and
its account-scoped inbox hands off to the app.

Photos, gallery saves, preset edits and required logo resources persist in
account/workspace-scoped IndexedDB with an outbox. Reload/restart, long outages,
lost acknowledgements, replay after reconnect, conflict recovery and denied
permission retain explicit behavioral tests. Local save, pending replay,
confirmed server save and conflicts have distinct visible states. Online-only
account, membership, administration and share-publishing actions do not use a
cached authorization fallback.

Updates wait for an explicit reload; existing tabs may retain the previous
static cache. The two-version update journey remains a separate release gate.
The earlier global `Clear-Site-Data` logout policy is superseded: delayed old
responses must not erase a newer account's queued edits. Server sessions are
revoked and responses remain `no-store`; awaited, serialized client cleanup
rechecks pending work transactionally and clears only departing-account private
state. Public assets can remain cached.

### 5. Gates

- `scripts/bundle-budget.mjs` in `npm run quality`: fails when any
  budget in the table above is exceeded (sizes from the manifest and
  `gzip-size` computed in-process with `node:zlib`; no dependency).
- Lighthouse budgets raised in `scripts/lighthouse.mjs`; the scripts also
  assert FCP/LCP/CLS/TBT numeric budgets, not only the score.
- A Playwright "cold load" test measures `performance.getEntriesByType('navigation')`
  and `largest-contentful-paint` on `/app/editor` with a CPU throttle of
  4× (`page.emulateMedia` cannot throttle; use CDP
  `Emulation.setCPUThrottlingRate` on desktop-chrome only) and asserts
  LCP < 2.5 s; recorded, not budget-blocking in CI (noise), blocking
  locally at certification.

### 6. Production hardening (the non-perf part of "production grade")

- Dependency refresh: `npm outdated`; upgrade everything within peer
  ranges after checking release notes; re-pin; run the whole gate set.
- Observability: request IDs, bounded sanitized client-error reports and the
  existing seven-day application database retention are implemented. A real
  hosted probe found that Cloudflare custom logs retain request paths even with
  invocation logs disabled and query strings redacted. Disabling that platform
  persistence and verifying the final deployed settings is therefore a release
  requirement; sanitized application diagnostics, health and audit records
  remain available. Do not equate absent invocation records with bearer-path
  privacy or claim hosted protection before the configured release is checked.
- Health and uptime, without any dashboard: a scheduled trigger in
  `wrangler.jsonc` (`triggers.crons: ["*/5 * * * *"]`) runs a `scheduled`
  handler that fetches `/api/health` and does one D1 read, writes the
  result to a `health_check` table (kept 7 days) and logs a failure
  line; the admin console shows the last 24 hours.
- A11y and security re-audit: axe on every page in every language is
  already in e2e; run `npm run security:sast`, `npm audit`, and re-read
  `SECURITY.md` and the threat model against the M11–M18 additions;
  update the "Reviewed" date at the top of the threat model.
- Competitor re-check: re-run the research prompt from
  `docs/competitor-research.md` (a subagent with web access; same
  product list plus any new entrant found), update the feature matrix
  with a "Lumafoil" column, and list anything still missing in
  PLAN §4. The README status line then says which competitor features
  the product matches and exceeds, with the date.

## Canonical files and proof

Build and performance: `scripts/{build,prerender,bundle-report,bundle-budget,
lighthouse}.mjs`, `scripts/lib/bundle-inventory.ts`, `vite.config.ts`,
`src/client/prerender.tsx` and the existing public-page components. Public and
private boot graphs must be inspected independently; selected diagnostics do
not certify all pages.

Private startup: `src/worker/bootstrap.ts`, the canonical private-workspace
helper, `src/shared/{shell-cache,bootstrap,account-identity}.ts`,
`src/client/lib/{app-bootstrap,bootstrap-request,queries,query-persister,
auth-account,auth-client}.ts` and the existing app route/layout. Node, real D1
and browser tests cover new/repeat onboarding, existing collaboration, revoked
selection, cross-account/stale responses, transport fallback, pending-work
protection and malformed data. Two maintained bootstrap red drills prove the
account mismatch and request-consolidation checks can fail meaningfully.

Offline: `public/sw.js`, `public/share-target-sw.js`, the existing
`offline-*.ts` modules and `OfflinePanel`. Browser tests cover account
transitions, durable binary storage, outbox replay, owner-bound import, lost
acknowledgements and keep-both conflicts; complete four-device E2E and a real
two-version update journey remain required.

Security/publication: the canonical Worker middleware and sanitized diagnostic
paths, `scripts/publication-scan.mjs`, publication policy helpers and their
negative-control tests. The exact retired Picker-key digest/finding exception
applies to historical copies only; current private-value, index, build and
archive checks remain strict. Final SAST, publication and hosted logging checks
must use the current configuration.

Keep actual red/restored-green receipts under `docs/red-drill/` and focused
verification documents under `docs/verification/m19/`. Test counts, global
coverage, full quality, all-page performance, accessibility and release results
are separate gates. Never refresh an old receipt's source binding without
executing its check again.

## Deferred audits (from M12–M18)

e2e, Lighthouse and screenshots were deferred from every feature milestone
to here (Randy, 2026-09-06/07). M19 captures and budgets them all in one
pass: run the full `npm run test:e2e` (all four device projects) once, then
`scripts/screenshots.mjs m19 all` and `scripts/lighthouse.mjs m19` (and
`mobile`) over every page **including the new tools and screens each
milestone added**, and the `/app/library/new` bundle-size budget (≤ 5 kB gz
growth per feature milestone). As each milestone lands, append the screens
and flows it introduced to this list so nothing is missed:

- M11: editor Adjust tab (already captured under `docs/screenshots/m11/`).
- M12: designer **Text effects** (Solid/Outline/Emboss/Engrave, curve,
  letter spacing), the **Shape** mark tab, the **Frame** control (editor
  Adjust tab and bulk Photo adjustments), and **random placement** with
  jitter; the Emoji glyph group in the symbol picker. e2e: a text-effects /
  shape / frame / random journey. Confirm the `/app/library/new` JS grew
  ≤ 5 kB gz. (Icon search and the Shuffle button were carried forward, see
  PLAN.md M12.)
- M13: the editor Export tab and the bulk output settings with the **Metadata**
  policy radio group (strip / keep-except-location / keep, WebP disabled); the
  designer **Insert detail** token menu. e2e: upload the EXIF fixture, stamp
  `{camera} {iso}`, export JPEG "keep except location", and confirm in Node
  (via `exifr`) that Model is present and GPS is gone.
- M14: the bulk **folder input** and folder drag-and-drop; the **file-name
  pattern** field with its live example; **Pause/Resume** on a running batch;
  the **Download report** (CSV) button; the "Show all" row expansion; the
  per-photo **override** dialog (full editor embedded, "Custom" badge) and the
  desktop **watch-folder** card (delivered in 1.6.1 — see PLAN.md M14).
- M15: library Import dialog; the designer logo-prepare panel; `/app/verify`.
- M16: the import buttons (camera, "From a link") on the editor and bulk tools;
  `/privacy` and `/terms`. (The cloud pickers land in a follow-up with the OAuth
  registration; add them to this list then, and confirm best practices ≥ 95 with
  the picker CSP origins.)
- M17: `/app/video` and `/app/documents`.
- M18: every page in `ar` (right-to-left) at three widths, plus the language
  menu.

If a milestone changed a page already in the shot list, note that too so
M19 re-reviews it.

## Certification checklist

- [ ] every §5.5 budget met on every page (all tools and screens from
      M11–M18 included), mobile and desktop, median of five, recorded under
      `docs/lighthouse/m19/`
- [ ] bundle report committed under `docs/bundle/m19.md`; budget gate green
- [ ] offline journey green; update flow checked by hand on the
      production build (two deploys) and recorded in §8
- [ ] competitor re-check done; matrix updated; README status line updated
- [ ] full gate set, full drill, full device matrix, screenshots in `en`
      and `ar`
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 2.0.0, tag, deploy, release

## Current delivery evidence

This ledger tracks the current takeover scope. Historical milestone certification
checklists above and in the root roadmap are retained under the project rules.

Implementation statuses were reconciled on 2026-09-10 against the current code,
provider configuration and the [integrated quality checkpoint](../verification/m19/quality.md).
The implemented state does not certify hosted behavior or the final device
matrix. Startup performance, final release gates and provider consent remain
active; the domain cutover is complete. No task has been promoted to verified
from a partial result. The
[real D1 restore rehearsal](../verification/m19/d1-restore-rehearsal.md) and
[live logging remediation](../verification/m19/platform-observability-privacy.md)
provide bounded operator evidence, while final migration and hosted checks
remain open. The supported SDK gate and offline lifecycle rerun provide focused
browser evidence; the shared [27-route audit inventory](../verification/m19/audit-inventory.md)
and updated red-drill manifest still require their complete final runs.
Existing stale receipts are retained as history.

```quality-ledger
{
  "schema_version": 1,
  "work": {
    "id": "M19-OFFLINE",
    "title": "Lumafoil invite-only production launch, offline sync and creative library",
    "scope_revision": 6,
    "brief": "PLAN.md",
    "brief_reason": null,
    "rules": [
      {
        "path": "AGENTS.md",
        "revision": "2026-09-08"
      }
    ],
    "inputs": [
      "SECURITY.md",
      "vitest.config.ts",
      "playwright.config.ts",
      "wrangler.jsonc",
      "docs/verification/m19/design.md",
      "docs/competitor-research.md",
      "docs/private-accounts.md",
      "docs/self-hosting.md"
    ],
    "environment": {
      "platform": "windows",
      "tools": {
        "python": "3.14.0",
        "node": "24.20.0",
        "npm": "11.19.0"
      }
    }
  },
  "requirements": [
    {
      "id": "M19-R-BOOT",
      "statement": "Restore only validated non-secret shell state and refresh workspace identity after mutations.",
      "priority": "critical",
      "acceptance": [
        "M19-A-BOOT"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-SYNC",
      "statement": "Durably save photos and presets offline and synchronize under current server authorization.",
      "priority": "critical",
      "acceptance": [
        "M19-A-SYNC"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-UX",
      "statement": "Expose offline, pending, synced and conflict states accessibly across supported devices.",
      "priority": "critical",
      "acceptance": [
        "M19-A-UX"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-GATES",
      "statement": "Restore the production quality, security, performance and release gates without weakening their thresholds.",
      "priority": "critical",
      "acceptance": [
        "M19-A-GATES"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-DESIGN",
      "statement": "Preserve the approved illustrated landing layout; apply the supplied liquid-glass style to app/auth UI with rose #C86B82, accessible contrast and responsive reduced-motion/transparency behavior. Recapture authentic product screenshots afterward. Explain invitation-only hosted access and free GitHub self-hosting.",
      "priority": "normal",
      "acceptance": [
        "M19-A-DESIGN"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-BRAND",
      "statement": "Deliver the full Lumafoil branding kit and migrate to lumafoil.com without redirects.",
      "priority": "critical",
      "acceptance": [
        "M19-A-BRAND"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-INVITE",
      "statement": "Every user can invite new users through a unique, rotatable, attributable link or a targeted invitation; admission stays invite-only and counts expose no other user content.",
      "priority": "critical",
      "acceptance": [
        "M19-A-INVITE"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-ASSETS",
      "statement": "Provide over 500 unique font families and a varied high-quality sticker library legally usable in exported content.",
      "priority": "normal",
      "acceptance": [
        "M19-A-ASSETS"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-QR",
      "statement": "Generate, save and reuse multiple named QR-code watermarks.",
      "priority": "normal",
      "acceptance": [
        "M19-A-QR"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-CLOUD",
      "statement": "Finish Google Drive, Dropbox and OneDrive import, write and native sharing alongside Lumafoil gallery links.",
      "priority": "critical",
      "acceptance": [
        "M19-A-CLOUD"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-MAIL",
      "statement": "Set up support@lumafoil.com as a Microsoft 365 shared mailbox with the existing licensed operator account.",
      "priority": "normal",
      "acceptance": [
        "M19-A-MAIL"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-AUTH",
      "statement": "Support Google and Microsoft account creation and sign-in with server-enforced invite-only admission and safe explicit account linking.",
      "priority": "critical",
      "acceptance": [
        "M19-A-AUTH"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-PRIVACY",
      "statement": "Keep accounts, content, invitation attribution and cloud/offline resources isolated by user on server and browser boundaries.",
      "priority": "critical",
      "acceptance": [
        "M19-A-PRIVACY"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-ADMIN",
      "statement": "Randy is the only platform administrator; other users own their personal workspace without global administrative access.",
      "priority": "critical",
      "acceptance": [
        "M19-A-ADMIN"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-RESOURCES",
      "statement": "Bound actual request bytes and enforce photo/logo storage quotas atomically, including concurrent uploads, retries, thumbnails and cleanup.",
      "priority": "critical",
      "acceptance": [
        "M19-A-RESOURCES"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-RECENTS",
      "statement": "Give standard users private Recent work with thumbnail, list and details views and a remembered per-account preference.",
      "priority": "critical",
      "acceptance": [
        "M19-A-RECENTS"
      ],
      "superseded_by": null
    },
    {
      "id": "M19-R-PUBLICATION",
      "statement": "Prevent credentials, private user/operational records and sensitive artifacts from being published in the public repository or release.",
      "priority": "critical",
      "acceptance": [
        "M19-A-PUBLICATION"
      ],
      "superseded_by": null
    }
  ],
  "acceptance": [
    {
      "id": "M19-A-BOOT",
      "requirement": "M19-R-BOOT",
      "given": "A returning user or a newly created workspace",
      "when": "The app boots, reloads offline, changes account, or signs out",
      "then": "The correct workspace renders; tokens are absent from durable data and no previous account data leaks.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-SYNC",
      "requirement": "M19-R-SYNC",
      "given": "A known user/workspace with queued photo or preset saves",
      "when": "The browser restarts or reconnects, including a lost acknowledgement or concurrent remote edit",
      "then": "Saved work survives, retries create no duplicates, conflicts preserve work, and changed account or permissions cannot authorize replay.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-UX",
      "requirement": "M19-R-UX",
      "given": "An offline or reconnecting photo workflow",
      "when": "A user saves, reviews pending work, or resolves a failure",
      "then": "Responsive translated controls report the actual local/remote state with zero axe violations.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-GATES",
      "requirement": "M19-R-GATES",
      "given": "The final M19 source",
      "when": "Required local and remote gates execute",
      "then": "All applicable gates pass with recorded output; unavailable external proof remains explicitly open.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-DESIGN",
      "requirement": "M19-R-DESIGN",
      "given": "The final landing and authenticated tools in English and Arabic, light and dark, at desktop, phone and tablet widths",
      "when": "Users navigate, select a theme, edit, save, and resolve pending work",
      "then": "The app reflects the approved glass style in the existing rose palette; the approved landing content/layout stays intact with new authentic screenshots; controls, all views and manual themes remain accessible/responsive and meet performance budgets.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Visual hierarchy, image composition and interaction polish require an actual screenshot and UI review."
    },
    {
      "id": "M19-A-BRAND",
      "requirement": "M19-R-BRAND",
      "given": "The new domain, branding and provider registrations",
      "when": "The production app and provider content are published",
      "then": "Only lumafoil.com hosts the app; old app domain is detached; both existing accounts remain; logos, icons, social assets, guidelines and accurate legal/provider content are available.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider state, visual output or external mailbox behavior requires direct observation."
    },
    {
      "id": "M19-A-INVITE",
      "requirement": "M19-R-INVITE",
      "given": "An existing user with a unique referral link or email-bound invitation, and an anonymous new user",
      "when": "The new user registers and verifies identity, or the inviter rotates/revokes the link",
      "then": "Valid admission creates a separate private workspace; invalid or revoked links cannot admit new users; inviter sees acceptance counts without invitee personal data; administrator sees aggregate user numbers.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-ASSETS",
      "requirement": "M19-R-ASSETS",
      "given": "The creative asset pickers",
      "when": "Users search, choose, save and export assets online or offline",
      "then": "Unique family counts, actual decodability, image quality, provenance and content-use licenses are verified; required notices travel with the distributed assets.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider state, visual output or external mailbox behavior requires direct observation."
    },
    {
      "id": "M19-A-QR",
      "requirement": "M19-R-QR",
      "given": "Distinct QR payloads and presets",
      "when": "The user saves, reloads and exports QR marks",
      "then": "Multiple codes remain independently editable and reusable; an independent decoder reads the expected payload from exported images.",
      "checks": [
        "behavior",
        "red"
      ],
      "manual_reason": null
    },
    {
      "id": "M19-A-CLOUD",
      "requirement": "M19-R-CLOUD",
      "given": "Configured cloud providers on lumafoil.com",
      "when": "An invited user imports, saves and explicitly shares a generated file",
      "then": "Provider permissions, callbacks and branding are correct; real read/write/share paths pass; errors/cancellation/offline states preserve work and do not silently publish files.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider state, visual output or external mailbox behavior requires direct observation."
    },
    {
      "id": "M19-A-MAIL",
      "requirement": "M19-R-MAIL",
      "given": "Verified lumafoil.com email DNS",
      "when": "The owner accesses and replies through the support mailbox",
      "then": "Shared mailbox exists with the correct domain and access; Microsoft inbound mail coexists with Cloudflare transactional sending; no unnecessary mailbox license is purchased.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider state, visual output or external mailbox behavior requires direct observation."
    },
    {
      "id": "M19-A-AUTH",
      "requirement": "M19-R-AUTH",
      "given": "New invited users, returning linked identities, and existing password accounts",
      "when": "Google or Microsoft callbacks complete, fail, replay, or present an unverified email",
      "then": "New identities require valid admission; returning linked users sign in without a new invitation; explicit authenticated linking prevents email takeover; secrets stay server-only and provider tokens never enter offline storage.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider/account boundaries need actual browser and production observation after local negative tests."
    },
    {
      "id": "M19-A-PRIVACY",
      "requirement": "M19-R-PRIVACY",
      "given": "Distinct users, guessed IDs, revoked membership, stale callbacks, multiple tabs and offline queues",
      "when": "A user reads, changes, downloads, syncs, switches accounts or follows an explicit share link",
      "then": "Unrelated user data is denied; invitations do not grant content access; cached media does not bypass live denials; stale operations cannot write under a new identity; only explicitly selected shared files are public.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Hosted provider/account boundaries need actual browser and production observation after local negative tests."
    },
    {
      "id": "M19-A-ADMIN",
      "requirement": "M19-R-ADMIN",
      "given": "The existing Randy and Ivett accounts plus ordinary invited users",
      "when": "An account opens global administration, requests account totals, or attempts to create/promote another administrator",
      "then": "Only the verified operator account has site administration; others are refused; private workspace ownership and sending invitations do not grant site-wide privileges.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Final role configuration and storage lifecycle require actual binding/deployment observation as well as negative tests."
    },
    {
      "id": "M19-A-RESOURCES",
      "requirement": "M19-R-RESOURCES",
      "given": "Requests with missing or misleading lengths, concurrent uploads at quota, lost replies and failed object deletion",
      "when": "The Worker reads, reserves, writes, commits, deletes or retries private stored content",
      "then": "Oversized streams are refused before unbounded buffering, parallel requests cannot overspend quotas, retries cannot duplicate content, and failed cleanup remains charged and recoverable.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Final role configuration and storage lifecycle require actual binding/deployment observation as well as negative tests."
    },
    {
      "id": "M19-A-RECENTS",
      "requirement": "M19-R-RECENTS",
      "given": "A user with recently opened or saved photos/presets, empty history, and another unrelated account",
      "when": "The user opens the dashboard, changes view, opens an item, deletes content, reconnects or switches accounts",
      "then": "Actual accessible recent work is ordered usefully, opens the correct resource, shows genuine previews/details/sync state, and never reveals another account browsing history or inaccessible content.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Rendered views and publication artifacts need human-visible verification beyond structural tests."
    },
    {
      "id": "M19-A-PUBLICATION",
      "requirement": "M19-R-PUBLICATION",
      "given": "The final source, Git history, staged candidates, docs, screenshots and archives",
      "when": "Publication checks, manual artifact review, commit hooks and CI execute",
      "then": "Confidential values and forbidden private paths fail closed; known real server secrets are absent; only narrowly documented public identifiers are exempted; checked artifacts and docs contain synthetic or redacted evidence.",
      "checks": [
        "behavior",
        "red",
        "manual"
      ],
      "manual_reason": "Rendered views and publication artifacts need human-visible verification beyond structural tests."
    }
  ],
  "tasks": [
    {
      "id": "M19-T-BOOT",
      "purpose": "Restore only validated non-secret shell state and refresh workspace identity after mutations.",
      "acceptance": [
        "M19-A-BOOT"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/lib/query-persister.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/query-persister.test.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/queries.ts",
          "action": "modify"
        },
        {
          "path": "src/client/routes/app/route.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/app-shell.tsx",
          "action": "modify"
        }
      ],
      "status": "active",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-SYNC",
      "purpose": "Durably save photos and presets offline and synchronize under current server authorization.",
      "acceptance": [
        "M19-A-SYNC"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/lib/library.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/gallery.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/library.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/photos.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/stores.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/db/library-stores.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/offline-access.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-cache.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-context.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-database.browser.test.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-database.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-media.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-model.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-registration.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-status.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-sync.browser.test.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-sync.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-workspace.browser.test.ts",
          "action": "create"
        },
        {
          "path": "src/client/lib/offline-workspace.ts",
          "action": "create"
        },
        {
          "path": "src/shared/sync.ts",
          "action": "create"
        },
        {
          "path": "src/shared/shell-cache.ts",
          "action": "create"
        },
        {
          "path": "src/worker/sync.ts",
          "action": "create"
        },
        {
          "path": "src/worker/request-body.ts",
          "action": "create"
        },
        {
          "path": "e2e/offline.spec.ts",
          "action": "create"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-UX",
      "purpose": "Expose offline, pending, synced and conflict states accessibly across supported devices.",
      "acceptance": [
        "M19-A-UX"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/components/app-shell.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/editor/editor.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/bulk/bulk-tool.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/designer/watermark-designer.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-GATES",
      "purpose": "Restore the production quality, security, performance and release gates without weakening their thresholds.",
      "acceptance": [
        "M19-A-GATES"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "package.json",
          "action": "modify"
        },
        {
          "path": "package-lock.json",
          "action": "modify"
        },
        {
          "path": "scripts/deploy.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/prerender.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/bundle-budget.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lighthouse.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/screenshots.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/route-preloads.ts",
          "action": "modify"
        },
        {
          "path": "scripts/route-preloads.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/bundle-inventory.ts",
          "action": "modify"
        },
        {
          "path": "scripts/lib/audit-certificate.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/audit-certificate.browser.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/compressing-proxy.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/compressing-proxy.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/bundle-sizes.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/prepare-d1-restore.py",
          "action": "modify"
        },
        {
          "path": "scripts/test-prepare-d1-restore.py",
          "action": "modify"
        },
        {
          "path": "scripts/gate-server.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/verify-built.test.mjs",
          "action": "modify"
        },
        {
          "path": "worker-configuration.d.ts",
          "action": "modify"
        },
        {
          "path": "scripts/lib/gate-runtime.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/gate-http-bridge.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/gate-routing.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/gate-runtime.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/gate-http-bridge.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/lighthouse-navigation.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lighthouse-navigation.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/audit-surfaces.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/audit-surfaces.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/audit-content.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/audit-content.browser.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/fixtures/audit-accounts.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/fixtures/lighthouse-surfaces.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/dev-mailbox.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/red-drills.mjs",
          "action": "modify"
        },
        {
          "path": ".github/workflows/audit-ui.yml",
          "action": "modify"
        },
        {
          "path": ".github/workflows/ci.yml",
          "action": "modify"
        },
        {
          "path": ".github/workflows/deploy.yml",
          "action": "modify"
        },
        {
          "path": "playwright.config.ts",
          "action": "modify"
        },
        {
          "path": "src/client/pdf/raster.ts",
          "action": "modify"
        },
        {
          "path": "src/client/pdf/raster.browser.test.ts",
          "action": "modify"
        },
        {
          "path": "scripts/lib/audit-chrome.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/audit-chrome.test.mjs",
          "action": "modify"
        },
        {
          "path": "e2e/offline-network.ts",
          "action": "modify"
        },
        {
          "path": "scripts/lib/offline-proxy.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/offline-proxy.d.mts",
          "action": "modify"
        },
        {
          "path": "scripts/offline-proxy.test.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/test-http-request.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lib/lighthouse-page.mjs",
          "action": "modify"
        },
        {
          "path": "scripts/lighthouse-page.test.mjs",
          "action": "modify"
        },
        {
          "path": "src/client/components/recent-work/recent-thumbnail.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/recent-work/recent-work.tsx",
          "action": "modify"
        }
      ],
      "status": "active",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-DESIGN",
      "purpose": "Apply and verify the accepted rose visual direction in canonical views and shared primitives.",
      "acceptance": [
        "M19-A-DESIGN"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/styles/app.css",
          "action": "modify"
        },
        {
          "path": "src/client/routes/index.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/app-shell.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/auth-layout.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/brand-mark.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/ui/input.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/components/ui/button-variants.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/theme.ts",
          "action": "modify"
        },
        {
          "path": "index.html",
          "action": "modify"
        },
        {
          "path": "public/favicon.svg",
          "action": "modify"
        },
        {
          "path": "public/manifest.webmanifest",
          "action": "modify"
        },
        {
          "path": "public/icon-192.png",
          "action": "modify"
        },
        {
          "path": "public/icon-512.png",
          "action": "modify"
        },
        {
          "path": "public/apple-touch-icon.png",
          "action": "modify"
        },
        {
          "path": "public/photography/coast-480.webp",
          "action": "create"
        },
        {
          "path": "public/photography/coast-840.webp",
          "action": "create"
        },
        {
          "path": "public/photography/coast-1400.webp",
          "action": "create"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-BRAND",
      "purpose": "Deliver the full Lumafoil branding kit and migrate to lumafoil.com without redirects.",
      "acceptance": [
        "M19-A-BRAND"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "wrangler.jsonc",
          "action": "modify"
        },
        {
          "path": "src/shared/constants.ts",
          "action": "modify"
        },
        {
          "path": "public/favicon.svg",
          "action": "modify"
        },
        {
          "path": "scripts/build-brand.py",
          "action": "create"
        },
        {
          "path": "docs/runbook.md",
          "action": "modify"
        }
      ],
      "status": "active",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-INVITE",
      "purpose": "Allow new accounts only through a valid pending invitation for the submitted email.",
      "acceptance": [
        "M19-A-INVITE"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/worker/auth/options.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/auth/invitation-admission.ts",
          "action": "create"
        },
        {
          "path": "src/client/routes/signup.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/routes/login.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/routes/check-email.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-ASSETS",
      "purpose": "Provide over 500 unique font families and a varied high-quality sticker library legally usable in exported content.",
      "acceptance": [
        "M19-A-ASSETS"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/fonts/catalogue.ts",
          "action": "modify"
        },
        {
          "path": "src/client/fonts/load.ts",
          "action": "modify"
        },
        {
          "path": "src/client/fonts/extended-catalogue.json",
          "action": "create"
        },
        {
          "path": "scripts/vendor-fonts.py",
          "action": "create"
        },
        {
          "path": "src/client/components/designer/font-picker.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-QR",
      "purpose": "Generate, save and reuse multiple named QR-code watermarks.",
      "acceptance": [
        "M19-A-QR"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/engine/render.ts",
          "action": "modify"
        },
        {
          "path": "src/client/engine/qr.ts",
          "action": "modify"
        },
        {
          "path": "src/client/components/designer/watermark-designer.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/routes/app/library/index.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-CLOUD",
      "purpose": "Finish Google Drive, Dropbox and OneDrive import, write and native sharing alongside Lumafoil gallery links.",
      "acceptance": [
        "M19-A-CLOUD"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/lib/imports/google-drive-save.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/imports/dropbox-save.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/imports/onedrive.ts",
          "action": "modify"
        },
        {
          "path": "src/client/components/import/cloud-save-buttons.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-MAIL",
      "purpose": "Set up support@lumafoil.com as a Microsoft 365 shared mailbox with the existing licensed operator account.",
      "acceptance": [
        "M19-A-MAIL"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "docs/runbook.md",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-AUTH",
      "purpose": "Support Google and Microsoft account creation and sign-in with server-enforced invite-only admission and safe explicit account linking.",
      "acceptance": [
        "M19-A-AUTH"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/worker/auth/options.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/auth/invitation-admission.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/env.ts",
          "action": "modify"
        },
        {
          "path": "src/client/routes/login.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/routes/signup.tsx",
          "action": "modify"
        },
        {
          "path": "src/client/routes/app/account.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-PRIVACY",
      "purpose": "Keep accounts, content, invitation attribution and cloud/offline resources isolated by user on server and browser boundaries.",
      "acceptance": [
        "M19-A-PRIVACY"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/worker/routes/accounts.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/db/account-store.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/offline-account.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/offline-media.ts",
          "action": "modify"
        },
        {
          "path": "public/share-target-sw.js",
          "action": "modify"
        },
        {
          "path": "migrations/0008_isolate_initial_accounts.sql",
          "action": "modify"
        },
        {
          "path": "src/client/lib/launch-files.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/launch-files.test.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/report-error.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/report-error.test.ts",
          "action": "modify"
        },
        {
          "path": "src/shared/observability.ts",
          "action": "modify"
        },
        {
          "path": "src/shared/observability.test.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/client-errors.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/client-errors.test.ts",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-ADMIN",
      "purpose": "Randy is the only platform administrator; other users own their personal workspace without global administrative access.",
      "acceptance": [
        "M19-A-ADMIN"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/worker/middleware/platform-admin.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/auth/options.ts",
          "action": "modify"
        },
        {
          "path": "src/client/routes/app/admin.tsx",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-RESOURCES",
      "purpose": "Bound actual request bytes and enforce photo/logo storage quotas atomically, including concurrent uploads, retries, thumbnails and cleanup.",
      "acceptance": [
        "M19-A-RESOURCES"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/worker/request-body.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/uploads.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/db/library-stores.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/photos.ts",
          "action": "modify"
        },
        {
          "path": "src/worker/routes/library.ts",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-RECENTS",
      "purpose": "Give standard users private Recent work with thumbnail, list and details views and a remembered per-account preference.",
      "acceptance": [
        "M19-A-RECENTS"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": "src/client/routes/app/index.tsx",
          "action": "modify"
        },
        {
          "path": "src/worker/db/schema.ts",
          "action": "modify"
        },
        {
          "path": "src/client/lib/offline-context.ts",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    },
    {
      "id": "M19-T-PUBLICATION",
      "purpose": "Prevent credentials, private user/operational records and sensitive artifacts from being published in the public repository or release.",
      "acceptance": [
        "M19-A-PUBLICATION"
      ],
      "depends_on": [],
      "changes": [
        {
          "path": ".gitleaks.toml",
          "action": "modify"
        },
        {
          "path": "package.json",
          "action": "modify"
        },
        {
          "path": ".husky/pre-commit",
          "action": "modify"
        },
        {
          "path": ".github/workflows/ci.yml",
          "action": "modify"
        }
      ],
      "status": "implemented",
      "evidence": [],
      "blocker": null,
      "superseded_by": null
    }
  ],
  "evidence": [
    {
      "id": "M19-E-READINESS-1",
      "acceptance": [
        "M19-A-BOOT",
        "M19-A-GATES",
        "M19-A-SYNC",
        "M19-A-UX"
      ],
      "kind": "readiness",
      "status": "stale",
      "command": [],
      "method": "Reviewed current source, authorizations, failure cases, integration ownership and baseline defects; requirements are implementable while executable certification remains open.",
      "environment": {
        "platform": "windows",
        "tools": {
          "python": "3.14.0",
          "node": "24.20.0",
          "npm": "11.19.0"
        }
      },
      "exit_code": null,
      "artifact": {
        "path": "docs/verification/m19/readiness.md",
        "sha256": "48d346e62fac98e22c038463057d276c906d1e5d4e86a35f190802c6125b98c6"
      },
      "inputs": [
        {
          "path": "AGENTS.md",
          "sha256": "48765e0d8f5deb0a8781aa961a9bd6ba57f2c88e2ee68bccb49ce51cccc4f73b"
        },
        {
          "path": "PLAN.md",
          "sha256": "8a0cce0552d0725ca39402f4ea54e7535f785ab9cfedbc722e178513215a3b7d"
        },
        {
          "path": "SECURITY.md",
          "sha256": "55164a4f2755e4118ad54c0bb5c1c4cdd53bb83e4d011bd463157b6cef4aca18"
        },
        {
          "path": "playwright.config.ts",
          "sha256": "6385ff355cab7ec06b256724a7a939fd937282720524710830fa9b51242e03b3"
        },
        {
          "path": "vitest.config.ts",
          "sha256": "cbd36bbe3f0fa403b780b9a22188f6754255a28e0561094f142a042dc5464e0c"
        },
        {
          "path": "wrangler.jsonc",
          "sha256": "d66181c086fa78c80054029958765a2ccdf7a4b7c81f1ca72bbf327c9e3e5a13"
        }
      ],
      "scope_sha256": "d1a479f4cc51a72cc2644f2f5724460b31188223b91a0706933cc1b8b29fde0d",
      "red": null,
      "reason": "Scope expanded to per-user invitations/counts, private workspaces, Google/Microsoft account sign-in, detailed eZy-inspired feature presentation and the original rounded icon; final binding/evidence must be renewed after integration."
    }
  ],
  "checkpoint": null
}
```
