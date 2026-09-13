# M19 page and screenshot inventory reconciliation

## Final consolidated screenshot evidence — 2026-09-12

All **752 required combinations** are present: the 47 canonical surfaces from
`AUDIT_SURFACES` plus the runner's declared extra states, across four profiles,
English/Arabic and light/dark themes. Completed profiles contain **800 PNGs**,
including additional captured states. Independent file verification found zero
missing combinations, checked PNG headers/dimensions and hashed every file. An
in-memory negative control removed one required key and correctly detected it;
no evidence file was changed for that control.

| Browser/device profile | Required combinations | Actual PNGs | Completed profile source                     |
| ---------------------- | --------------------: | ----------: | -------------------------------------------- |
| Desktop Chromium       |                   188 |         200 | `release-screenshot-audit-account-fixed.log` |
| iPhone 14 / WebKit     |                   188 |         200 | `screenshots-phone-navigation-final.log`     |
| iPad Mini / WebKit     |                   188 |         196 | `screenshots-navigation-settled.log`         |
| Pixel 7 / Chromium     |                   188 |         204 | `screenshots-android-navigation-final.log`   |
| Total                  |                   752 |         800 | Four completed profile invocations           |

This is **consolidated profile coverage, not one clean uninterrupted four-profile
run**. Desktop and tablet completed during parent runs that failed on other
profiles; phone and Android subsequently completed separate invocations with exit
0 and emitted validated inventories. Every retained successful capture passed
image/font readiness, strict page-error, axe and horizontal-overflow checks.
Runtime bytes stayed on the final Account-grid artifact; follow-up changes were
confined to screenshot navigation and diagnostics.

The [compact inventory](screenshot-inventory.json) records every capture's size,
SHA-256 and PNG dimensions, each run's log hash, the canonical requirement sources,
build provenance and archive locations. Phone/Android preference values are copied
only from their actual runner metadata. Desktop/tablet parent runs did not emit
aggregate preference inventories, so no reduced-transparency value is inferred.
These are emulated browser/device profiles, not claims of physical-device testing.

The harness corrections preserve the acceptance checks. A paired WebKit latency
probe showed that navigating while a language PATCH remained pending cancelled
the request; explicit request settlement completed it before navigation. An
intentional unhandled-error negative remained reported. A separate Arabic
navigation probe reproduced the workspace Audit versus site Admin Audit collision;
context-specific navigation then reached the correct admin section. Earlier
failures below remain failures rather than being filtered or relabeled.

All generated terminal raw evidence is now under ignored
`temp/release-screenshot-evidence`, with completed profiles and failed attempts
kept separately. **1,008 files / 1,074,163,437 bytes** were moved only after checking
their absolute source/destination boundaries, then verified by count, size and
SHA-256. The completed 800 PNGs occupy **835,120,301 bytes**; an independent
pre/post-archive comparison also matched every selected capture and emitted
runner inventory. Original logs and older tracked milestone screenshots remain
intact. No generated raw PNG directory remains a publication candidate. Only this
receipt and the compact JSON are included in the repository; the current landing
WebPs remain product assets. The publication byte budget was not increased.

Visual spot checks included phone Account/Documents and the final dark Image
editor, tablet Arabic Designer/Image screens, and Android dark Account. Panels,
controls and images fit their widths without an obvious additional layout fault.
Fixed mobile navigation appearing partway down a full-page PNG reflects its
viewport-fixed capture position. This closes screenshot/axe inventory evidence;
the subsequent [production deployment and hosted checks](deployment-2026-09-12.md)
are recorded separately. Live provider journeys and owner-deferred
Lighthouse/performance remain unverified.

## Historical failed screenshot attempts

The earlier rebuilt four-profile screenshot/axe command **failed**:

```powershell
npm run audit:screenshots -- m19-certified all
```

The release owner ran it against the isolated rebuilt artifact on loopback port
5274 with two profile workflows at a time. Desktop completed **200 captures**.
Phone wrote the English and Arabic light-theme check-email captures, then failed
with `Browser error on screenshot surface private-editor-empty`. The other two
profiles were not started after that batch failed. No complete `inventory.json`
was emitted. Because the profile batch awaited all settled results, the phone
failure was reported after desktop completed; this does not mean the phone was
still progressing during the intervening capture work.

The terminal evidence is `temp/release-screenshot-audit-account-fixed.log`,
SHA-256 `f41848e08babdf13c277bdbc96a5bbb0897ef77120c454a9b9566240dcf85d89`.
Every successfully written capture passed the runner's image/font-readiness,
page-error, axe and horizontal-overflow checks. That partial result does not
certify the absent phone, tablet and Android states or explain the phone's
underlying browser error.

Subsequent isolated attempts also remained incomplete. Phone reached 37 captures
before a `members` surface check reported an `/api/me` access-control fetch error
(`temp/screenshot-phone-diagnostic.log`). The tablet/Android attempt retained nine
tablet captures and 79 Android captures; the reported tablet error occurred at
`share-dialog-created` and identified `/api/auth/get-session` access control
(`temp/screenshot-tablet-android.log`). Neither profile completed that attempt.
Those browser errors remain failed-run evidence. The navigation correction and
successful profile coverage are recorded above; no broad error filter was added.

An earlier attempt failed on Account horizontal overflow. The base grid now
explicitly uses one column, and the fresh iPhone diagnostic has a 390-pixel client
and document width with no overflowing objects. The source rebuild passed all
42 built-artifact checks and bundle budgets, with a separate 509-rule/2,098-target
SAST pass. Those focused/rebuild results do not replace the failed full matrix.
See [quality verification](quality.md) for exact logs and provenance.

Full-resolution audit PNGs are local evidence, not release product assets. The
terminal attempts were archived under ignored `temp/release-screenshot-evidence`
after verifying every resolved source/destination stayed inside its named
workspace directory. All **329 files / 244,501,871 bytes** retained their file
counts, sizes and SHA-256 values after the moves. This includes 327 PNGs and two
diagnostic records. The completed desktop profile is kept separately at
`completed/account-grid/desktop`; failed attempts are under `failed/`. The exact
per-file receipt is `temp/release-screenshot-evidence/archive-receipt.json`.
Original run logs and older tracked milestone images were preserved. Active
retry directories were not moved.

This initial archive was later supplemented by the completed tablet, phone and
Android evidence described above. Archiving a failed attempt did not make that
attempt successful; completed profile coverage was established independently.

## Historical inventory preparation

Updated 2026-09-09. This records verification infrastructure and focused results,
not complete UI or performance certification.

`scripts/lib/audit-surfaces.mjs` supplies stable surface names and all 27 actual
leaf routes to the screenshot and Lighthouse runners. Its route-coverage test
reads the application's route declarations independently: adding or removing a
route without reconciling the audit inventory fails. English and Arabic heading
keys are checked against their catalogues. Dynamic IDs and bearer-token query
strings never become report filenames or summary/log labels.

The expanded states include invitation-required and real invited signup,
check-email, valid and invalid reset forms, a pending collaboration invitation
opened by its matching verified recipient, public sharing, new and saved
designers, and empty/populated Recents with all three saved view preferences.
Lighthouse fixture accounts and content are created through real APIs on the
isolated loopback console-mailbox gate. The normal user and site administrator
are separate accounts. No production account, content or session is used.

Lighthouse validates both transport and rendered content. A 200 response on
the expected route is insufficient: the required heading, seeded content,
form value and selected view must actually appear. A real-browser helper test
proves refusal of wrong-page headings, absent content, hidden controls and the
wrong selected view. Six focused tests, including route inventory,
fixture-origin refusal, mailbox flow selection and duplicate-capture refusal,
passed; strict scoped lint passed.

Catalogue lookup requires own JSON fields and string values. Inherited,
missing, null and numeric fields cannot accidentally satisfy a translated UI
assertion. The subsequent 509-rule SAST run over 1,865 targets passed with zero
findings; the ignored log is `temp/lumafoil-sast-sdk-audit-fixed.log`.

Two disposable failure drills then removed the duplicate-write guard and the
mailbox's requested-flow predicate separately. Each produced its intended
assertion failure, exact restoration passed, and canonical files were unchanged.
The ignored receipt is `temp/lumafoil-audit-red-receipt.json`.

Screenshot names distinguish the new designer, saved designer, applied crop and
applied adjustment states. The capture registry refuses duplicates before
writing an image. This corrects earlier silent overwrites, including repeated
administration/menu captures. The required matrix also includes bilingual
language menus and share dialogs. Every final capture still requires loaded
fonts/images, zero axe violations and no horizontal document overflow.

The complete prepared-page browser proof passed all 33 surfaces against the
current production build on the isolated SDK gate. Real mailbox and API setup
created every dynamic route and its required session cookies. Chromium then
verified the exact headings and required states, verified account/session and
workspace membership for authenticated surfaces, distinguished standard users
from the site administrator, and decoded the actual public-share image. The
pending invitation, valid and invalid reset forms, valid signup, saved designer,
empty Recents and all three populated recent views passed. No unexpected HTTP
response errors or page errors occurred. Browser and fixture API contexts were
closed after verification. The stable-name result is
`temp/lumafoil-audit-fixture-proof/result.json` and its log is
`temp/lumafoil-audit-fixture-proof.log`; bearer paths and cookies are not written
to those reports.

The reset fixture now supplies Origin explicitly for its state-changing request,
because a screenshot browser's `BrowserContext.request` does not inherit the
standalone fixture API context's default header. An actual bare request without
Origin returned 403; the shared helper with the explicit same-origin header
produced a real reset link whose password form rendered successfully. The
helper and fixture modules pass scoped ESLint and formatting checks.

The all-profile screenshot matrix and five-run Lighthouse matrices remain open.
This prepared-state browser proof is not a visual, accessibility or performance
certification. Earlier 17-target Lighthouse results cannot certify this larger
inventory.

The first populated Lighthouse attempt exposed a transport-check defect:
same-origin `blob:` image resources were incorrectly required to negotiate
HTTP/2. The corrected predicate classifies only HTTP(S) requests as network
traffic; existing HTTP/1 and failed-API negatives remain. Visible in-viewport
images must also be complete with nonzero dimensions and decode successfully
when the recorded trace ends. Broken visible images fail, while hidden or
offscreen lazy images are not forced into the measured viewport. Fixture photo
traffic now uses the application's real sample JPEG and a 320-pixel thumbnail.
These corrections passed focused real-browser and protocol checks; updated
five-trace measurements remain required.
