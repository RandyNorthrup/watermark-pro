# Lumafoil competitive and product readiness review

Vendor review: 2026-09-08 (America/Los_Angeles). Local source claims reconciled
2026-09-10 (UTC); this update did not repeat vendor research. This replaces the
earlier comparison, whose blanket parity and market-leadership conclusions were
unsupported.

## Scope and evidence

The launch is **invite-only**, per the owner's clarification on 2026-09-08. Public
registration and a public guest editor are not launch requirements. The production
address is **lumafoil.com**, with no redirects from other purchased or old domains.
The rose accent remains `#C86B82`; the owner rejected the first editorial landing
pass as generic. The approved replacement shows concrete features and authentic app views; app glass styling and refreshed captures are being verified.

The vendor review used pages, manuals, App Store descriptions and live Chrome
inspection of Watermark.ws and Watermarkly on the vendor-review date. The local
capability inventory below is checked against the current source/tests. Vendor
claims are attributed claims, not independent performance or
security certification. No competitor infrastructure was scanned, no paid feature
was purchased, and no private photos or accounts were used in competitor tools.
Native competitor apps and their paid exports were not exercised.

Status vocabulary: **Verified** means the stated behavior has direct evidence at
the named level; **Partial** means implemented with a material limit; **Missing**
means the current code does not implement it; **Untested** means evidence is
insufficient. Source presence alone does not mean production verified.

## Corrections to the previous report

- Watermark.ws was missing from the principal comparison despite being a close
  browser competitor. It has photo, video, and document workflows. Its homepage
  and live editor were inspected on this review date. [Website](https://watermark.ws/)
- The assertion that competitors cannot read invisible marks was false.
  iWatermark documents a StegoMark viewer and another read-back path in its
  information window. [Vendor manual](https://plumamazing.com/iwatermark-pro-manual-page/)
- The assertion that competitors do not offer photo adjustments was false.
  Watermark.ws documents crop, resize, rotation, effects, and individual changes
  inside batches. [Editing features](https://watermark.ws/features/photo-editing)
- Claims that no competitor has URL imports, folder automation, sharing, role
  controls, or similar combinations were not supported by an exhaustive search.
  They are withdrawn. A feature not found in marketing copy is **unknown**, not
  proven absent.
- A client-side LSB payload and reader are not equivalent to robust provenance,
  cryptographic authorship, or a mark that survives social-media transformations.
  Lumafoil's own `engine/invisible.ts` documents loss under JPEG recompression.
- The old report confused upload formats with editor input. The current editor
  and bulk chooser accept JPEG, PNG, WebP, AVIF, and GIF. Decoding depends on the
  browser; animated-GIF preservation is not implemented. The gallery stores
  JPEG/PNG/WebP outputs. HEIC, camera RAW, and TIFF need separate support.
- Historical milestone checkmarks did not prove readiness: the 2026-09-08
  takeover CI snapshot failed 34 browser tests. That review found exposed session fields in shell
  persistence, missing durable sync, dependency advisories, and incomplete gates.
  See [readiness evidence](verification/m19/readiness.md).

## Competitor feature evidence

| Product              | Relevant evidence and strengths                                                                                                                                                      | How it changes Lumafoil's bar                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watermark.ws         | Browser editor, sample JPG/MP4/PDF entry, text/logo/signature tools, templates, batch editing; its file-support page lists HEIC, RAW, PSD and animated GIF support.                  | Show the real editing workflow. State actual format limits. Do not count a single-frame GIF import as animation support. [Formats](https://watermark.ws/features/file-support)                                                                                               |
| Watermarkly          | Browser processing, reusable templates, per-image adjustments, large font selection, logo cleanup. Its homepage starts the editor without an account; this was observed live.        | Reduce steps after invitation acceptance. Make import, watermark, preview and export obvious. No public guest editor is planned for this invite-only launch. [Product](https://watermarkly.com/)                                                                             |
| Visual Watermark     | Desktop offline workflow, broad font support, batch processing, EXIF/IPTC handling, template sharing/sync, resizing and renaming.                                                    | Offline readiness must cover actual files and presets, not just a cached page. Avoid claims of equivalent color/metadata fidelity without independent output checks. [Product and features](https://www.visualwatermark.com/)                                                |
| iWatermark Pro       | Vendor manual describes multiple mark types, QR, metadata, StegoMark, desktop integrations and rich output controls.                                                                 | Metadata and invisible marks require precise limits. Advanced features must remain discoverable without crowding the first-use screen. [Windows manual](https://plumamazing.com/iwatermark-pro-2-win-manual/)                                                                |
| uMark                | Desktop batch watermarking, text/logo/shape/QR tools, metadata macros, live preview and saved marks. Separate PDF product supports document/page macros and password-protected PDFs. | Measure repetitive jobs and exact output settings. Lumafoil currently rejects encrypted PDFs and lacks page-selection/document macros. [Photo features](https://www.uconomix.com/products/umark/) · [PDF features](https://www.uconomix.com/products/umark-pdf/default.aspx) |
| eZy Watermark Photos | Mobile-first text/logo/signature/QR/date tools, saved templates, crop/resize, tiling and grid snapping. The inspected App Store description states a five-photo batch limit.         | Test touch handling and the photo-library/share-sheet path on real devices; a desktop emulator is insufficient. [App Store](https://apps.apple.com/ie/app/ezy-watermark-photos-lite/id494473910)                                                                             |

The important competitors are not one uniform product: desktop applications can
use system codecs, fonts and folders that browsers cannot; cloud processors
accept different privacy and infrastructure costs. Feature totals obscure those
tradeoffs. No numeric overall winner is assigned without matched tasks and output
quality measurements.

## Live workflow observations

**Watermark.ws:** one Start action reached an anonymous editor. A built-in JPG
sample opened without an account. Entering sample text enabled Apply/Finish.
Text/logo/signature actions, crop/resize/rotate/effects and undo/redo were visibly
available beside the canvas. The landing demonstrates the editor itself. This is
first-use UI evidence, not a completed paid export or security audit.

**Watermarkly:** the primary action opened its embedded editor directly. Select
Files, an initially disabled Next Step, a drop zone and local-processing wording
made the sequence clear. Its landing uses a product demonstration video. Font
counts, cross-device synchronization and paid limits remain vendor claims.

**Lumafoil:** the current source requires a session and workspace before opening
the editor. A first-time user can create, save and use a watermark inside the
editor without first visiting the library. Invitation -> account verification ->
private workspace -> first photo is the implemented flow; creating a
collaboration workspace is a separate explicit choice.
The original onboarding defect has been addressed with separate site admission,
automatic private-workspace provisioning, reusable invitation attribution and
Google/Microsoft account sign-in. Focused real-auth tests pass; the final live
provider and full-device journeys remain open. Public registration stays closed.

## Lumafoil capability audit

These rows distinguish implementation from release certification. The full
current-build browser, security, performance and hosted gates remain open.

| Capability                                    | Status                               | Current evidence and practical limit                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text, logo, symbols, QR, shapes, signatures   | Partial                              | Canonical schemas, designer and rendering pipeline exist; unit/browser tests cover core rendering. Current logo outbox additions still need final integrated verification.                                                                                                                                                            |
| Multiple marks and individual batch overrides | Partial                              | `editor/state.ts`, bulk editor and tests implement up to eight layers. Eight layers is a product limit, not unlimited parity.                                                                                                                                                                                                         |
| Placement, tiling, rotation, auto contrast    | Partial                              | Layout/contrast tests and gestures exist. Smart placement analyzes image composition; it is not semantic subject recognition. Numeric X/Y fields are missing.                                                                                                                                                                         |
| Reusable presets                              | Partial                              | Library, preset-file import/export, server CRUD and in-editor first-mark creation exist. Offline conflict handling has focused regression proof; final device integration remains open. No curated starter gallery.                                                                                                                   |
| Fonts and custom type                         | Focused proof; custom import missing | 551 distinct locally bundled Fontsource families carry local notices; all 551 decoded in a real browser. Weights are not counted as families. Custom-font uploads remain absent.                                                                                                                                                      |
| Photo formats                                 | Partial                              | Editor/bulk advertise JPEG, PNG, WebP, AVIF, GIF; browser decoding is required. Export is JPEG/PNG/WebP. HEIC, RAW, TIFF, PSD and retained GIF animation are missing.                                                                                                                                                                 |
| Photo adjustment and output controls          | Partial                              | Crop, resize, straighten, flips, adjustments, border, quality and output names exist. Need matched actual-file checks for orientation, transparency, dimensions and quality.                                                                                                                                                          |
| Metadata                                      | Partial                              | EXIF read/preserve, GPS removal policy and density handling exist. No complete IPTC editor, no equivalent ICC/color-managed workflow. WebP metadata preservation is explicitly unsupported.                                                                                                                                           |
| Invisible marks                               | Partial                              | PNG LSB payload plus reader and corruption tests. No encryption, signed identity, provenance chain or resilience claim.                                                                                                                                                                                                               |
| Large photo batches                           | Partial; performance unverified      | The product cap is 500 photos per batch. Queue concurrency, pause/cancel/retry and per-file results exist; final throughput, peak memory and long-session behavior at that supported limit remain unverified.                                                                                                                         |
| Video                                         | Partial                              | WebCodecs/mediabunny implementation, codec probing and tests. Limits: 2 GiB, 10 minutes, longest side 3840; output MP4/WebM depends on encoder support. No universal codec promise.                                                                                                                                                   |
| Video audio                                   | Partial                              | Copy compatible audio or transcode when the target encoder exists; otherwise output has no audio track. The UI reports the resulting audio mode before processing. Final audio/video synchronization and device coverage require real-file evidence.                                                                                  |
| PDF                                           | Partial                              | Up to 50 files, 50 MiB/file and 200 pages; raster mark overlays preserve existing document content. Encrypted files are rejected. Page ranges and document/page macros are missing.                                                                                                                                                   |
| Cloud import/export                           | Focused proof; hosted flow open      | Account-scoped Google Drive, Dropbox and OneDrive import/save plus explicit native link creation/revocation are implemented and tested with protocol fixtures. Actual provider consent/read/write/share/revoke on the final origin remains required.                                                                                  |
| Offline/reconnect                             | Focused proof; final matrix open     | Scoped IndexedDB/outbox, idempotent replay, conflicts and binary storage have focused proof. Online startup validates a live bootstrap; transport failure may admit only the prepared account's cached resources. Server denial and account changes invalidate admission. Final device/outage proof remains open.                     |
| Galleries and sharing                         | Partial                              | Tenant-scoped storage, filters, signed links, expiry/revocation and authorization tests exist. Offline saved files work; cross-device deletion/cache coherence needs final verification.                                                                                                                                              |
| Invitation-only access                        | Focused proof; hosted flow open      | Server admission enforces valid invitation evidence and email ownership. Targeted invitations and per-user referral links support private count-only tracking; bans revoke pending admission. Existing accounts retain login and recovery.                                                                                            |
| Roles and administration                      | Focused proof; final matrix open     | One database-anchored site administrator; private personal workspaces; separate explicit collaboration. Positive/negative auth and D1 tests cover role boundaries, quotas, inviter revocation and cross-user IDs. Final hosted checks remain open.                                                                                    |
| Accessibility and mobile UX                   | Untested for final design            | Existing axe suite and responsive shell are useful evidence infrastructure. New design still needs full axe, keyboard, RTL, zoom, touch and actual-phone acceptance.                                                                                                                                                                  |
| Localisation                                  | Partial                              | Twelve catalogues, RTL and locale-aware date/number helpers exist. Several runtime errors and email templates remain English; the final language, long-label and device layout matrix remains open.                                                                                                                                   |
| Account recovery and operational readiness    | Partial                              | Support mailbox inbound/Send As and recipient SPF/DKIM/DMARC passed; local Google/Microsoft signup and returning sign-in passed. Real isolated D1 restore/migration rehearsal covers the empty-media snapshot. Fresh pre-write backup, populated D1/R2 recovery, hosted email/identity and final cutover remain separate obligations. |

Sticker/QR proof is detailed in [creative-library.md](verification/m19/creative-library.md): 400 licensed Fluent designs, independent QR decoding, and required notices retained in image, PDF, video and batch exports. Recent-work privacy and all three views have [focused evidence](verification/m19/recent-work.md); the final four-device outage journey remains open. These are source and focused-test outcomes, not a market-leadership claim.

## Security assessment

Do not infer security superiority from feature counts, a lock icon, or a vendor
privacy policy. Watermarkly describes local file processing and temporary browser
storage for Google access tokens; these are documented design claims.
[Privacy policy](https://watermarkly.com/privacy/). Watermark.ws describes retained
account information and an email-based account deletion request.
[Privacy policy](https://watermark.ws/privacy). Neither page establishes the
results of an independent penetration test.

For Lumafoil, evaluate concrete controls and adversarial cases:

- **Admission:** missing/invalid/expired/revoked/wrong-email/reused invitation
  must not create a user or send verification mail. Existing accounts retain normal login and reset access. UI hiding alone is inadequate.
- **Authorization:** owner/admin/editor/viewer/nonmember/anonymous tests for
  assets, presets, photos, sharing and administrative APIs; cross-tenant IDs fail.
- **Offline privacy:** no session or provider tokens persisted with workspace
  data; account isolation, logout cleanup, revoked membership, browser restart,
  and same-account replay must be verified independently.
- **Uploads and fetches:** MIME sniffing, actual byte caps, untrusted dimensions,
  malformed media, streamed bodies, redirect/SSRF restrictions and quota races.
  Signature sniffing alone does not validate a complete image or its dimensions.
- **Output safety:** verify metadata/GPS policy, header-safe filenames, and no
  silent loss of audio, animation or document content. A visible mark is not an
  ownership certificate or guaranteed removal protection.
- **Operations:** retain strict dependency/security gates; test secure cookies,
  CSP, CSRF, rate limits and redacted logging. Hosted TLS, email, backups and
  restoration need their own evidence. Google and Microsoft identity sign-in now exists. App-native MFA/passkeys remain absent; provider policy and invite-only admission do not establish a universal second-factor requirement.

## Priorities and design direction

1. **Release proof still required:** current full quality/security/browser and
   performance gates for the implemented admission, onboarding and offline
   boundaries; final-origin provider/email workflows and truthful documentation.
2. **Everyday workflow:** make the first invited session open its assigned
   workspace; make import -> mark -> preview -> export obvious. Provide an
   editable starter mark, useful empty states, and keep expert controls secondary.
3. **High-value capability gaps:** HEIC input for phone libraries, exact numeric
   placement, starter presets, custom fonts, better metadata/format disclosure,
   and video/PDF workflow limits. Implement with real fixtures and target-browser
   proof rather than adding unsupported extensions to file pickers.
4. **Broader expansion after the core is certified:** RAW/TIFF/color fidelity,
   animated GIF, advanced PDF workflows and optional stronger authentication.
   These have dependency, licensing, performance and UX consequences; they are
   separate acceptance work, not checkbox claims.

Preserve the owner's approved illustrated landing layout and rose palette.
Use authentic captures of the released build, clear supported-media limits and
invite-only wording. Earlier editorial redesign suggestions do not supersede
that approval. Do not invent customer counts, testimonials, certifications or
comparative superlatives.

External launch checks remain distinct from local source proof: final-origin
Google/Microsoft identity and recovery email; actual Google Drive, Dropbox and
OneDrive consent/read/write/share/revoke; applicable provider production approval;
hostname/TLS/application cutover; and current backup/recovery readiness. The
profile-bound encrypted backup copy is not off-device disaster recovery, and the
empty-media D1 rehearsal does not prove coordinated recovery of saved R2 media.

Acceptance should record successful task completion and output inspection,
not aesthetics alone: invitation to first export, mixed-size photo batch,
offline save/reload/reconnect, conflict recovery, wrong-account rejection,
keyboard-only editing, 200% zoom, narrow phone, Arabic RTL, and clear failures for
unsupported media. Product screenshots and demonstrations must be generated from
the same build being released.
