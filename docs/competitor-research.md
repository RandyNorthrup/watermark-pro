# Photo watermarking competitor research

Compiled 2026-09-06 from official sites, app-store listings, vendor help/blog pages and third-party reviews. Every claim carries a source; where only a third-party or vendor-written directory listing supports a number it is marked _(3rd-party)_ or _(vendor listing)_.

**Re-checked 2026-09-08 (M19 competitor re-check).** The six product groups all still exist. Material changes since 2026-09-06 were small: eZy remains at v10.5 (27 Aug 2026, unchanged); Visual Watermark remains at 5.50; Watermarkly and iWatermark are actively maintained with only minor version bumps; uMark now bundles **120+ hand-picked fonts** (v6.3) and QR codes moved into the batch flow (v6.5). The one genuinely new development is a **field of browser-based, local-processing bulk watermark web apps** (ImagiTool, PixelBatch, BulkWatermarker, Watermarquee) — the closest analogs yet to Watermark Pro's positioning; added below as the **WEB** field (products table + §2.7). This revision also adds a **WMP** (Watermark Pro) column to every §1 matrix, filled from what the repository has actually shipped through M18 and the in-progress M19 (per `CHANGELOG.md`/`PLAN.md`), and a new §5 that scores Watermark Pro against the field. Competitor rows are unchanged unless a 2026-09-08 source is cited.

Products covered:

| Key     | Product                                                                                                                                          | Platforms                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **EZY** | eZy Watermark Photos (Lite/free, "Classic"/Pro paid) by Whizpool                                                                                 | iOS/iPadOS, Android, Mac (Apple-silicon iPad build + separate 2019 Mac app), visionOS |
| **WML** | Watermarkly (web app + iOS/Android apps; desktop = Visual Watermark)                                                                             | Web, iOS, Android, Windows, Mac                                                       |
| **VW**  | Visual Watermark 5.50 desktop (same company as Watermarkly)                                                                                      | Windows 7–11, macOS 10.7+                                                             |
| **IWM** | iWatermark+ 7.2.7 (iOS) / iWatermark Pro 2 (Win/Mac) by Plum Amazing                                                                             | iOS, Android, Windows, Mac                                                            |
| **UM**  | uMark 6 by Uconomix                                                                                                                              | Windows, Mac                                                                          |
| **AND** | Android field: Add Watermark (AndroidVilla), Add Watermark on Photos (Simply Entertaining), Watermark: Logo, Text on Photo (AppXStudio/ZipoApps) | Android                                                                               |
| **WEB** | Browser-based bulk field: ImagiTool, PixelBatch, BulkWatermarker, Watermarquee (all client-side, no install) — new as of the 2026-09-08 re-check | Web (any browser)                                                                     |
| **WMP** | **Watermark Pro** (this project) — MIT-licensed web app on Cloudflare Workers; accounts, organizations and roles                                 | Web (any browser); installable PWA                                                    |

Note on scope: "Arqam" is a caller-ID/contact app, not a watermarking app ([apkcombo](https://apkcombo.com/arqam/ma.arqam/)); it was dropped. "Watermark Photo Square" did not resolve to a distinct current listing; the Android column uses the three apps above instead. "eZy Watermark Multi" does not exist as a current listing; Whizpool's line is Photos (Lite/Classic), Videos (Lite/Pro) and the discontinued Mac app.

---

## 1. Feature matrix

Legend: ✓ = present, ✗ = absent / not documented, ◐ = partial or gated. Notes are terse; details and sources are in §2.

### 1.1 Watermark types

| Feature                            | EZY                                  | WML                                        | VW                    | IWM                               | UM                                                | AND                                                            | WMP                                                                                         |
| ---------------------------------- | ------------------------------------ | ------------------------------------------ | --------------------- | --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Text                               | ✓                                    | ✓                                          | ✓                     | ✓                                 | ✓                                                 | ✓                                                              | ✓                                                                                           |
| Image / logo (PNG w/ alpha)        | ✓ (no auto background removal)       | ✓ + built-in monochrome background removal | ✓ (60 built-in logos) | ✓ (5,000+ built-in vector/bitmap) | ✓                                                 | ✓                                                              | ✓ + logo prepare (flat-bg removal, trim margins)                                            |
| Signature (draw with finger)       | ✓ pen thickness, opacity             | ✗                                          | ✗                     | ✓ draw, import or scan            | ✗                                                 | ✓ (AppXStudio, Simply Ent.)                                    | ✓ draw pad (4 pen widths, undo/clear → PNG logo)                                            |
| QR code                            | ✓                                    | ✗                                          | ✗                     | ✓ (URL/email/data)                | ✓ Pro; macros inside QR                           | ✓ (Simply Ent.)                                                | ✓ (up to 512 chars)                                                                         |
| Date / time stamp                  | ✓ "timestamps/date stamps"           | ✗ (only image number + © symbol)           | ✗                     | ✓ via metadata tags in text       | ✓ EXIF capture date, "today" macro, custom format | ✓ (AndroidVilla `%day-dd%` placeholders; AppXStudio timestamp) | ✓ `{date}`/`{time}`/`{taken}` tokens (capture date preferred)                               |
| Location stamp                     | ✗                                    | ✗                                          | ✗                     | ✓ GPS tag in text                 | ◐ (EXIF/IPTC macros; GPS not listed)              | ✗                                                              | ✓ `{location}` GPS token (opt-in)                                                           |
| EXIF/IPTC metadata as visible text | ✗                                    | ✗                                          | ✗                     | ✓ EXIF/IPTC/XMP/GPS tags          | ✓ EXIF + IPTC macros (Pro)                        | ✗                                                              | ◐ EXIF tokens (`{camera}` `{lens}` `{iso}` `{aperture}` `{shutter}` `{focal}`); no IPTC/XMP |
| Emoji / symbols (©, ™, ®)          | ✓ ©/™ symbols, emoji                 | ✓ © symbol                                 | ✓                     | ✓                                 | ✓ special chars                                   | ✓ © quick-insert, emoji via keyboard                           | ✓ glyph groups + 96-emoji picker                                                            |
| Stickers                           | ✓ paid packs ($0.99 each; some free) | ✓ 490+ icons                               | ✗                     | ✓ (vector library)                | ✗                                                 | ✓ (AppXStudio 1,000+; AndroidVilla categories)                 | ◐ 70 lucide icons (monochrome); no decorative sticker packs                                 |
| Shapes (filled/gradient)           | ✗                                    | ✗                                          | ✗                     | ✓ vector, border, lines           | ✓ solid/gradient shapes, border                   | ✗                                                              | ◐ rect/rounded/ellipse/line, solid fill + stroke; no gradient                               |
| Curved / arc text                  | ✗                                    | ✗                                          | ✗                     | ✓ Text Arc, Banner                | ✗                                                 | ✗                                                              | ✓ curve slider (−100%…+100%)                                                                |
| Invisible / steganographic mark    | ✗                                    | ✗                                          | ✗                     | ✓ StegoMark + metadata            | ✓ invisible (Mac 5.5)                             | ✗                                                              | ✓ LSB stego (PNG) **+ a Verify read-back page**                                             |
| Multiple watermarks per image      | ◐ (premium "multiple watermarks")    | ✓ multi-element group                      | ✓ group templates     | ✓ unlimited                       | ◐ Free 2 / Pro unlimited                          | ✓                                                              | ✓ up to 8 layers                                                                            |

### 1.2 Text options

| Feature          | EZY                                               | WML                     | VW                      | IWM                | UM                                  | AND                                                                           | WMP                                                        |
| ---------------- | ------------------------------------------------- | ----------------------- | ----------------------- | ------------------ | ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Font count       | 150+ _(vendor listing)_; "Custom Fonts" IAP $0.99 | 900–1,000               | 926 (edition-dependent) | 292 + system fonts | 120+ built-in (v6.3) + system fonts | AndroidVilla 130 + 20 custom TTF/OTF; AppXStudio 250+; Simply Ent. "hundreds" | ◐ 51 open-licensed families (Fontsource, loaded on demand) |
| Color            | ✓                                                 | ✓ 90 colors + gradients | ✓                       | ✓                  | ✓                                   | ✓                                                                             | ✓ any `#rrggbb`                                            |
| Opacity          | ✓                                                 | ✓                       | ✓ 100 levels            | ✓                  | ✓                                   | ✓ slider                                                                      | ✓                                                          |
| Shadow           | ✓ (Mac + iOS review)                              | ✓ (in 33–36 effects)    | ✓ (66 effects)          | ✓                  | ✓                                   | ✓ AndroidVilla                                                                | ✓ (contrast-aware)                                         |
| Outline / stroke | ✗                                                 | ✓ (effects)             | ✓                       | ✓ "border"         | ✗                                   | ✓ AndroidVilla                                                                | ✓ Outline paint effect                                     |
| Background box   | ✗                                                 | ✓                       | ✓                       | ✓                  | ✗                                   | ✓ AndroidVilla (color, margin, rounded corners)                               | ✓ box behind mark (own opacity)                            |
| Gradient fill    | ✗                                                 | ✓                       | ✓                       | ✗                  | ✓ shapes                            | ✓ AndroidVilla                                                                | ✗                                                          |
| Rotation         | ✓                                                 | ✓ any angle             | ✓                       | ✓                  | ✓                                   | ✓                                                                             | ✓ any angle                                                |
| Letter spacing   | ✗                                                 | ✗                       | ✗                       | ✓                  | ✗                                   | ✗                                                                             | ✓ (−10%…+100%, per grapheme)                               |
| Emboss / engrave | ✗                                                 | ✓ "3D"                  | ✓                       | ✓                  | ✗                                   | ✗                                                                             | ✓ Emboss + Engrave                                         |
| Multi-line       | ✗ (not documented)                                | ✓                       | ✓                       | ✓                  | ✓                                   | ✓                                                                             | ✓ (up to 4 lines)                                          |
| Size             | ✓                                                 | ✓ corner handles        | ✓                       | ✓ slider + numeric | ✓                                   | ✓                                                                             | ✓ handle + keyboard                                        |

### 1.3 Placement

| Feature                                 | EZY                                    | WML                               | VW                 | IWM                       | UM                                        | AND                                      | WMP                                                            |
| --------------------------------------- | -------------------------------------- | --------------------------------- | ------------------ | ------------------------- | ----------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Drag                                    | ✓ finger                               | ✓ mouse/touch                     | ✓                  | ✓                         | ✓                                         | ✓                                        | ✓ mouse/touch                                                  |
| Snap to grid / corners                  | ✓ "Snap to Grid"                       | ✗                                 | ✗                  | ✓ position grid           | ✓ 9 preset positions + padding            | ✓ predefined positions, margins in 0.1 % | ✓ snap to margins/thirds/centre + anchor placement (Alt frees) |
| Numeric coordinates                     | ✗                                      | ✗                                 | ✗                  | ✓                         | ✓ top/left                                | ✓ margin %                               | ◐ custom placement + margin + keyboard nudge; no x/y fields    |
| Tiling / repeat                         | ✓ "Tile watermarks"                    | ✓ None/Straight/Diagonal, spacing | ✓ Tile + Tile Span | ✓ tile photo/video        | ✓ Pro; H/V/both with row/column anchoring | ✓ AndroidVilla, Simply Ent.              | ✓ brick-pattern tiling, spacing                                |
| Auto-scale relative to image size       | ✓ "AI Powered Templates" (v10.5)       | ✓ auto-scale, can disable         | ✓ Auto-Size        | ✓ scale relative to image | ✗ (position + padding only)               | ✗                                        | ✓ scale relative to image                                      |
| Auto-place for mixed portrait/landscape | ✓ (AI templates claim)                 | ✓                                 | ✓                  | ✓                         | ✗                                         | ✗                                        | ✓ smart placement scored per photo                             |
| Per-image override inside a batch       | ◐ (single mode only; batch complaints) | ✓ Preview section                 | ✓ preview dialog   | ✓                         | ✗                                         | ✓ Simply Ent. preview per image          | ✓ "Adjust" opens the full editor on one photo                  |
| Randomised placement (anti-AI-removal)  | ✗                                      | ✗                                 | ✓                  | ✗                         | ✗                                         | ✗                                        | ✓ Random mode (seeded jitter, reproducible)                    |

### 1.4 Batch

| Feature                   | EZY                                                    | WML                                                                       | VW                              | IWM             | UM                            | AND                                     | WMP                                                                                    |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------- | --------------- | ----------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Photos per batch          | **5** on mobile (Batch IAP $3.99); Mac app "unlimited" | Free mobile: 10/batch; web free: 2,000/day _(3rd-party)_; paid: unlimited | Unlimited, "50,000 in parallel" | Unlimited queue | Free 50 / Pro unlimited       | AndroidVilla 20; Simply Ent. "hundreds" | up to 500 per batch (+ folders)                                                        |
| Same watermark to all     | ✓                                                      | ✓                                                                         | ✓                               | ✓               | ✓                             | ✓                                       | ✓ (any ticked presets)                                                                 |
| Per-image adjust in batch | ◐                                                      | ✓                                                                         | ✓                               | ✓               | ✗                             | ✓ Simply Ent.                           | ✓                                                                                      |
| Folder / sub-folder input | Mac app only                                           | ✗ (web) / ✓ desktop                                                       | ✓                               | ✓ folders       | ✓ + preserves sub-folder tree | ✗                                       | ✓ folder add + drag; sub-folder tree kept in the ZIP                                   |
| Folder watch / hot folder | ✗                                                      | ✗                                                                         | ✗                               | ✗               | ✗                             | ✗                                       | ✓ watch-folder (File System Access API, desktop)                                       |
| Pause/cancel + progress   | ✗                                                      | ✗                                                                         | ✗                               | ✗               | ✓ (v6)                        | ✗                                       | ✓ pause/resume, cancel, live progress + throughput                                     |
| Resize on export          | ✓ "adjust image resolution"                            | ✓                                                                         | ✓                               | ✓ 6 options     | ✓ Pro                         | ✓ AndroidVilla                          | ✓ fit long edge 1080/2048/4096                                                         |
| Rename on export          | ✗ (users report unwanted renaming)                     | ✓                                                                         | ✓                               | ✓               | ✓ Pro, numbering              | ✓ AndroidVilla placeholders             | ✓ name pattern (`{name}` `{index}` `{count}` `{date}` `{preset}` `{width}` `{height}`) |
| Parallel / multi-core     | ✗                                                      | desktop only                                                              | ✓                               | ✗               | ✓ (v6 optimisations)          | ✗                                       | ✓ worker pool sized to the machine                                                     |

### 1.5 Editing (non-watermark)

| Feature                                        | EZY                 | WML                                 | VW                   | IWM              | UM  | AND                                                     | WMP                                                          |
| ---------------------------------------------- | ------------------- | ----------------------------------- | -------------------- | ---------------- | --- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Crop                                           | ✓ ratios            | ✓ separate Crop tool                | ✗                    | ◐                | ✗   | ✓ AppXStudio ratios (1:1, 4:3, 16:9, FB cover, YT art…) | ✓ free/original/1:1/4:3/3:2/16:9/4:5/9:16                    |
| Resize                                         | ✓                   | ✓ 7 modes (W/H/%/max/min/file-size) | ✓                    | ✓                | ✓   | ✓                                                       | ✓ proportion lock + fit shortcuts (8192 px cap)              |
| Rotate / straighten                            | ✓ "align the image" | ✗                                   | auto-rotate via EXIF | ✗                | ✗   | ✓ AndroidVilla crop & rotate                            | ✓ quarter turns, flip H/V, straighten slider (auto-crop)     |
| Filters                                        | ✓                   | ✗                                   | ✗                    | ✓ custom filters | ✗   | ✗                                                       | ✓ 8 one-tap filters                                          |
| Brightness / adjustments                       | ✗                   | ✗                                   | ✗                    | ✗                | ✗   | ✗                                                       | ✓ brightness/contrast/saturation/warmth/sepia/vignette       |
| Blur faces/plates, background removal, upscale | ✗                   | ✓ separate tools                    | ✗                    | ✗                | ✗   | ✗                                                       | ✗ (logo bg removal only; no photo bg removal, blur, upscale) |

### 1.6 Output & metadata

| Feature                 | EZY                                                          | WML                                       | VW                                 | IWM                                      | UM                                        | AND                                                       | WMP                                                             |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------- | ---------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| Output formats          | Mobile: not documented; Mac app JPEG/GIF/PNG                 | JPEG/PNG/WebP or keep original            | JPEG/PNG/TIFF/GIF/BMP              | JPG/PNG/TIFF/PSD/BMP/JPEG 2000 (Mac Pro) | BMP/JPG/GIF/PNG/TIFF + PDF (Pro: convert) | AndroidVilla JPEG/PNG/auto                                | JPEG/PNG/WebP (photos); PDF (documents tool); MP4/H.264 (video) |
| Input formats           | camera roll                                                  | JPG/PNG/WebP/HEIC/GIF/BMP/AVIF (resizer)  | JPEG/PNG/TIFF/GIF/BMP              | RAW/DNG/PSD/TIFF/GIF/JPG/PNG             | BMP/JPG/GIF/PNG/TIFF                      | device gallery                                            | ◐ JPEG/PNG/WebP (by signature); no RAW/HEIC/TIFF                |
| JPEG quality control    | ◐ "Maintain Resolution" toggle; "change export file quality" | ✓ compression setting                     | ✓ 100 % without chroma subsampling | ✓                                        | ✓ (Free too)                              | ✓ resolution cap 1024 px free / 30 MP paid (AndroidVilla) | ✓ quality slider                                                |
| EXIF preserve           | ✗ (not documented)                                           | ✓ optional "keep metadata" (mobile v3.9+) | ✓ EXIF + IPTC in JPEG              | ✓ EXIF/IPTC/XMP + colour profiles        | ✓ all / all-but-GPS / none                | ✓ AndroidVilla EXIF + XMP incl. photosphere               | ✓ keep / keep-except-location / strip                           |
| EXIF strip option       | ✗                                                            | ✓                                         | ✗                                  | ✓ (metadata watermark rewrites)          | ✓                                         | ✗                                                         | ✓ strip is the default                                          |
| DPI preservation        | ✗                                                            | ✗                                         | ✗                                  | ✗                                        | ✓ (5.5+)                                  | ✗                                                         | ✓ JPEG JFIF + PNG `pHYs`                                        |
| Originals never altered | ✓                                                            | ✓ copy only                               | ✓                                  | ✓                                        | ✓ separate output folder                  | ✓                                                         | ✓ re-encoded from pixels; source untouched                      |

### 1.7 Templates / presets

| Feature                     | EZY                    | WML                                   | VW                                 | IWM                     | UM                              | AND                                             | WMP                                                   |
| --------------------------- | ---------------------- | ------------------------------------- | ---------------------------------- | ----------------------- | ------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Save watermark preset       | ✓                      | ✓                                     | ✓                                  | ✓ database              | ✓ Pro only; auto-load on launch | ✓ AndroidVilla 20 recent; Simply Ent. templates | ✓ org watermark library                               |
| Cloud sync across devices   | ✓ (v10.5)              | ✓ 20 stored + 10 recent; free 2 yrs   | ✓ (same account)                   | ◐ cloud storage of sets | ✗                               | ✗                                               | ✓ server-side per account/org                         |
| Export/import template file | ✗                      | ✓ download as file, send to colleague | ✓                                  | ✓ import/export library | ✗                               | ✗                                               | ✓ `.wmp.json` bundle (logos embedded, collision-safe) |
| Built-in template gallery   | ✗                      | ✓                                     | ✓ 12 templates, 10 group templates | ✓                       | ✗                               | ✓ Simply Ent. presets                           | ✗ (users build their own)                             |
| "Smart"/adaptive templates  | ✓ AI Powered Templates | ✓ auto-scale                          | ✓ Auto-Size                        | ✓                       | ✗                               | ✗                                               | ✓ smart placement + auto contrast per photo           |

### 1.8 Import sources

| Source                      | EZY                  | WML   | VW    | IWM | UM         | AND            | WMP                                   |
| --------------------------- | -------------------- | ----- | ----- | --- | ---------- | -------------- | ------------------------------------- |
| Camera roll / gallery       | ✓                    | ✓     | files | ✓   | files      | ✓              | ✓ (file picker)                       |
| Camera capture              | ✓                    | ✗     | ✗     | ✓   | ✗          | ✓ (AppXStudio) | ✓ "Take photo" on phones              |
| Google Drive                | ✓                    | ✓     | ✗     | ✓   | ✗          | ✗              | ✓ (Picker, `drive.file`)              |
| Dropbox                     | ✗                    | ✓     | ✗     | ✓   | ✗          | ✗              | ✓ (Chooser)                           |
| iCloud / OneDrive / Box     | ✗                    | ✗     | ✗     | ✓   | ✗          | ✗              | ◐ OneDrive (Graph); no iCloud/Box     |
| Google Photos               | ✗                    | ✓     | ✗     | ✗   | ✗          | ✗              | ✗                                     |
| Facebook / Instagram import | ✓ _(vendor listing)_ | ✗     | ✗     | ✗   | ✗          | ✗              | ✗                                     |
| URL                         | ✗                    | ✗     | ✗     | ✗   | ✗          | ✗              | ✓ (Worker fetch under an SSRF policy) |
| Drag-and-drop               | Mac app              | ✓ web | ✓     | ✗   | ✓ Explorer | n/a            | ✓ editor + bulk (+ folder drop)       |

### 1.9 Export / sharing

| Target                          | EZY                                                         | WML                   | VW  | IWM                                          | UM  | AND                                     | WMP                                                |
| ------------------------------- | ----------------------------------------------------------- | --------------------- | --- | -------------------------------------------- | --- | --------------------------------------- | -------------------------------------------------- |
| Save to album / folder          | ✓                                                           | ✓ download            | ✓   | ✓                                            | ✓   | ✓                                       | ✓ download; save to gallery; folder output (watch) |
| System share sheet              | ✓                                                           | ✓                     | n/a | ✓                                            | n/a | ✓                                       | ✓ Web Share API (files)                            |
| Named socials                   | Instagram, Pinterest, Facebook, Twitter, LinkedIn, WhatsApp | ✗                     | ✗   | Facebook, Flickr, Instagram, Twitter, TikTok | ✗   | Instagram, Facebook, email (AppXStudio) | ✗ (via the OS share sheet)                         |
| Email                           | ✓                                                           | ✗                     | ✗   | ✓                                            | ✗   | ✓                                       | ◐ (via the OS share sheet)                         |
| Cloud export                    | Google Drive                                                | Google Drive, Dropbox | ✗   | iCloud/Dropbox/GDrive/Box/OneDrive           | ✗   | ✗                                       | ✓ Google Drive, Dropbox, OneDrive                  |
| Apple Photos editing extension  | ✗                                                           | ✗                     | ✗   | ✓                                            | ✗   | ✗                                       | ✗                                                  |
| Shortcuts / "Instant Watermark" | ✗                                                           | ✗                     | ✗   | ✓                                            | ✗   | ✗                                       | ◐ PWA file handling + Android Web Share Target     |

### 1.10 Video, collaboration, platform, UX

| Feature                    | EZY                                        | WML                                         | VW                                         | IWM                                        | UM                                    | AND                        | WMP                                                                              |
| -------------------------- | ------------------------------------------ | ------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Video watermarking         | Separate app (eZy Watermark Videos)        | ✓ MKV/MOV/MP4/AVI in-browser                | Separate app (MOV/MP4/AVI/MKV, GPU encode) | ✓ same workflow, mixed photo+video batches | Separate uMark Video Watermarker      | Simply Ent. mentions video | ✓ in-app (WebCodecs; MP4/WebM/MOV in, MP4/H.264 out; same presets)               |
| PDF watermarking           | ✗                                          | ✓                                           | ✓ separate                                 | ✗                                          | ✓ separate uMark PDF; photo→PDF (Pro) | ✗                          | ✓ in-app (every page, up to 50 PDFs, `pdf-lib`)                                  |
| Teams / roles / multi-user | ✗                                          | ◐ template file sharing, 10 devices/licence | ◐ 10 devices                               | ◐ export library for team                  | ◐ Team licence 10 computers           | ✗                          | ✓ orgs + owner/admin/editor/viewer roles, invitations, audit log, platform admin |
| Privacy: local processing  | on-device                                  | in-browser, no upload                       | local                                      | on-device                                  | local                                 | on-device                  | in-browser (watermarking never uploaded)                                         |
| Pinch to scale             | ✓                                          | ✓ mobile                                    | n/a                                        | ✓                                          | n/a                                   | ✓ AppXStudio               | ✓                                                                                |
| Two-finger rotate          | ◐ (users: "hard to control")               | ✗ (slider)                                  | n/a                                        | ✓                                          | n/a                                   | ✓ AppXStudio               | ✓ twist gesture                                                                  |
| Undo                       | ✗ (not documented)                         | ✗                                           | ✗                                          | ✓                                          | ✗                                     | ✗                          | ✓ undo/redo (drag = one step)                                                    |
| Dark mode                  | ✓ (Videos, iOS)                            | ✗                                           | ✗                                          | ✗                                          | ✗                                     | ✗                          | ✓ system/light/dark                                                              |
| Ads in free tier           | ✓ banner + interstitial; Ad-free IAP $0.99 | ✓ ad before save (mobile)                   | trial overlay                              | ✗ (paid app)                               | ✗                                     | ✓                          | ✗ (free, MIT, no ads, self-hostable)                                             |
| Localisation               | 11 languages                               | 17                                          | n/a                                        | 9                                          | 8                                     | n/a                        | 12 (incl. Arabic RTL)                                                            |

### 1.11 Pricing

| Product | Free tier                                                                                                                  | Paid                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EZY** | Free with ads; single image + 5-image batch gated                                                                          | IAPs: Batch Watermarking $3.99, Custom Fonts $0.99, Ad-free $0.99, Premium Monthly $1.99, Premium Yearly $19.99, sticker packs $0.99; "Classic" paid app $5.99 iOS / $4.99 Android with the same IAPs unlocked; old Mac app $6.99 |
| **WML** | Free: "Watermarkly" logo added; mobile 10 img/batch; web 2,000 img/day _(3rd-party)_; ads before save on mobile            | 1-Year $19.95 (non-renewing) or Permanent $39.95; both 10 devices, all web+mobile+desktop tools, 30-day refund. Mobile IAPs: Basic $19.99 / Plus $29.99 / Premium $39.99 / 1-Year $19.99                                          |
| **VW**  | 30-day trial adds "Protected with Visual Watermark"                                                                        | Same $19.95/yr or $39.95 permanent, 10 devices, commercial use. Legacy Basic $19.95 (1 PC, personal) / Plus $29.95 (2 PCs) / Premium $39.95 (10 PCs) still referenced in reviews                                                  |
| **IWM** | Free "Lite" adds extra watermark                                                                                           | iWatermark+ iOS $4.99 one-time, Family Sharing, no ads; Pro 2 desktop sold via store (price not on page)                                                                                                                          |
| **UM**  | Free forever: 50 img/batch, 2 watermarks, 9 positions, no tiling/rename/resize/presets/EXIF wm                             | Professional $29 one-time; Personal 1 PC / Professional 3 / Team 10; 50 % upgrade pricing; 30-day refund                                                                                                                          |
| **AND** | AndroidVilla free: 1024 px cap, IAPs; AppXStudio free w/ ads; Simply Ent. free w/ IAP                                      | not itemised                                                                                                                                                                                                                      |
| **WEB** | Free, no signup (ImagiTool, PixelBatch, BulkWatermarker all free/client-side); Watermarquee free single-image with a stamp | Watermarquee Plus $9.99/mo (batch, brand kit, AI, no stamp); the others have no paid tier documented                                                                                                                              |
| **WMP** | Free and open-source (MIT); no ads, no IAP; account-based, self-hostable on Cloudflare Workers                             | none (the product stays free)                                                                                                                                                                                                     |

---

## 2. Per-product summaries

### 2.1 eZy Watermark Photos (Whizpool) — primary target

**Listings**

- iOS Lite/free: https://apps.apple.com/us/app/ezy-watermark-photos/id494473910 (4.8★, 32K ratings, v10.5 Aug 2026, 288 MB, iOS 15+, iPhone/iPad/Mac M1/Vision)
- iOS Classic/paid $5.99: https://apps.apple.com/us/app/ezy-watermark-photos-classic/id494472589 (4.8★, 5.5K)
- Android Lite: https://play.google.com/store/apps/details?id=com.whizpool.ezywatermarklite (v7.4.1, 500K+ on Aptoide mirror https://watermark-photo-whizpool.en.aptoide.com/app)
- Android Classic $4.99: https://apkpure.com/ezy-watermark-photos-classic/com.whizpool.ezywatermarkpro
- Mac (2019, v1.2, $6.99, macOS 10.11+): https://apps.apple.com/us/app/ezy-watermark-photo/id1407246400?mt=12
- Vendor listing: https://sourceforge.net/software/product/eZy-Watermark/ ; video sibling https://video.ezywatermark.com/ ; agency page https://whizpool.com/ui-ux-design/ezy-watermark-3/
- Walkthroughs: https://www.photoroom.com/blog/watermark-photos-iphone , https://www.iphone-fotograaf.nl/en/how-to-watermark-iphone-photos-app/ , https://www.idownloadblog.com/2022/03/25/how-to-add-watermark-to-image-iphone-ipad/
- Reviews: https://apps.apple.com/us/app/ezy-watermark-photos/id494473910?see-all=reviews&platform=iphone

**Feature facts**

- Watermark types (App Store copy): text, image/logo, digital signature (finger-drawn, adjustable pen thickness), QR code, date/time stamp, copyright/trademark/registered symbols, stickers & emoji (paid packs). No shapes, no arc text, no EXIF-as-text, no location stamp.
- Text: fonts, colour, opacity, rotation, size, position; shadow documented on Mac app and in the iphone-fotograaf walkthrough. Font count "150+" appears only on the vendor-written SourceForge/Slashdot listing. "Custom Fonts" is a $0.99 IAP.
- Placement: drag with finger, pinch to resize, rotate/angle via side controls (reviewers call size/angle "hard to control"), **Snap to Grid** for "pixel-perfect" alignment, **Tile** (repeat pattern across whole image), auto-alignment.
- Batch: **up to five images per batch** on mobile (a $3.99 IAP or Premium); the 2019 Mac app claimed "unlimited". Recent reviews complain batch renames files and scrambles order.
- Templates: save watermark + position as template; v10.5 (Aug 2026) added **"AI Powered Templates"** (auto-adjust watermark across differently sized photos) and **cloud-synced templates** across devices.
- Editing: preview, crop, resize/aspect ratio, "align" (rotate), filters; "adjust image resolution" and a "Maintain Resolution" toggle (developer reply, 2019) — free tier historically capped dimensions.
- Import: camera roll/library, camera capture; Google Drive and Facebook/Instagram import are on the vendor listing and the Photoroom walkthrough (single-image mode).
- Export: save to gallery; share to Instagram, Pinterest, Facebook, Twitter, LinkedIn, WhatsApp, email, Google Drive.
- Output formats/EXIF: not documented for mobile (Mac app: JPEG/GIF/PNG). Videos sibling claims EXIF retained.
- Video: separate app (eZy Watermark Videos, 150+ fonts, batch "unlimited", crop/rotate/B&W filter, Google Drive/FB/IG import).
- Collaboration: none beyond cloud template sync on one account.
- Monetisation: ads (users report banner covering "Done"); IAPs listed in §1.11.
- Localisation: 11 languages.

### 2.2 Watermarkly (web + mobile)

- Home/features: https://watermarkly.com/ ; pricing: https://watermarkly.com/pricing/ ; video: https://watermarkly.com/video-watermark/ ; resizer (formats, 10/day free limit): https://watermarkly.com/photo-resizer/
- iOS app: https://apps.apple.com/us/app/watermarkly-watermark-maker/id1507414497 (4.8★ 1.2K, v3.22, iOS 16+, developer Julia Nikitina); Android: https://play.google.com/store/apps/details?id=com.visualwatermark.watermarkly
- Template sync post (search snippet; page now 410): https://watermarkly.com/blog/template-sync/ ; third-party summary https://aiforeasylife.com/tool/watermarkly-ai/
- Types: text (900–1,000 fonts, 90 colours/gradients, 33–36 effects incl. 3D/drop shadow), logo upload with monochrome background removal, 490+ icons / 60 logos, multi-element groups. Adds © symbol and auto image number to text. No QR, no date/EXIF stamp, no signature.
- Placement: drag, corner-dot resize, any-angle rotation, opacity; tile None/Straight/Diagonal with spacing; auto-scale + auto-position by image size/orientation (can disable); per-image manual override in Preview.
- Batch: unlimited on paid; free mobile 10/batch (users complain), free web adds a "Protected with Watermarkly" logo; "2,000 images/day" and "100 MB/image" are third-party numbers.
- Output: keep original or JPEG/PNG/WebP, compression quality, resize (7 modes), rename, optional metadata preservation (mobile v3.9+). In-browser processing; photos never uploaded.
- Templates: synced across devices, 20 stored + 10 recent; download template as a file to send to a colleague (closest thing to "team" sharing).
- Import: device, Google Drive, Google Photos, Dropbox, drag-drop. Export: download, Google Drive, Dropbox.
- Video (MKV/MOV/MP4/AVI) and PDF supported in the same web app.
- Pricing: $19.95/yr non-renewing or $39.95 permanent, 10 devices, covers web+mobile+desktop (Visual Watermark) and all side tools (resize, crop, blur, compress, background removal).

### 2.3 Visual Watermark (desktop; same company as Watermarkly)

- Home: https://www.visualwatermark.com/ ; buy: https://www.visualwatermark.com/buy/ ; download (v5.50): https://www.visualwatermark.com/download/ ; fonts/logos: https://www.visualwatermark.com/support/all-built-in-logos-and-fonts/ ; video app: https://www.visualwatermark.com/video-watermark/ ; review: https://www.techulator.com/resources/15945-Visual-Watermark-Software-Review.aspx
- Types: text (926 fonts, 66 effects, 100 transparency levels, shadow/background), logo (60 built-in), group templates (10). No QR/EXIF/signature.
- Placement: drag, rotation, Tile with Tile Span, Auto-Size for mixed batches, per-image preview override, randomised watermark placement to resist AI removal.
- Batch: unlimited, multi-core parallel, "50,000 files"; resize/rename on export.
- Output: JPEG/PNG/TIFF/GIF/BMP; JPEG 100 % without chroma sub-sampling; preserves EXIF+IPTC in JPEG; auto-rotate by orientation tag; embeds copyright metadata.
- Pricing now mirrors Watermarkly ($19.95/yr, $39.95 permanent, 10 devices, commercial use). Older Basic/Plus/Premium one-time tiers (1/2/10 computers, font restrictions on Basic) still appear in reviews. 30-day trial adds "Protected with Visual Watermark".

### 2.4 iWatermark+ (iOS) / iWatermark Pro 2 (Win/Mac) — Plum Amazing

- iOS page: https://plumamazing.com/iwatermark-plus-ios ; App Store: https://apps.apple.com/us/app/iwatermark-logo-photo-video/id931231254 (4.6★ 1.8K, $4.99, v7.2.7, iOS 16.1+, no data collection); v7.0 press release: https://www.issuewire.com/new-iwatermark-version-70-with-instant-watermark-lines-watermark-to-protect-photos-1746278197266011 ; Mac Pro: https://plumamazing.com/iwatermark-pro ; Windows Pro 2 (v4.0.35, Jan 2026): https://plumamazing.com/iwatermark-pro-2-windows ; walkthrough: https://boomertechtalk.com/how-and-why-to-use-iwatermark-for-your-photos-and-art/
- 13–15 watermark types: Text, Text Arc, Banner (desktop), Bitmap/logo, Vector, Signature (draw/import/scan), Border, Lines (stock-agency style), QR, Metadata (invisible EXIF/IPTC/XMP), StegoMark (steganographic), Resize, Custom Filter, Export options.
- Text: 292 fonts + system fonts, colour, opacity, shadow, border/outline, background, emboss/engrave, letter spacing, angle, scale relative to image, metadata tags (GPS/EXIF/XMP/numbering/date-time) inside text.
- Placement: drag, pinch, two-finger rotate, live preview, tiling, multiple simultaneous watermarks via checkmarks in a drawer, undo.
- Batch: unlimited queue, mixed photos+videos, same location auto-applied. Desktop: folders, thumbnails, rename, 6 resize options, input filters by size/format, RAW/DNG/PSD input, JPG/PNG/TIFF/PSD/BMP/JPEG2000 output, EXIF/IPTC/colour-profile preservation.
- Templates: database of watermarks, clone, import/export library for backup/team, cloud storage. 5,000+ built-in vector/bitmap graphics.
- Import/export: camera roll, camera, iCloud/Dropbox/Google Drive/Box/OneDrive; share to Facebook/Flickr/Instagram/Twitter/TikTok; **Apple Photos editing extension**; **"Instant Watermark"** via home-screen quick action ("Watermark & Instagram", "Watermark & Save").
- Video: yes, in the same app. Pricing: $4.99 one-time, Family Sharing, no ads; free Lite adds an extra watermark. Note: vendor page says the Mac Pro developer died; a new version was promised.

### 2.5 uMark (Uconomix)

- Product: https://www.uconomix.com/products/umark/ ; comparison: https://www.uconomix.com/Products/uMark/Comparison.aspx ; FAQ: https://www.uconomix.com/Products/uMark/FAQ.aspx ; 5.5 features: https://www.uconomix.com/Products/uMark/Blog/umark-5-5-win ; 6.0: https://www.uconomix.com/Products/uMark/Blog/umark-6-launched ; capture-date: https://www.uconomix.com/products/umark/blog/photo-capture-date-watermark ; convert/rename/resize: https://www.uconomix.com/products/umark/blog/batch-convert-rename-resize
- Types: text (font/size/style/colour, transparency, shadow, rotation, multi-line, special chars, auto-numbering), image/logo, shapes (solid or gradient fill), QR (with macros), EXIF/IPTC macros (date with custom format, camera data, "today" date), border, invisible watermark (Mac 5.5).
- Placement: 9 preset positions + padding, exact top/left coordinates, drag-drop, tile H/V/both with row/column anchoring, real-time preview.
- Batch: folders + sub-folders preserving structure, drag from Explorer, pause/cancel with progress; Free 50 images & 2 watermarks, Pro unlimited; output format convert (BMP/JPG/GIF/PNG/TIFF, photos→PDF single or merged), JPEG quality, resize, rename with numbering, thumbnails; metadata include all / all-but-GPS / none; original resolution and DPI preserved (5.5+).
- Templates: save/load presets, auto-load on launch (Pro only). No cloud sync or export documented.
- **2026-09-08 re-check:** current line is 6.5/6.6 (Jun 2026). v6.3 added **120+ hand-picked built-in fonts** (handwriting/signature/calligraphic), so uMark is no longer "system fonts only"; v6.5 folds QR codes into the batch flow. https://www.uconomix.com/Products/uMark/Blog/umark-6-3-windows-update
- Pricing: Free forever (reduced) or Professional $29 one-time; Personal 1 PC / Professional 3 / Team 10; half-price upgrades; 30-day refund. Video and PDF are separate paid products.

### 2.6 Android field

- **Add Watermark (AndroidVilla)** — https://play.google.com/store/apps/details?id=com.androidvilla.addwatermark.free ; changelog site https://androidvilla.wordpress.com/ . 130 fonts + import 20 TTF/OTF; shadow, outline, background box (colour/margin/rounded corners), gradient, rotation; © quick-insert, emoji; date placeholders `%day-dd%`; predefined positions, drag, tile, margins in 0.1 %; flip image watermark; crop/rotate source; batch 20 images; 20 recent watermarks stored; JPEG/PNG/auto; free capped at 1024 px, paid up to 30 MP; full EXIF+XMP incl. photosphere/GPS; batch rename; stickers by category; free with IAP ("Classic" paid version security-only).
- **Add Watermark on Photos (Simply Entertaining)** — https://apkpure.com/add-watermark-on-photos/com.SimplyEntertaining.addwatermark (v6.6 Jun 2026). Text (hundreds of fonts, colour, size, rotation, background), logo import, ©/™/® symbols, pattern templates, digital signature, QR watermarks with premade QR templates, tiling/cross-pattern, "pixel-perfect" positioning, batch "hundreds" with per-image preview adjustment, save templates; free with IAP.
- **Watermark: Logo, Text on Photo (AppXStudio/ZipoApps)** — https://apkpure.com/watermark-logo-text-on-photo/com.appxstudio.watermark (v1.8.3). 250+ fonts, 1,000+ stickers/emoji, signature (saved for reuse), timestamp/hashtag, PNG logo, pinch/drag/rotate gestures, opacity slider, crop ratios incl. FB/Pinterest/YouTube presets, save templates, share to Instagram/Facebook/email; free with ads.

### 2.7 Browser-based bulk field (WEB) — new at the 2026-09-08 re-check

A cluster of free, client-side (no-upload) bulk watermarking web apps has appeared — the closest analogs yet to Watermark Pro's core "in-browser bulk, nothing leaves the device" positioning. None has accounts, roles, sharing, video, PDF, an invisible mark, or photo adjustments; they are single-purpose bulk watermarkers. Confirmed 2026-09-08.

- **ImagiTool** — https://imagitool.com/watermark-image . The most complete of the field: browser-local, text + logo layers with **multi-layer compositing**, 9-point anchors with pixel/percent offsets, **tiling** (diagonal/grid/H/V/staggered), **saveable presets**, **per-image overrides**, **dynamic text tokens** (filename, date, index, dimensions), **relative scaling modes** (px / % width / % height / % short side) for mixed sizes, worker-based processing for 100+ images, real-time per-image preview; output JPG/PNG/WebP/TIFF; free, no signup. No video/PDF.
- **PixelBatch** — https://pixelbatch.io/bulk-watermark . "Add copyright text to 100+ photos instantly in your browser," offline-capable, no uploads; markets processing a whole wedding gallery in under two minutes. Free, no signup. (Home page returned HTTP 403 to automated fetch on 2026-09-08; feature detail is from the search listing.)
- **BulkWatermarker** — https://bulkwatermarker.com/ . Client-side, text (15+ fonts, colour) + logo, opacity/rotation/positioning, **tile & transparent-overlay patterns** (grid/staggered/diagonal), ~50+ images at once, single-ZIP download; JPEG/PNG/WebP with quality; free, no signup. No presets documented.
- **Watermarquee** — https://watermarquee.com/ . Free tier is single-image and client-side with a "Watermarquee" stamp; **Plus $9.99/mo** adds server-side **batch**, a **brand kit** (saved settings), AI SEO metadata/alt-text and **video** (Plus, ≤ 2 min 1080p); a **Studio** tier is announced with upscaling and **invisible/pattern watermarks**. Logo/caption watermarks, blend modes; JPG/PNG/WebP.

---

## 3. Table stakes vs differentiators

### 3.1 Table stakes (every major competitor has these; ranked by how universally they appear and how often reviews mention them)

1. **Text watermark with font choice, colour, opacity, size, rotation** — all six. Font libraries range 130–1,000; reviewers notice when fonts are gated (eZy $0.99 IAP).
2. **Image/logo watermark from a transparent PNG** — all six. Watermarkly/Visual Watermark add auto background removal; eZy is criticised for lacking it.
3. **Drag placement with pinch-to-scale on touch** plus some alignment aid (eZy snap-to-grid, uMark 9 positions, AndroidVilla margins) — all.
4. **Opacity control** — all; explicitly praised in eZy reviews.
5. **Batch: apply one watermark to many images** — all; the practical bar is "unlimited" (WML/VW/IWM/uMark Pro). eZy's 5-per-batch and uMark Free's 50 are the outliers users complain about.
6. **Save/reuse watermark templates/presets** — all six (uMark gates it behind Pro). Cloud sync of templates is now present in eZy, Watermarkly and Visual Watermark.
7. **Tiling / repeat pattern** — all six (uMark Pro only).
8. **Shadow on text** — all six.
9. **Preview before export; originals untouched** — all.
10. **Save to gallery + system share sheet / named socials (Instagram, Facebook, WhatsApp)** — all mobile products.
11. **Copyright/trademark symbols** — all.
12. **Resolution preservation / quality control** — every product except eZy documents formats and quality; eZy has a "Maintain Resolution" toggle and users complain about degradation. Parity means: output at source resolution, JPEG quality control, and a documented format list (at least JPEG + PNG).
13. **Multiple watermarks on one image** — WML/VW/IWM/uMark/AND; eZy gates it under Premium.
14. **Auto-scale watermark to image size for mixed batches** — WML, VW, IWM, and now eZy ("AI Powered Templates"); uMark and the Android apps lack it. Borderline table-stakes; four of six.
15. **Crop/resize on export** — five of six.

### 3.2 Differentiators (one or two competitors only)

| Differentiator                                                                   | Who                                                                                                | Note                                                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Finger-drawn **signature** watermark with pen thickness                          | eZy, iWatermark+ (also AppXStudio/Simply Ent. on Android)                                          | Absent from Watermarkly/VW/uMark — a mobile-native feature the desktop tools skip |
| **QR code** watermark                                                            | eZy, iWatermark+, uMark, Simply Ent.                                                               | Absent in Watermarkly/VW                                                          |
| **Date/time stamp** from EXIF or "now" with custom format                        | uMark, iWatermark+ (tags), AndroidVilla placeholders; eZy has a plain timestamp                    | Watermarkly/VW have none                                                          |
| **EXIF/IPTC/GPS metadata as visible text** (camera, aperture, location)          | iWatermark+, uMark                                                                                 |                                                                                   |
| **Invisible watermark** (StegoMark / metadata embed)                             | iWatermark+, uMark Mac                                                                             |                                                                                   |
| **Curved (arc) / banner text, lines, borders, vector shapes**                    | iWatermark+ (arc, banner, lines, border, vector); uMark (shapes, border)                           |                                                                                   |
| **Letter spacing, emboss/engrave**                                               | iWatermark+ (spacing); WML/VW/IWM (emboss/3D)                                                      |                                                                                   |
| **Logo background auto-removal**                                                 | Watermarkly / Visual Watermark                                                                     | Called out as an eZy weakness                                                     |
| **Randomised placement to defeat AI watermark removers**                         | Visual Watermark                                                                                   |                                                                                   |
| **Per-image override inside a batch (Preview section)**                          | Watermarkly, Visual Watermark, iWatermark+, Simply Ent.                                            | eZy users switch to single mode for this                                          |
| **Template export as a file to share with colleagues**                           | Watermarkly/VW; iWatermark+ library import/export                                                  | The only "team" story anyone has; no roles/multi-user anywhere                    |
| **Apple Photos editing extension + home-screen Shortcuts ("Instant Watermark")** | iWatermark+                                                                                        |                                                                                   |
| **Metadata policy: keep all / keep all except GPS / strip**                      | uMark (also WML keep/strip toggle)                                                                 | Privacy-relevant; eZy has nothing documented                                      |
| **DPI preservation**                                                             | uMark                                                                                              |                                                                                   |
| **Folder + sub-folder input preserving tree; pause/cancel with progress**        | uMark                                                                                              | Desktop-only                                                                      |
| **Video in the same app / same batch**                                           | Watermarkly (web), iWatermark+                                                                     | eZy, VW, uMark ship separate video apps                                           |
| **PDF watermarking**                                                             | Watermarkly, VW, uMark (separate)                                                                  |                                                                                   |
| **In-browser/local processing guarantee**                                        | Watermarkly/VW (marketing point)                                                                   | All mobile apps are on-device anyway                                              |
| **Photosphere/360 metadata preservation**                                        | AndroidVilla                                                                                       | niche                                                                             |
| **Cloud import from Dropbox/Google Photos/Box/OneDrive**                         | Watermarkly (GDrive, Google Photos, Dropbox), iWatermark+ (iCloud, Dropbox, GDrive, Box, OneDrive) | eZy: Google Drive (+FB/IG per vendor listing)                                     |
| **One-time purchase, no ads**                                                    | iWatermark+ $4.99, uMark $29, VW $39.95                                                            | eZy's IAP stack + ads is its most-reviewed negative                               |

No competitor in §1 offers: folder watch/hot folder, URL import, brightness/exposure adjustments, multi-user roles, or per-user permissions. **Every one of these is now shipped in Watermark Pro** — see §5.

---

## 4. eZy Watermark flagship features and workflow (what "spiritual competitor" parity means)

**Home screen** offers three entry points: **Single Image**, **Multiple Images** (batch), and **Templates** (Photoroom walkthrough). A resolution/quality setting is exposed before editing (iphone-fotograaf walkthrough).

**Single-image flow**: pick source (camera roll, camera, Google Drive, Facebook/Instagram) → tap **+** → choose watermark type: **Text**, **Image** (gallery PNG), **QR code**, **Signature** (draw with finger; pen thickness), plus **date/time stamp**, **stickers/emoji**, © / ™ / ® symbols → drag with a finger to place; pinch to size; side-panel controls for size, angle, opacity, font, colour, shadow → **Snap to Grid** for alignment → optional **Tile** to repeat across the image → tap checkmark → **Export** (save to library; share to Instagram, Pinterest, Facebook, Twitter, LinkedIn, WhatsApp, email, Google Drive). Optional pre-edit: crop, aspect ratio, align/rotate, filters.

**Templates**: a configured watermark (element + position + style) is saved as a template. Since v10.5 (Aug 2026) templates are **AI-powered/adaptive** (auto-adjust placement and scale across photos of different sizes/orientations) and **cloud-synced** across the user's devices. "Snap to Grid", "Tile" and "AI Powered Templates" are the three named flagship features in the current store copy.

**Batch flow**: Multiple Images → select up to **5** photos → apply a template → export all. Batch is gated ($3.99 IAP or Premium). Known pain points from reviews: files renamed and reordered on export, ads covering the Done button, image dimensions capped/distorted in free tier unless "Maintain Resolution" is on, and finicky size/angle control.

**Monetisation model**: free app with ads + à-la-carte IAPs (Batch $3.99, Custom Fonts $0.99, Ad-free $0.99, sticker packs $0.99) or Premium subscription ($1.99/mo, $19.99/yr). A separate paid "Classic" SKU ($5.99 iOS / $4.99 Android) bundles the IAPs.

**Gaps a competitor can exploit** (all documented above): batch limit of 5, no per-image override in batch, no rename/resize control on export, no documented EXIF keep/strip, no logo background removal, no template file export/sharing, no undo documented, no video in the same app, ads. Features to match to claim parity with eZy specifically: text/logo/signature/QR/date/sticker types; snap-to-grid; tile; adaptive templates with cloud sync; crop/resize/rotate/filters pre-edit; camera + gallery + Google Drive import; the named share targets; 11-language localisation.

---

## 5. Watermark Pro vs the field (M19 re-check, 2026-09-08)

Scored from what the repository has actually shipped through M18 plus the in-progress M19 (`CHANGELOG.md`, `PLAN.md`); ✓/◐/✗ as in §1. Competitor facts are the §1–§2 sources, re-checked 2026-09-08.

### 5.1 Matches (now at parity with the field)

- Text / logo / signature / QR marks; emoji and © / ™ / ® symbols; multi-line text; multiple layers on one image.
- Text styling: colour, opacity, shadow, outline, background box, rotation, letter spacing, emboss/engrave, and curved/arc text.
- Placement: drag, snap-to-grid, tiling, auto-scale, smart auto-placement across mixed orientations, per-image override inside a batch, and randomised anti-removal placement (only Visual Watermark otherwise has the last one).
- Batch: parallel multi-core processing, resize and rename on export, pause/resume with live progress, folder + sub-folder input.
- Editing: crop, resize, rotate/straighten, one-tap filters.
- Output & metadata: JPEG/PNG/WebP, JPEG quality control, EXIF keep/strip, DPI preservation, originals never altered.
- Templates: save presets, sync across devices, export/import as a file, adaptive/smart templates.
- Import/export: camera, Google Drive, Dropbox, OneDrive, drag-drop, and save back to those clouds; the system share sheet.
- UX: pinch-to-scale and twist-to-rotate gestures, undo/redo, dark mode.
- Metadata policy keep / keep-except-location / strip (matches uMark's all / all-but-GPS / none and Watermarkly's keep/strip).
- Invisible / steganographic mark (matches iWatermark's StegoMark and uMark's invisible watermark).

### 5.2 Exceeds (no competitor, or only one, has these)

- **Video _and_ PDF _and_ an invisible mark, all in one app.** Watermarkly is the only competitor with video + PDF and it has no invisible mark; no single-app rival bundles all three.
- **Invisible mark plus a Verify read-back page** — competitors can embed a StegoMark but ship no self-serve reader to check a photo.
- **Full multi-user model**: organizations, four roles (owner/admin/editor/viewer), email invitations, an append-only audit log, and a platform-admin console. The field's entire "team" story is sharing a template file or a device-count licence; nobody has roles or per-user permissions.
- **Secure sharing**: signed, expiring, revocable links and public album pages with tamper-proof, rate-limited tokens. No competitor shares output through links at all.
- **URL import** (Worker fetch under an SSRF policy) — no competitor imports from a URL.
- **Folder watch / hot folder in the browser** — no competitor, desktop or web, offers it.
- **Photo brightness / contrast / saturation / warmth / sepia / vignette** — no competitor offers exposure or colour adjustments.
- **EXIF-driven visible tokens with separator tidy-up** (`{camera}` / `{iso}` / `{shutter}` / `{taken}` / `{location}` …) — matches iWatermark/uMark on breadth and adds graceful handling of empty tokens.
- **Twelve languages including a right-to-left script (Arabic), account-persisted** — ahead of uMark (8), iWatermark (9) and eZy (11); Watermarkly's 17 is the only higher count.
- **Free and open-source (MIT), no ads, no IAP, self-hostable.** The only ad-free competitors are paid apps.

Against the **new browser-based field (WEB)** specifically, Watermark Pro matches the local-processing bulk core (ImagiTool reaches presets, per-image overrides, dynamic tokens and relative scaling too) and then goes well beyond it on accounts/roles, sharing, video, PDF, the invisible mark, cloud import/export and photo adjustments — none of which any WEB tool has.

### 5.3 Still missing or partial (feed into PLAN §4)

Honest gaps where a competitor is ahead:

1. **Font library is small** — 51 open-licensed families vs 120–1,000 (uMark 120+, iWatermark 292, Visual Watermark 926, Watermarkly ~900–1,000). ◐
2. **No HEIC / RAW / TIFF input** — WMP accepts only JPEG/PNG/WebP; Watermarkly takes HEIC/AVIF and iWatermark/VW/uMark take RAW/TIFF. A real gap for iPhone-native (HEIC) libraries. ✗
3. **Output formats are narrow** — JPEG/PNG/WebP only; competitors also write TIFF/BMP/GIF (and photo→PDF conversion). ✗
4. **No gradient fill** on text or shapes (Watermarkly, Visual Watermark, uMark and AndroidVilla have it). ✗
5. **No decorative sticker / large icon library** — 70 lucide icons + 96 emoji vs 490+ (Watermarkly) / 1,000+ (AppXStudio) / 5,000+ (iWatermark). ◐
6. **No built-in template gallery** of ready-made designs (Watermarkly, Visual Watermark and iWatermark ship one). ✗
7. **No photo background removal, face/plate blur or upscale** (Watermarkly ships these as side tools; WMP has logo-only background removal). ✗
8. **No numeric x/y placement fields** — placement is drag + snap + margin + keyboard nudge, with no exact top/left entry (iWatermark, uMark and AndroidVilla have it). ◐
9. **No named-social or dedicated email export**, no Apple Photos editing extension, no iOS Shortcuts "Instant Watermark" — WMP relies on the OS share sheet plus PWA file/share-target handling. ◐
10. **Fewer import sources** — no Google Photos, Facebook, Instagram, iCloud or Box (iWatermark and Watermarkly cover more). ◐
11. **Localisation follow-ups** (already in PLAN §4): date/number/file-size formatting still follows the browser default rather than the active locale, and error and email text stay English. ◐

None of these blocks parity with **eZy** (the primary "spiritual competitor"), which Watermark Pro already meets or exceeds on every axis except font count and sticker packs.

---

## Sources (all URLs referenced)

- eZy: https://apps.apple.com/us/app/ezy-watermark-photos/id494473910 · https://apps.apple.com/gb/app/ezy-watermark-photos/id494473910 · https://apps.apple.com/us/app/ezy-watermark-photos-classic/id494472589 · https://apps.apple.com/us/app/ezy-watermark-photo/id1407246400?mt=12 · https://apps.apple.com/us/app/ezy-watermark-photos/id494473910?see-all=reviews&platform=iphone · https://play.google.com/store/apps/details?id=com.whizpool.ezywatermarklite · https://apkpure.com/ezy-watermark-photos-classic/com.whizpool.ezywatermarkpro · https://watermark-photo-whizpool.en.aptoide.com/app · https://ezy-watermark-photo.soft112.com/ · https://sourceforge.net/software/product/eZy-Watermark/ · https://mwm.ai/apps/ezy-watermark-photos-lite/494473910 · https://video.ezywatermark.com/ · https://whizpool.com/ui-ux-design/ezy-watermark-3/ · https://www.photoroom.com/blog/watermark-photos-iphone · https://www.iphone-fotograaf.nl/en/how-to-watermark-iphone-photos-app/ · https://www.idownloadblog.com/2022/03/25/how-to-add-watermark-to-image-iphone-ipad/
- Watermarkly: https://watermarkly.com/ · https://watermarkly.com/pricing/ · https://watermarkly.com/video-watermark/ · https://watermarkly.com/photo-resizer/ · https://watermarkly.com/blog/template-sync/ · https://apps.apple.com/us/app/watermarkly-watermark-maker/id1507414497 · https://mwm.ai/apps/watermarkly-watermark-maker/1507414497 · https://play.google.com/store/apps/details?id=com.visualwatermark.watermarkly · https://aiforeasylife.com/tool/watermarkly-ai/ · https://imagemarker.app/en/blog/best-watermark-generators
- Visual Watermark: https://www.visualwatermark.com/ · https://www.visualwatermark.com/buy/ · https://www.visualwatermark.com/download/ · https://www.visualwatermark.com/support/all-built-in-logos-and-fonts/ · https://www.visualwatermark.com/video-watermark/ · https://www.techulator.com/resources/15945-Visual-Watermark-Software-Review.aspx
- iWatermark: https://plumamazing.com/iwatermark-plus-ios · https://apps.apple.com/us/app/iwatermark-logo-photo-video/id931231254 · https://www.issuewire.com/new-iwatermark-version-70-with-instant-watermark-lines-watermark-to-protect-photos-1746278197266011 · https://plumamazing.com/iwatermark-pro · https://plumamazing.com/iwatermark-pro-2-windows · https://boomertechtalk.com/how-and-why-to-use-iwatermark-for-your-photos-and-art/
- uMark: https://www.uconomix.com/products/umark/ · https://www.uconomix.com/Products/uMark/Comparison.aspx · https://www.uconomix.com/Products/uMark/FAQ.aspx · https://www.uconomix.com/Products/uMark/Blog/umark-5-5-win · https://www.uconomix.com/Products/uMark/Blog/umark-6-launched · https://www.uconomix.com/products/umark/blog/photo-capture-date-watermark · https://www.uconomix.com/products/umark/blog/batch-convert-rename-resize
- Android: https://play.google.com/store/apps/details?id=com.androidvilla.addwatermark.free · https://androidvilla.wordpress.com/ · https://apkpure.com/add-watermark-on-photos/com.SimplyEntertaining.addwatermark · https://apkpure.com/watermark-logo-text-on-photo/com.appxstudio.watermark · https://apkcombo.com/arqam/ma.arqam/ (confirms Arqam is not a watermark app)
- Browser-based bulk field (WEB, added 2026-09-08): https://imagitool.com/watermark-image · https://pixelbatch.io/bulk-watermark · https://bulkwatermarker.com/ · https://watermarquee.com/
- 2026-09-08 re-check sources: https://apps.apple.com/us/app/ezy-watermark-photos/id494473910 (eZy v10.5, 27 Aug 2026) · https://www.uconomix.com/Products/uMark/Blog/umark-6-3-windows-update (uMark 120+ fonts) · https://www.uconomix.com/Products/uMark/Blog/umark-6-launched · https://www.visualwatermark.com/download/ (Visual Watermark 5.50) · https://plumamazing.com/iwatermark-pro-2-windows · https://watermarkly.com/
