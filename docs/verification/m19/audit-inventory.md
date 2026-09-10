# M19 page and screenshot inventory reconciliation

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
