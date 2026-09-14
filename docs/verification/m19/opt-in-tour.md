# Opt-In Product Tour — 2026-09-13

This follow-up replaces the automatic context tips shipped on 2026-09-12. The
first encounter with the new tour offers **Start Tour** and **No Thanks**. No
feature tour, tool selection or route navigation starts without an explicit
choice. The existing account-bound atomic claim endpoint records the stable
`tour` offer before display, so declining, closing, starting or reloading never
reoffers it on another device. Existing accounts receive this one offer too;
legacy topic IDs and their saved claims remain valid and are not reset.

The optional tour has thirteen short stops: Images, watermark creation,
included Presets, workspace Saved designs, crop/adjust/resize, image export,
Documents, Videos, Bulk, Saved Watermarks, Watermarked Images, account/cloud
connections, and workspace access. It navigates the real pages and selects only
allowlisted Image tool tabs/the Image export-panel opener. It does not upload,
save, export, grant access or change user content. Its invitation tells users to
save unfinished work before following a tour that changes pages.

Back, Next, Finish, Exit Tour, Escape and horizontal swipe provide navigation.
Vertical or cancelled gestures do not advance. Only one card is visible; menus,
listboxes and dialogs pause it without advancing or restarting. Account or
workspace changes discard its mounted controller and invalidate pending claims
and navigation results. Exit remains enabled during a pending navigation.

Account Settings contains a discreet **View Product Tour** action that replays
the tour without resetting the saved offer. A collapsed **Licenses And Credits**
section links the canonical font provenance/license inventories, Microsoft
sticker license, Lucide/Feather icon notices and artwork usage/export notices.
All new tour and account-help copy is translated into the twelve supported
languages. The old unused `guidance` translation subtree was removed.

The final built-browser check found a real cold-load replay race: Account
Settings became interactive and emitted its replay event before the lazily
loaded tour controller subscribed. Browser timestamps showed the click at
1,929 ms and subscription at 2,416 ms; the first click was lost and the second
worked. Replay requests now remain in a one-shot, account-generation-fenced
queue until the controller subscribes. Strict Mode cleanup cannot consume a
pending request; an account-generation transition or workspace change invalidates
it. Three focused cases exercise the missing-controller race, the negative
account-generation case and a mismatched workspace. All three focused cases
passed (`temp/tour-replay-race-tests.log`); rebuilt-browser proof remains part of
integration. The existing built invitation was also inspected directly:
its dialog accessible name resolves correctly through `aria-labelledby` to the
visible heading, and the exact-name dialog locator finds one element.

The rebuilt desktop tour subsequently passed every route, replay and exit.
Its Android native-swipe check found a separate touch policy defect: the card's
scrollable text body computed `touch-action: auto`, so Chrome emitted
`pointercancel` after the first horizontal movement. The outer card's `pan-y`
did not constrain the nearer scroll container. Applying `pan-y` to that inner
scroll container in an isolated browser probe produced the complete native
pointer sequence through `pointerup` and advanced to Create A Watermark with
identical touch coordinates. The source now applies the same class there,
preserving vertical scrolling. Evidence: `temp/tour-touch-probe.log`. The native
swipe assertion and its coordinates remain unchanged for the rebuilt check.

Focused verification performed:

- `npx vitest run --project unit-client
src/client/components/guidance/guidance.test.tsx --project unit-worker
src/worker/guidance.test.ts --maxWorkers 2`: 14 passing cases. Includes explicit
  opt-in, a persisted negative claim, independent account replay, every route,
  safe tool selection, no content writes, modal suppression, swipe rejection,
  late account/workspace results, failed navigation and exit while pending.
- `npx vitest run --project workers src/worker/guidance.workers.test.ts`: one
  passing real-D1 case proving concurrent tour claims, persistence through fresh
  service instances, account separation and deleted-account cascade.
- Scoped ESLint passed without added suppressions. Logs remain in ignored
  `temp/tour-focused-tests.log` and `temp/tour-workerd-tests.log`.

`scripts/fixtures/capture-guidance.mjs` now checks the opt-in offer, permanent
cross-device decline, Account Settings replay, every tour route, repeat/exit,
modal suppression, native Android swipes, independent accounts, landscape bounds
and axe. The corrected built-browser fixture passed on desktop Chrome, Android
Chrome and iPhone WebKit (`temp/ui-cloud-tour-final.log`). Every profile completed
all thirteen routes, opt-in/decline, replay, exit, suppression, cross-device
persistence and account isolation. Native Android swipe passed; desktop and
iPhone runs exercised their supported button/keyboard paths and do not claim a
physical iPhone swipe check. The later Save Image label update changes the image
action and matching tour copy, retaining the same navigation/action wiring.
Full milestone certification and live provider checks remain separate gates.
