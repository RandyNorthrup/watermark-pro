# M19 design direction and verification

Owner decisions, updated 2026-09-12. This is a working design record, not a claim that
the final release has passed every device, accessibility and performance gate.

## Approved direction

- Product **Lumafoil**, canonical site **lumafoil.com**, rose **#C86B82**.
- Replace the rejected generic serif/editorial pitch with concrete product
  explanations and authentic examples. The owner specifically supplied
  [eZy's features page](https://www.ezywatermark.com/features) as the structural
  reference: illustrated sections for individual features, then concise details
  for the remaining tools. Lumafoil uses its own copy, screenshots and artwork.
- The hosted site is invitation-only. Explain near the main call to action that
  the source is free on GitHub for people who want to self-host. Keep a GitHub
  link in the footer. Free source code does not imply free third-party hosting.
- The owner preferred the original rounded landing-page icon to the heavier
  replacement uploaded to OAuth providers. The canonical kit reproduces
  that original 24-unit path and rounded stroke geometry. Google and Microsoft
  icons were replaced with the approved variant. Dropbox's saved branding page
  also shows both approved icon sizes after the owner completed its final selection.
- Use Inter for the site and controls, warm neutral surfaces, and clear type
  hierarchy. Creative fonts belong in watermarks and feature examples.
- Preserve the approved landing layout. The first subtle glass pass was rejected
  on 2026-09-10 because the deployed application still read as flat and its
  controls lacked hierarchy. The replacement follows the owner's supplied
  liquid-glass UI kit visibly: translucent panels, rounded controls, reflections,
  floating chrome and stronger depth, retaining the rose palette. The reference is Margarita's
  MIT-licensed [CSS UI kit](https://codepen.io/Margarita-the-solid/pen/NPRPBjd);
  its required notice is retained in `public/brand/UI-KIT-LICENSE.txt`.
- Standard users open directly in Editor. Preset recents live in Library and
  photo recents live in Gallery, each with thumbnail, list and details views.
  History and the selected view belong to the signed-in account.
- The tools sidebar takes limited inspiration from GrapesJS's visual tool
  palette: compact type icons, visible shape tiles and shared rose controls.
  The owner explicitly retained the current canvas and limited this refinement
  to the tools sidebar; it does not introduce a new editor framework.

## Canonical implementation and assets

The landing markup is shared by the runtime route and build-time static renderer
through `src/client/components/landing-page.tsx`; individual feature sections
live in `landing-features.tsx`. All twelve language catalogues contain the new
feature and self-hosting copy. The feature page describes actual text/logo/
signature marks, batch processing, 551 font families, 400 vector stickers, QR
presets, templates, editing controls, smart placement, video, PDFs, export,
gallery links, offline sync, private workspaces, languages and themes.

`scripts/fixtures/capture-product.mjs` creates disposable local accounts and real
presets, then captures the editor, QR preview and library. Screenshots are real
UI states; recapture after final source changes. It waits for the offline-ready
indicator before capturing editor chrome. Fresh glass captures were generated and
visually inspected on 2026-09-09. They still need the final status-row geometry
and corrected editor privacy sentence before release certification.

The Windows host requests reduced transparency. Its solid fallback was observed
in an unmodified browser context. Marketing captures explicitly emulate
`prefers-reduced-transparency: no-preference` to demonstrate the glass appearance;
separate device audits retain and test reduced transparency. Theme transitions
finish before the screenshots are taken. The final scene uses slow rose/peach
blob motion only when reduced motion is not requested.

`scripts/fixtures/build-product-images.mjs` derives width variants from those
full-size captures. The hero uses one responsive picture with a themed source,
instead of downloading two high-priority full-size screenshots. Native public
controls and the React theme control update its selected source, including when
a manual choice differs from the operating system. Feature images also provide
480/720/960-pixel candidates; capture regenerates these derivatives.

`scripts/fixtures/build-font-example.py` outlines six actual bundled font
families for the typography illustration. `public/product/stickers.svg` composes
twenty licensed Fluent vectors with unique gradient identifiers.
`public/product/*.webp` contains the optimized feature illustrations.

The coastal source is generated example artwork, not customer work or a
testimonial. It was created with the built-in image tool for this project and
optimized into local 480/840/1400-pixel WebP variants. It depicts a Pacific coast,
sea stacks and evening light. Rendering examples use this same project asset.
Product copy makes no ownership, protection or market-leadership guarantees.

## Palette and accessibility

Semantic colors remain in `src/client/styles/app.css`. Rose on white is about
3.57:1; normal white button text uses deeper **#A94965** (about 5.49:1). Form
boundaries use **#9F8C94** (about 3.16:1 on white). Ratios are calculated sRGB
values, not substitutes for rendered axe checks.

Feature rows become one column on phones. Controls retain visible focus states,
translated labels, touch targets, right-to-left layouts and reduced-motion
support. Editor tabs wrap instead of clipping the Watermark label. Local saves,
confirmed server saves and conflict recovery remain visibly distinct.

Glass styling is applied to application chrome and panels, never to exported
photo pixels. Solid surfaces remain available when backdrop filters are absent,
transparency is reduced, or forced colors are enabled. Decorative motion stops
under `prefers-reduced-motion`. Shared buttons transition their shadows only: interpolating
foreground and background colors produced a real transient axe contrast failure
when selecting recent-work views, so those colors now change together.

An actual mobile Lighthouse diagnostic reached 100 performance and 100
accessibility on the responsive landing. The authenticated dashboard failed its
budget; its trace identified late status-panel and recent-history insertion as
layout shifts. The shell now reserves the compact status row while its module
loads, and recent-work loading/empty states share a stable height. Focused tests
pass; fresh measured dashboard results are still required.

## Required final evidence

- Fresh production build and responsive screenshot review of landing/auth/account/
  invitation/dashboard/library/designer/editor/bulk/gallery/sharing/admin/video/PDF.
- English and Arabic; light, dark and manual/system theme changes; desktop,
  tablet and phone widths; no horizontal overflow or inaccessible controls.
- Full Playwright journeys with axe, including saved QR/sticker workflows,
  account isolation and reconnect recovery. Focused creative tests are recorded
  separately in `creative-library.md`.
- Existing M19 Lighthouse and bundle budgets, with real output. No lowered
  thresholds or reclassified large chunks solely to make the gate pass.
- Rebuilt brand-kit archive and social images from final screenshots;
  consistent approved icon on all provider screens.

The stale 2026-09-09 product captures were replaced on 2026-09-10 through the
isolated console-mailbox fixture server. The responsive landing assets now show
the final glass editor, direct canvas handles, QR output and the library's grouped
top-right actions. The broader screenshot audit remains separate from these
marketing captures.
