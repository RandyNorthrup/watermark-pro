# Public and authentication audit follow-up — 2026-09-10

These are diagnostic results, not M19 certification. The complete five-trace,
per-page, per-device matrix and current remote checks remain required.

## Public font and authentication startup diagnosis

The isolated built Worker was started successfully with
`node scripts/gate-server.mjs --built`. The canonical Lighthouse runner used
`LIGHTHOUSE_SAMPLE=1`, mobile emulation, and `LIGHTHOUSE_PAGES=home`, followed by
`LIGHTHOUSE_PAGES=privacy,login`. Reports are under
`docs/lighthouse/m19-public-current/mobile-sample/`.

| Surface | Performance | Accessibility | Best practices |      LCP |    CLS |    TBT |
| ------- | ----------: | ------------: | -------------: | -------: | -----: | -----: |
| Home    |         100 |           100 |            100 | 1,239 ms | 0.0003 |   0 ms |
| Privacy |         100 |           100 |            100 | 1,110 ms |      0 |   0 ms |
| Login   |          93 |           100 |            100 | 2,550 ms |      0 | 230 ms |

Login still exceeds the 2,500 ms LCP and 150 ms TBT limits. Its retained report
attributes two long tasks, 122 ms and 208 ms, to the application entry. Shared
startup investigation continues separately; these timings do not establish a
specific source-level cause by themselves.

The larger public-page layout shifts from the Ubuntu CI run did not reproduce
on Windows. A controlled browser diagnostic held the real Inter response until
after the fallback paint, then released it. With local fonts enabled, Chromium
reported Arial and CLS of 0.00029 on home and zero on privacy. Disabling local
font sources selected Segoe UI and raised CLS to 0.00471 and 0.01260 respectively.
This proves fallback-dependent layout behavior, but does not identify Ubuntu's
actual fallback or reproduce its reported shifts. No font, preload, layout, or
budget change was made on that evidence. A retained Linux layout-shift/font
report is still needed.

## Language chooser accessibility

Opening the shared language menu on the real built login page reproduced
`aria-hidden-focus`, `landmark-one-main`, `page-has-heading-one`, and `region`
violations. The modal dropdown hid the page from the accessibility tree while
leaving focusable descendants, and its portal placed the menu outside any
landmark.

The language chooser now uses a nonmodal dropdown and a named region around
its portalled content. The optional landmark is used specifically by the
language chooser; other dropdowns retain their existing behavior. Choosing a
language still uses the existing account and generation boundaries.

Two new component regressions failed on the original implementation. All seven
language-menu tests pass after the change, including keyboard traversal,
Escape restoring trigger focus, an outside control retaining focus after
dismissal, and existing language/account behavior. Focused ESLint, Prettier,
and TypeScript checks passed. The existing protected-page E2E case now also
checks the open menu's complete axe result, visible page heading/main,
horizontal bounds, and Escape behavior across all four existing device
projects; no test case was removed.

Fresh-build browser proof for the menu change, full quality, SAST, and the
complete remote audit matrix are pending at this checkpoint.
