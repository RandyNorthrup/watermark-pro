# M19 UI Organization — 2026-09-13

## Current Integration State

The final image action is **Save Image**, with its existing output controls.
All 128 distinct device cases have passing evidence across the original run and
targeted closures; this is not one uninterrupted matrix. The final Android
Recent Work case passed after the sample/photo race correction. Native preview
checks (18), queue/hooks (7), worker-terminal checks (7), and image action/catalog
checks (65) passed. See [case closure](ui-e2e-2026-09-13.md).

Final source verification passed all 2,781 unit/browser tests and 63 real Worker
tests. Coverage is 92.49% statements, 85.30% branches, 92.31% functions and 93.39%
lines, above the unchanged floors. Bootstrap (30), gate transport (13), tooling
(36), publication (19), and asset suites (5 and 19) also passed. The build passed
all 42 artifact checks and bundle limits; SAST passed 509 rules over 2,109 files
with zero findings. Logs are `temp/ui-release-tests.log`,
`temp/ui-release-build.log` and `temp/ui-release-sast.log`.

The quality stages were completed across the canonical invocation and its
continued command chain. The first publication snapshot correctly stopped when
the index changed; the stable source scan and all subsequent stages then passed.
This is not reported as one exit-zero `npm run quality` invocation.

The opt-in tour passed desktop Chrome, Android Chrome and iPhone WebKit, including
native Android swipe. Updated product captures show Save Image. Four refreshed
light/dark desktop/phone layout and composited-contrast states passed with zero
axe violations and zero horizontal overflow.

The broader screenshot audit remains incomplete: the phone profile completed,
while desktop and tablet attempts failed. A desktop diagnostic reproduced static
502s and an unanswered module request; short secret-free SDK/HTTP load probes did
not reproduce them. Raw capture attempts were archived and independently hashed
under ignored `temp/archived-ui-audits/` (705 files). They are retained evidence,
not a complete current screenshot certification.

The shared cloud redirect failure is fixed and has 43 passing focused tests.
Live provider workflows require the corrected deployment and remain explicitly
open until observed. The historical constituent checkpoints below keep their
original scope; current integration results above supersede their pending-case
wording without changing original failed runs into successful commands.

## Earlier Constituent Checkpoint

This receipt covers the UI-01 through UI-07 amendment in `PLAN.md`. It records
constituent verification available before the final release. It does **not**
claim one successful `npm run quality` invocation, a completed 128-case E2E run,
or deployment of this revision. Final E2E, native tour swipe, release build,
publication and hosted results must be reconciled before closing the amendment.

## Requirement Map

| ID    | Implemented Source                                                                                                                                                                                                  | Current Evidence And Boundary                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 | `components/editor/mark-overlay.tsx`, `engine/text-layout.ts`, `shared/watermark.ts`                                                                                                                                | Selection decoration has a 6 CSS-pixel gap outside measured ink/stroke; it does not change placement or export dimensions. Existing half-circle values remain unchanged; the curve range now reaches ±2 for a complete circle. The 67 focused tests and intended-red controls below passed.                                                                                                                                                         |
| UI-02 | `components/editor/editor.tsx`, `components/editor/media-tools.tsx`, `components/documents/documents-tool.tsx`, `components/video/video-tool.tsx`                                                                   | Export Image sits beside New and opens existing export controls. Export PDF/Export Video retain their download actions. The six Image tabs are Presets, Watermark, Saved / Adjust, Resize, Crop. Updated editor/document/video unit journeys passed; final four-device E2E is still running.                                                                                                                                                        |
| UI-03 | `components/app-shell.tsx`, `components/editor/preset-panel.tsx`, `components/presets/preset-templates.tsx`, `routes/app/library/index.tsx`, `components/gallery/manage-links-dialog.tsx`, `routes/app/gallery.tsx` | Included Presets and user-created Saved watermarks have separate panels. Navigation is Images, Documents, Videos, Bulk, Saved Watermarks, Watermarked Images. Standalone Shares was removed; public share routes remain, with management/revocation in the image collection. Unit checks cover order, modal copy/revoke/status, viewer exclusion, and saved content. Final browser sharing/private-account journeys remain open.                    |
| UI-04 | `components/offline-panel.tsx`, `components/designer/watermark-designer.tsx`, `components/designer/text-symbol-bar.tsx`, `components/gallery/share-dialog.tsx`, `components/editor/canvas-view-controls.tsx`        | Symbol/detail actions are attached to the textbox; its accessible hint is only “Up to 120 characters.” Sync status remains one visible line with full readiness information in its title. Link actions and the compact zoom/grid group are centered. All four measured theme/device states passed attached-toolbar, sync-line, centering, axe and reflow checks.                                                                                    |
| UI-05 | `components/app-shell.tsx`, `components/landing-page.tsx`, `components/editor/editor.tsx`, `components/editor/media-tools.tsx`, `routes/app/account.tsx`                                                            | Headers use normal document flow, canvas/tools have independent heights, and asset-license access lives in Account Settings. The four-state fixture proved the app header moves with document scroll and shorter tools do not resize the settled canvas. Account unit checks passed. Landing's removed sticky classes are included in the pending final release build; the app-header measurements are not a separate landing-header browser proof. |
| UI-06 | `components/guidance/first-use-guidance.tsx`, `components/guidance/product-tour.ts`, `components/guidance/guidance-queue.ts`, `components/guidance/guidance-card.tsx`, `routes/app/account.tsx`                     | Guidance requires opt-in, navigates real tool pages, supports exit and explicit replay, and preserves account/workspace isolation. The 34 tour/account unit checks include three replay-delivery races. Native final tour verification remains pending after the inner scroll region's `touch-pan-y` correction. Do not substitute the unit result for touch-device proof.                                                                          |
| UI-07 | `styles/app.css`, `components/ui/switch.tsx`, shared controls; `scripts/fixtures/capture-ui-layout.mjs`                                                                                                             | All four representative rendered states passed composited text/control contrast, a known-bad contrast negative control, zero axe violations and zero horizontal overflow. This is measured evidence for the sampled controls, not whole-app WCAG certification. Scope and measured minima are below.                                                                                                                                                |

Paths beginning with `components`, `engine`, `routes` or `styles` are beneath
`src/client`; `shared` is beneath `src`. Existing routes and storage/API identities
remain compatible except for the deliberately removed standalone Shares page.

## Geometry And UI Tests

- `temp/canvas-gap-curve-unit.log`: **34 passed**; includes fixed screen-space gap
  at 35%, 100% and 200% display scale, unchanged mark coordinates, bounded handles,
  keyboard/pointer/pinch behavior, and full-circle schema limits.
- `temp/canvas-gap-curve-browser.log`: **33 passed** using native canvas pixels;
  includes all shape strokes, transformed text containment, closed-ring glyph
  non-overlap and multiline separation. A deliberately superimposed glyph layout
  fails the independent raster-overlap control.
- `temp/canvas-gap-curve-red-unit.log` and
  `temp/canvas-gap-curve-red-browser.log`: removing the gap and restoring the old
  half-circle ceiling produced **two unit and two browser failures**. Exact
  source bytes were restored before the passing runs above.
- `temp/ui-reorganization-unit.log`: 189 passed and six stale-copy assertions
  failed. Corrected assertions in the three affected files passed all 61 cases
  in `temp/ui-reorganization-unit-rerun.log`. Together these cover the 195-case
  focused UI batch; they are not a single 195-case green invocation.

## Rendered Layout And Contrast

Authoritative local report: `temp/ui-layout-qa/report.json`; successful command
log: `temp/ui-corrected-layout-loaded.log`. Screenshots stay in the ignored
`temp/ui-layout-qa` directory rather than adding diagnostic images to the public
repository. Desktop Chromium and Pixel 7 Chromium each passed in light and dark
modes, with zero page errors, axe violations or horizontal overflow.

| Measurement                                  | Desktop, Both Themes | Phone, Both Themes |
| -------------------------------------------- | -------------------- | ------------------ |
| Header follows actual document scroll        | 146 px               | 180 px             |
| Canvas height before/after shorter tools     | 1008 / 1008 px       | 779.5 / 779.5 px   |
| Tools height before/after Resize tab         | 925 / 478 px         | 631.25 / 478 px    |
| Zoom/grid width and horizontal center offset | 768 px / 0 px        | 354 px / 0 px      |
| Attached text toolbar; one-line sync status  | Passed               | Passed             |

The fixture now waits for the real preview before measuring container heights.
Its earlier height discrepancy compared an unsettled image with a settled image;
it did not establish a product-height defect. Adjacent-background sampling was
also corrected before the successful contrast report. These were fixture
corrections, not relaxed contrast thresholds or product geometry changes.

The method uses the WCAG relative-luminance formula, computed foreground colors
and PNG samples of the actual composited background after temporarily hiding
text paint without changing layout. Opaque required edges are compared with
adjacent rendered backgrounds; switch knob/track samples come from interior
pixels. It does not use antialiased text-edge pixels as foreground colors.

- Lowest sampled ordinary-text ratio: **5.22:1**, above the **4.5:1** minimum.
- Lowest sampled required control-edge ratio: **4.11:1**, above **3:1**.
- Both switch states passed knob/track and required-edge checks in both themes;
  the lowest sampled knob/track ratio was **5.48:1**.
- The old white-on-pale-pink gradient measured approximately **2.40–2.42:1** and
  was correctly rejected. Exact original styles were restored; the restored
  primary button passed again before the axe capture.

These samples cover the primary Export button, secondary New button, selected
Watermark tab, unselected Saved tab, helper text, textbox border and both switch
states. They do not certify every page/state, every focus treatment, forced-color
mode, disabled controls, group-opacity text, or user artwork. See WCAG's
[Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Aggregate Gate Checkpoints

`temp/ui-pass-quality-certified.log` reached **2,754 passing tests and one failing
asynchronous Bulk assertion**. The assertion read the video-download row before
that independent result was available. The correction awaits the actual result;
`temp/ui-final-bulk-async.log` then passed all **20 Bulk tests**. That closure is
constituent evidence, not an exit-zero result for the earlier quality command.

Coverage recorded by that broad run remained above the unchanged floors:
statements **92.47%**, branches **85.30%**, functions **92.27%**, lines **93.36%**.
Later corrections require their own final-source reconciliation; these percentages
are the recorded checkpoint rather than a claim of fresh coverage after every edit.

- `temp/ui-correction-tour-tests.log`: **34 tour/account tests passed**, including
  pending replay before lazy mount, changed-account generation, and changed
  workspace delivery. The targeted replay drill is retained separately in
  `temp/tour-replay-race-tests.log`.
- `temp/ui-final-workers.log`: **61 workerd tests passed** across 16 files.
- `temp/ui-correction-build.log`: **42 built-artifact checks passed**, all bundle
  budgets passed, and the built publication scan passed. The initial app shell
  was 138.0 kB gzip against its unchanged 140.0 kB budget.
- `temp/ui-pass-security-final.log`: **509 SAST rules, 2,105 scanned targets,
  zero findings**. The scan covered Git-tracked files; 13 files larger than 1 MB
  were excluded by the scanner, with approximately 99.9% of analyzed lines parsed.
  This checkpoint does not replace artifact/publication scanning or claim that
  later unstaged changes were included automatically.

## Open Release Closure

- `temp/ui-final-e2e.log`: the **128-case, four-device run is in progress** at this
  receipt's checkpoint. Individual completed cases are not full-matrix proof.
- Final native tour traversal, swipe, exit and replay must be rerun against the
  artifact containing the inner `touch-pan-y` correction.
- Updated landing screenshots, the final release artifact/publication checks,
  commit/push, deployment and hosted checks require the release coordinator's
  final receipt. No new deployment is asserted here.
- Existing live Google Drive/Dropbox/OneDrive authorization, read/write/native
  sharing and refresh verification remain separate unfinished provider gates.
  Landing copy labels cloud storage as preview and retains provider scope,
  reauthorization and Microsoft work/school administrator-approval limitations.
- Owner-deferred Lighthouse/performance work remains open. Successful bundle
  budgets and representative contrast checks do not close that performance gate
  or establish whole-app accessibility certification.
