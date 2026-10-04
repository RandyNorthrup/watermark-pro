# Canonical Admin audit fixture — 2026-10-04

This bounded correction starts from protected main
`3e7991a60a6b4e4b837aa5384c6f31f8f46d1888` in an isolated worktree. Its only
code change is the existing `admin-users` fixture: import the shared
`parseAdminSection` and use its default in the fixture URL query. The declared
route, strict final Document/H2 validator, content checks, authentication,
production UI and performance budgets remain unchanged.

The prior repaired Admin browser renders verified Owner content successfully,
but its original `/app/admin` Document differs from the final
`/app/admin?section=users` history URL. That observed navigation boundary remains
in the earlier receipt; the fixture now requests the canonical URL initially.
No validator condition is relaxed and no old failure is overwritten.

Executed preparation proof:

- Normal fresh `npm ci` succeeds; package and lockfile remain unchanged.
- Scoped Prettier and ESLint succeed. The eight existing inventory/navigation
  Node tests pass, retaining HTTP failure, wrong-origin and non-H2 negatives.
- The normal `npm run build` succeeds, including built artifact, bundle and
  publication controls. The Worker digest is
  `021810ca8445aeff204238d0ef41301302b42a05f2a0cc2003eb0f64ec7a839f`;
  the client manifest digest is
  `baad656675a48ef8dc1245d5a5b77ab3becb2dd7708cc305ddee85af7afbfc75`
  with 2,523 client files. This is a fresh artifact, not an identical-client claim.
- The actual existing `prepareLighthouseSurfaces` executes once against a fresh
  port-zero SDK gate using exact main fixture bytes. Verified Owner session is
  200; its canonical pathname/default-query flags are false. The intended
  prepared-path assertion fails, terminal 1. No browser runs in this proof.
- After exact candidate restoration, the same actual preparation in another
  fresh process/gate passes, terminal 0. Canonical pathname/default query,
  unchanged route, verified Owner role and matching session identity all pass.
  Each gate closes without error and removes its own storage. All captured
  build (11), stock (4) and corrected (4) process identities/groups are gone.

The stock fixture digest is
`8120f09e904d8258b7a40113e3733f4401bf330edcce4ff4196645533528d0ea`;
the restored candidate digest is
`f2ab71b1422ce3f129953fe46dc3ab7cf1b30b6f59933989353ab283e6d178e2`.
Private primitive receipts retain the failed negative and positive outcomes;
raw tokens, cookies, page data, LHR and traces are not persisted.

## Actual canonical Admin integration

The original normal desktop `scripts/lighthouse.mjs` subsequently executes all
five traces on this exact fixture source with its original throttling, content,
strict navigation and performance gates. Both the CLI and its bounded output
proof return 0. Each trace passes the unchanged validator requiring a successful
Document whose URL exactly matches the final displayed URL, and only H2 for
completed same-origin requests. This corrects the observed canonical fixture
boundary rather than relaxing validation.

Scores are 100/100/100; median FCP is 401.3155 ms, LCP 524.8692 ms,
CLS 0.002041949624959869 and TBT 0. Every trace has finite positive FCP/LCP,
the existing default trace attribution and twenty bounded generated coordinates.
Output consists only of `admin-users.json` and `summary.md`; recursive privacy
checks reject raw LHR/trace/report/URL/stack fields. No HTML is persisted.

All 24 captured process identities and their group are gone. The recorded SDK
gate directory is absent, owned gate/profile/TLS parents contain no directories,
and port 5273 is free. Individual profile identities were not captured, so no
historical profile census is claimed. Fixture bytes remain exactly
`f2ab71b1422ce3f129953fe46dc3ab7cf1b30b6f59933989353ab283e6d178e2`.

Next: carry this exact code and current receipt into the final combined
video/layout/capacity correction, whose complete quality/SAST and publication
are separate pending gates. No duplicate standalone pipeline or unchanged audit
retry is run. The full UI/release matrix and M19 remain open.
