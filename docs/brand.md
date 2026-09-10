# Lumafoil brand guide

Version 2, 2026-09-08. Product name: **Lumafoil**. Website:
**https://lumafoil.com**. Launch access is by invitation. Do not use the retired
Watermark Pro name in new product or provider-facing content.

## Identity

The mark is the compact, rounded line symbol approved by the owner from the
landing page. Its canonical 24-unit path is `M7 5v14h11M12 5h6M12 10h4`, with
rounded 2.4-unit strokes inside the rose tile. The heavier replacement LF mark
was rejected on 2026-09-08. Keep the same geometry in the site, PWA, OAuth
screens and kit. It sits beside a custom-spaced Inter wordmark.
SVG wordmarks contain outlines and do not depend on an installed font.

Canonical assets are in `public/brand/`. `scripts/build-brand.py` builds the SVG
variants from the bundled Inter font; raster variants are derived from those
vectors through `scripts/build-brand-raster.mjs`. `public/favicon.svg` is the
icon used by the BrandMark component. Recapture product screenshots after
changing this asset; an older preview may still contain inline icon geometry.

| Use                       | Asset                                                          |
| ------------------------- | -------------------------------------------------------------- |
| Light page/header         | `logo-dark.svg`                                                |
| Dark page/header          | `logo-light.svg`                                               |
| Text-only identity        | `wordmark-dark.svg`, `wordmark-light.svg`, `wordmark-rose.svg` |
| App icon/avatar           | `mark-rose.svg`, `icon-192.png`, `icon-512.png`                |
| Single-color reproduction | `mark-mono-dark.svg`, `mark-mono-light.svg`                    |
| Google OAuth icon         | `icon-120.png`                                                 |
| Dropbox/provider icons    | `icon-64.png`, `icon-256.png`, `icon-1024.png`                 |

Keep clear space equal to one quarter of the mark's height. Minimum icon size
is 20 CSS pixels; use at least 28 pixels in interactive app chrome. Minimum
horizontal logo width is 128 pixels. Preserve proportions. Do not add gradients,
outlines, unrelated colors, bevels, shadows or effects to the supplied artwork.

## Color and typography

| Token       | Value     | Use                                              |
| ----------- | --------- | ------------------------------------------------ |
| Rose        | `#C86B82` | Brand mark and decorative emphasis               |
| Action rose | `#A94965` | Primary actions with white text; 5.49:1 contrast |
| Ink         | `#292329` | Headings and body copy on light surfaces         |
| Paper       | `#FBF9F7` | Main light background                            |
| White       | `#FFFFFF` | Raised surfaces                                  |
| Muted ink   | `#746973` | Supporting copy on light surfaces                |
| Charcoal    | `#191619` | Main dark background                             |

Rose against white is approximately 3.57:1. Use action rose, not the lighter
brand rose, behind normal-size white text. The complete accessible light/dark
semantic palette remains in `src/client/styles/app.css`; tokens in this kit
identify the brand and do not replace the application contrast checks.

Inter Variable is the UI and brand typeface. Use regular body text, medium or
semibold controls, and semibold headings. Wordmark outlines use weight 650.
Ordinary body text should be at least 14–16 CSS pixels, line height 1.5–1.7.
Avoid oversized italic slogans and decorative font changes in controls. The
watermark font library is a creative tool; it does not change the UI typography.

## Product voice

Lead with the task and describe a real outcome. Say “Watermark photos, videos,
and PDFs,” “Save preset,” or “Saved on this device.” State format and device
limits at the point where they affect a choice. A local save and a confirmed
cloud save must never use interchangeable success messages.

Do not claim perfect protection, unremovable marks, guaranteed ownership,
unlimited formats, market leadership, universal offline operation, or security
certification without matching evidence. Do not invent customer counts,
testimonials, partnerships, or uptime. Invite-only access is a launch policy,
not a paid tier or a scarcity promotion.

## Provider content

**Short description:** Watermark photos, videos, and PDFs with reusable presets.

**Full description:** Lumafoil lets invited users add text, logos, signatures,
and QR codes to their files. Processing runs on the user's device. Optional
features import selected files from cloud storage, export finished files, save
work to their private workspace, and create sharing links for selected files.

**Homepage:** https://lumafoil.com

**Privacy:** https://lumafoil.com/privacy

**Terms:** https://lumafoil.com/terms

**Support mailbox:** support@lumafoil.com. Shared mailbox provisioning and actual
inbound/outbound delivery were verified on 2026-09-08. Public policy URL and
provider submission checks remain part of the domain cutover evidence.

**Source:** https://github.com/RandyNorthrup/watermark-pro — current repository URL;
the footer follows this real URL until a repository rename is actually completed.

## Photography and screenshots

Use authentic screenshots of the released app to demonstrate features. Capture
both light and dark UI through `scripts/fixtures/capture-product.mjs`; that script
uses disposable local users and the actual editor. Recapture after visible UI
changes. Screenshots may show sample work but must not imply a real customer or
endorsement. The coast image is generated sample artwork, documented in
`docs/verification/m19/design.md`.

## Rights and provenance

Inter is bundled under OFL-1.1. Its license accompanies the kit as
`INTER-LICENSE.txt`. Outlined wordmark artwork is produced by using that font;
the font software itself is unmodified. The OFL explicitly permits design and
logo use without imposing the font license on resulting artwork.
[OFL usage guidance](https://openfontlicense.org/ofl-faq/).

No trademark registration or legal clearance is claimed by this kit. The name
was chosen after preliminary exact-name searches and the owner's domain purchase.
Third-party fonts and sticker artwork retain their respective licenses and
notices; their asset audit is separate from ownership of Lumafoil's identity.
