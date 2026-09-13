# Release E2E case closure and initial triage

## Current combined result — 2026-09-12

The corrected isolated rerun passed **all 49 collected cases in 11 files** using
two workers, completing in 16.2 minutes. Combined with the initial 88 passes,
and counting nine repeated setup cases once, this closes all **128 distinct
cases** in the four-device matrix. All 37 initial failures and all three cases
not run because of serial fallout now have passing rerun evidence.

| Project        | Initial passes | Rerun passes | Repeated cases | Distinct passing cases |
| -------------- | -------------: | -----------: | -------------: | ---------------------: |
| desktop-chrome |             22 |           13 |              3 |                     32 |
| iphone         |             21 |           12 |              1 |                     32 |
| ipad           |             24 |           10 |              2 |                     32 |
| android        |             21 |           14 |              3 |                     32 |
| Total          |             88 |           49 |              9 |                    128 |

The accounting matches the project, file and full test title rather than source
line numbers, which changed during the corrections. This is **combined case
closure, not a single clean 128-case execution**. The initial 88 passing cases
were not all re-executed against the final build. Original failed logs and traces
remain intact; none of the failures below have been relabeled as initial passes.

Retained console evidence:

- Initial run: `temp/release-e2e.log`, SHA-256
  `c67f2fc209edf778db7eb5c00c6857d0994c49b62af903a509a9c8d0e79d79db`.
- Completed rerun: `temp/release-e2e-rerun.log`, SHA-256
  `d4f3b23ba61fc97d2efb1731612ab6abc7a7815c7899eb296f0cabd0fb5c92e7`.
- Rerun collection: `temp/release-e2e-rerun-collected.log`, SHA-256
  `28943eb75ce65a8453cc7044f883f39f4a2f9962f1bb937e9b9babed3a1ceca3`.

## Initial run and corrections

The initial isolated four-device run finished with 88 passed, 37 failed and
3 tests not run because of an earlier failure in an existing serial Library
suite. All 128 cases were collected. The original evidence remains under
`test-results/release`, with the complete console log in
`temp/release-e2e.log`. This section records that historical failed run; the
completed rebuilt rerun is accounted for above.

| Observed failure                                          | Cases | Affected cases and devices                                                                     | Implemented correction                                                                                                                                                              |
| --------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grid also matched Snap To Grid                            |     4 | Inline canvas, all devices                                                                     | Exact accessible name.                                                                                                                                                              |
| Save also matched Save Location                           |     4 | First-photo Editor, all devices                                                                | Exact Save button within the naming dialog.                                                                                                                                         |
| Preset-name links appeared in both Recents and Library    |     4 | Editor multi-step and filter journeys, desktop and Android                                     | Scope links to the Watermark Library region.                                                                                                                                        |
| Administration table renamed Workspaces                   |     3 | Admin, desktop/iPhone/Android                                                                  | Updated the table name without changing account/audit assertions.                                                                                                                   |
| PNG became the lossless default                           |     4 | Invisible watermark verifier, all devices                                                      | Verify PNG is initially enabled, explicitly select JPEG for the disabled negative, then restore PNG and retain byte/payload checks.                                                 |
| First-use popover intercepted pointer events              |     6 | Library viewer and invited viewer onboarding, desktop/Android; private accounts, desktop/iPad  | Manual signup flows reuse the established returning-user tip setup. Dedicated fresh-user guide tests remain separate.                                                               |
| Cumulative journey timeout                                |     4 | Gallery and QR/sticker Library, iPhone; Library owner, iPad; invited viewer onboarding, iPhone | Individually documented `test.slow()` for completed actions, multiple accessibility scans and subsequent operations. Individual assertion deadlines are unchanged.                  |
| Export preceded current-source readiness                  |     3 | Gallery desktop/Android; Recent Work Android                                                   | Await a decoded current source and its first frame before enabling export; safely share initial sample decoding and retain stale-photo rejection.                                   |
| Global background refetch blocked a shell transition      |     2 | Admin workspace creation and workspace invitation acceptance, iPad                             | Canonical shell reset replaces the global awaited refetch; creation now handles activation/network errors and account changes. Both invitation routes retain their existing guards. |
| Lazy thumbnail below the viewport was not decoded         |     1 | Offline Gallery, iPhone                                                                        | Scroll the selected photo into view before the unchanged decoded-pixel assertion.                                                                                                   |
| Offline reload lacked usable app chunks                   |     1 | Recent Work, iPhone                                                                            | Reuse the exact app-worker and visible static-readiness checks before disconnecting. The rebuilt offline journey passed in the rerun.                                               |
| Link creation preceded the selected photo's server commit |     1 | Public sharing, Android                                                                        | Create Link waits for the selected photos' confirmed synchronization state, rechecks immediately before dispatch and preserves account/workspace boundaries.                        |

The Share failure was a real application race. Its upload started at
02:09:26.609 UTC and took 2,748 ms to return 201. Link creation started at
02:09:28.249 UTC while that upload was still pending and correctly returned
400 with `photoIds: "unknown photos"`. The IDs matched; the server validation
was not relaxed. The new readiness control ignores unrelated pending work and
blocks selected pending, blocked or conflicting photo changes. Lost or delayed
acknowledgements do not count as confirmed storage. Explanations are translated
in all 12 locales.

The three serial fallouts were the iPhone Library owner and viewer journeys,
and the iPad Library viewer journey. All three ran and passed in the corrected
rerun; none is a platform exclusion. No `skip`, `fixme`, forced click, weakened pixel/permission assertion,
or broader locator deadline was added during this triage.

## Completed rerun scope

`temp/release-e2e-rerun-list.txt` contains all original failed cases and the full
Library and Onboarding serial suites on all four devices. Playwright collection
was executed against the list: **49 cases in 11 files**, including all 37
failures, all 3 serial fallouts and their required setup cases. The collection
proof is `temp/release-e2e-rerun-collected.log`.

The release owner replaced the isolated gate with the canonical quality build
and ran:

```powershell
npm run test:e2e -- --config temp/release-e2e-rerun.config.ts --test-list temp/release-e2e-rerun-list.txt
```

The rerun wrote to `test-results/release-rerun`, preserving the original
failures. Runtime readiness proof includes 23 Editor/hook tests, 16 native
renderer tests and 39 workspace-transition/auth tests. Sharing readiness adds
9 browser cases with real IndexedDB and the actual ShareDialog, plus the 7
existing sharing-page tests. Intended-red checks reproduced disabled-guard
failures, then exact source restoration passed the targeted cases again.
The complete canonical quality command and staged-source SAST also passed, as
recorded in [quality verification](quality.md). The separate consolidated
screenshot/axe inventory also closes all 752 required combinations with 800 PNGs;
its run distinctions are retained in [audit verification](audit-inventory.md).
Live provider journeys and hosted migration/deployment verification remain open.
Lighthouse/performance work remains deferred
until after launch under the owner's existing direction. This record does not
claim the pending bundle has shipped.
