# M12 — Mark engine: arc text, letter spacing, text effects, shapes, borders, random placement, the full icon library and emoji

## Goal

iWatermark+ has arc and banner text, lines, borders and 5,000 vector
shapes; uMark has solid and gradient shapes and borders; Watermarkly,
Visual Watermark and iWatermark+ have emboss/3D text; Visual Watermark
randomises placement across a batch; every mobile app has sticker/emoji
packs. After M12 a text mark can curve, space its letters and take one of
four effects; a fifth mark kind draws rectangles, ellipses and lines; the
photo can carry a frame; placement can be randomised per photo; the icon
picker searches all 1,790 lucide icons; and an Emoji group joins the glyph
catalogue.

Research: `docs/competitor-research.md` §1.1, §1.2, §3.2.

## Behaviour

### Text: letter spacing, arc, effects (`kind: 'text'`)

- Letter spacing: slider −10 % … +100 % of the font size, default 0.
  Applies to every line.
- Arc: a "Curve" slider −100 … +100 %. 0 is straight. +100 % bends the
  text over a half circle (the middle of the text is highest); −100 %
  bends it under. Multi-line text with a curve draws each line on its own
  concentric arc, spaced by the line pitch. Curve is available for
  single-line and multi-line text alike but tokens resolve first, so the
  arc is measured on the resolved text.
- Effect: Solid (today's look), Outline (stroke only, no fill), Emboss
  (light highlight offset up-left, dark shadow offset down-right, then the
  fill at 70 % opacity), Engrave (the reverse offsets). The offsets are
  `EFFECT_OFFSET_RATIO = 0.04` of the font size. The auto-contrast outline
  and shadow still apply with Solid; Outline uses the ink as the stroke
  colour and no shadow; Emboss/Engrave use the ink's light and dark tones
  (`INK.light.fill`, `INK.dark.fill`) for the two offset copies.

### Shapes (`kind: 'shape'`)

A fifth mark kind. Designer tab "Shape" with:

- Shape: Rectangle, Rounded rectangle, Ellipse, Line.
- Proportions: width : height ratio slider from 1:4 to 4:1 (stored as
  `aspect`, 0.25 … 4; ignored for Line, which uses `aspect` as length :
  thickness, 4 … 40, default 20).
- Fill: on/off and a colour (`#rrggbb`) with its own opacity 0 … 1;
  Stroke: width 0 … 20 % of the mark height and a colour. Default: no
  fill, stroke 6 % in the auto-contrast ink. When `contrast.mode` is
  `auto` or `manual`, the stroke takes the resolved ink and the fill colour
  is used as given; `colour` mode sets both to the chosen colour unless a
  fill colour is set explicitly.
- Rounded rectangle corner radius: `SHAPE_CORNER_RATIO = 0.15` of the
  shorter side (constant, not a control).

Shapes are placed, scaled, rotated, tiled and layered like every other
mark. They exist so a user can put a translucent band behind a text layer,
a frame line, or a solid badge; the smart placement scores them like any
other box.

### Photo frame (`Transform.border`)

An outer matte around the photo: width 0 … 10 % of the shorter output side
and a colour (`#rrggbb`), default off. The output grows by twice the width;
marks are placed within the photo area, not the frame (the frame is drawn
last, over nothing). Editor: in the Adjust tab below the sliders ("Frame"
switch, width slider, colour). Bulk: in the "Photo adjustments" section.

### Random placement (`placement.mode === 'random'`)

A fourth placement mode, "Random": for each photo the mark lands on one of
the nine anchors chosen at random, then jittered by up to ±8 % of the image
size on each axis, clamped so the mark stays inside the margin. The random
source is seeded from the photo's file name, size and last-modified time
(`seedFor(file)`, FNV-1a 32-bit over that string) so re-running a batch
reproduces the same positions and the preview is stable for the same
file; the sample scene uses seed 1. The editor shows a "Shuffle" button
that bumps a per-layer `salt` (stored in the layer, not the preset) to try
another position. Purpose (Visual Watermark's argument): a mark that moves
between photos is harder for automated removal tools to learn.

### Full icon library

The icon picker gains a search box over all 1,790 lucide icons (names and
the tags lucide publishes) with the current 70 curated icons shown first as
"Popular". Icon nodes are loaded per icon on demand from the plain
`lucide` package (`lucide/dist/esm/icons/<name>.mjs`, already a
dependency, ISC; each module's default export is the `IconNode`) through
`import.meta.glob('/node_modules/lucide/dist/esm/icons/*.mjs')` with
`{ eager: false }`. The package has no `exports` map, so the deep path is
allowed; it ships no tag data, so search runs over names only (the glob's
keys, `a-arrow-down` … `zoom-out`, are the name list; no extra data file).
Verified on lucide 1.37.0: 1,790 icon modules. The
engine still receives path data (`iconPath(name)`) but `MarkResources`
resolves it asynchronously (`iconPathAsync(name): Promise<string>`), the
same way it loads fonts and logos, and the curated 70 keep their eager
entries so existing presets render without a network round trip. Presets
store the icon name only, as today (`MAX_ICON_NAME_LENGTH` stays 64).

### Emoji

A new glyph group "Emoji" in `GLYPH_GROUPS` with 96 curated emoji
(hearts, stars, hands, faces, weather, food, flags are excluded), drawn
with the platform emoji font stack
`'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`
(`EMOJI_FONT_STACK`). Colour emoji ignore `fillStyle`, so for glyphs in
this group the ink colour controls only the outline/shadow; the style panel
hides the Colour contrast choice for them and shows "Emoji keep their own
colours". Also a free-text "Any character" input next to the group list
(one to eight code points, `MAX_GLYPH_LENGTH`), which is how a user types
an emoji or symbol the groups lack.

## Data model (`src/shared/watermark.ts`)

```ts
export const TEXT_EFFECTS = ['solid', 'outline', 'emboss', 'engrave'] as const
export const MIN_LETTER_SPACING = -0.1
export const MAX_LETTER_SPACING = 1
export const MAX_CURVE = 1

// text mark gains (all with defaults so old presets parse):
letterSpacing: z.number().min(MIN_LETTER_SPACING).max(MAX_LETTER_SPACING).default(0),
curve: z.number().min(-MAX_CURVE).max(MAX_CURVE).default(0),
effect: z.enum(TEXT_EFFECTS).default('solid'),

export const SHAPES = ['rectangle', 'rounded-rectangle', 'ellipse', 'line'] as const
export const MIN_SHAPE_ASPECT = 0.25
export const MAX_SHAPE_ASPECT = 4
export const MIN_LINE_ASPECT = 4
export const MAX_LINE_ASPECT = 40
export const MAX_STROKE_RATIO = 0.2

baseMarkSchema.extend({
  kind: z.literal('shape'),
  shape: z.enum(SHAPES),
  aspect: z.number().min(MIN_SHAPE_ASPECT).max(MAX_LINE_ASPECT),
  fill: z.object({ enabled: z.boolean(), colour: hexColour, opacity: unitInterval }),
  stroke: z.object({ width: unitInterval.max(MAX_STROKE_RATIO), colour: hexColour.nullable() }),
})

// placement gains:
z.object({ mode: z.literal('random'), jitter: unitInterval.max(MAX_JITTER).default(DEFAULT_JITTER) })
// with MAX_JITTER = 0.15, DEFAULT_JITTER = 0.08
```

`Transform` (engine) gains `border?: { width: number; colour: string }`
(width as a fraction of the shorter output side, 0 … `MAX_BORDER_RATIO =
0.1`). `EditorDocument` gains `border: Border | null`; `BulkSettings`
gains `border: Border | null`.

Layers (`editor/state.ts` `Layer`) gain `salt: number` (default 0) for
the Shuffle button; it is not part of the preset.

`RenderableMark` (`engine/render.ts`) is unchanged for text; shapes need no
resources; icons keep `iconPath`.

## Algorithms

### Letter spacing and arc (`src/client/engine/text-layout.ts`, new)

Replace the `fillText(line)` calls in `drawGlyphs` with a glyph run:

```ts
export interface GlyphRun {
  glyphs: { char: string; advance: number }[]
  width: number
}
export function measureRun(ctx: Canvas2D, line: string, spacing: number): GlyphRun
```

`measureRun` splits the line into grapheme clusters
(`Intl.Segmenter('und', { granularity: 'grapheme' })`, available in every
target browser and in Node 24), measures each with `ctx.measureText`, and
adds `spacing × fontSize` after every cluster but the last. Straight text
draws each cluster at its cumulative x with `textAlign = 'left'` from
`−width / 2`. Kerning is lost between clusters when spacing ≠ 0; when
spacing is 0 draw the whole line with one `fillText` as today so kerning
and ligatures survive (the drill target: spacing 0 must still use the
single call).

Arc: for curve `k ≠ 0`, the arc angle is `φ = |k| × π` and the radius
`r = width / φ`. The run is drawn along a circle of radius `r` centred at
`(0, r)` for `k > 0` (text bends over the top; the centre is below the
baseline) or `(0, −r)` for `k < 0`. Each cluster sits at angle
`θ_i = −φ/2 + (x_i + advance_i / 2) / r` from the top (or bottom) of the
circle; draw with `save; translate(centre); rotate(±θ_i); fillText(char, 0, ∓r); restore`.
Multi-line: line `j` of `n` uses radius `r ± (j − (n−1)/2) × pitch`
(larger radius for lines further from the centre of curvature). The mark's
bounding box, used by `measureAspect` and the overlay, is:
width `2 r sin(φ/2)` when `φ ≤ π` (and `2r` above), height
`r (1 − cos(φ/2)) + fontSize × LINE_HEIGHT × n` — derive it in
`arcBounds(width, fontSize, lines, curve)` and unit-test it in Node with
`k = 0` (straight box), `k = 1` (half circle: width = 2r, height = r +
line height) and symmetry in the sign of `k`.

The text is scaled so that the _arc's bounding box width_ fills the mark
width (`fontSizeFor` uses `arcBounds`), which keeps the handles honest.

### Effects (`render.ts` `drawGlyphs`)

```
solid:   [outline stroke if contrast.outline > 0] → fill
outline: stroke with lineWidth = fontSize × OUTLINE_RATIO × max(contrast.outline, 0.5), no fill, no shadow
emboss:  fill INK.light.fill at (−d, −d); fill INK.dark.fill at (+d, +d); fill ink at alpha 0.7
engrave: fill INK.dark.fill at (−d, −d); fill INK.light.fill at (+d, +d); fill ink at alpha 0.7
```

with `d = fontSize × EFFECT_OFFSET_RATIO`. `drawBackdrop` is unchanged.

### Shapes (`render.ts` `drawShape`)

Within the mark box `(−w/2, −h/2, w, h)` after the existing rotation:
rectangle `rect`; rounded `roundRect` with radius `min(w, h) ×
SHAPE_CORNER_RATIO`; ellipse `ellipse(0, 0, w/2, h/2, 0, 0, 2π)`; line a
`roundRect` of height `h` (the thickness) — a line is a very wide rounded
rectangle so it rotates and tiles like everything else. Fill first
(`globalAlpha × fill.opacity`), then stroke (`lineWidth = h × stroke.width`,
inset by half the width so the stroke stays inside the box). Shapes take
part in `measureAspect` through `spec.aspect`.

### Frame (`pipeline.ts`)

After the marks are composed on the photo canvas, when `transform.border`
is set: create the output canvas of `(w + 2b, h + 2b)`, fill with the
colour, draw the photo canvas at `(b, b)`, encode that. `b = round(width ×
min(w, h))`. `MarkPlacement` coordinates are reported in _output_ pixels,
so add `b` to every placement centre before returning (the overlay must
line up with the framed preview). `PreviewRenderer` does the same.

### Random placement (`engine/layout.ts` `resolvePlacement`)

`resolvePlacement` gains a `seed: number` argument (from
`ApplyRequest.marks[i].seed`, set by the caller: `seedFor(file) + salt`
in the editor, `seedFor(file)` in bulk, `1` for the sample scene). Use a
small deterministic PRNG (`mulberry32(seed)` in `engine/random.ts`, unit
tested for a fixed sequence). Pick `ANCHORS[floor(next() × 9)]`, take its
centre, add `(next() − 0.5) × 2 × jitter × width` and the same for height,
clamp to the margin box. Tiling ignores random (tiles cover the image).

### Icon library (`src/client/symbols/library.ts`, new)

```ts
export const ICON_NAMES: readonly string[] // from dynamicIconImports keys, sorted
export function searchIcons(query: string, limit = 60): string[] // prefix and substring over names and tags
export async function loadIconNode(name: string): Promise<IconNode> // glob import, cached in a Map
export async function iconPathAsync(name: string): Promise<string> // curated first, then loadIconNode + iconToPath
```

`MarkResources.resolve` awaits `iconPathAsync` for icon symbols. The
picker (`symbol-picker.tsx`) renders search results as buttons with the
icon drawn from its node through `<svg>` (a tiny `IconNodeSvg`
component), 60 at a time with "Show more". Keep the name list out of the
initial bundle: the picker imports `library.ts` lazily (`React.lazy` on the
picker panel).

## Files

New: `src/shared/watermark.ts` additions (+ tests), `src/client/engine/text-layout.ts`
(+ `text-layout.test.ts` Node for `arcBounds`, `text-layout.browser.test.ts`
for `measureRun`), `src/client/engine/random.ts` (+ test),
`src/client/symbols/library.ts` (+ `library.test.ts`: `searchIcons('came')`
includes `camera`; `loadIconNode('camera')` resolves a node with a `path`),
`src/client/components/designer/shape-panel.tsx`,
`src/client/components/designer/text-effects.tsx` (spacing, curve, effect
controls; used by `watermark-designer.tsx` Text tab),
`src/client/components/editor/frame-controls.tsx`.

Modified: `render.ts` (`drawGlyphs`, `drawShape`, `measureAspect`),
`layout.ts`, `pipeline.ts`, `preview.ts`, `mark-resources.ts`,
`spec-edit.ts` (`MARK_KINDS` + `defaultSpecFor('shape')`, placement
`random` default), `placement-panel.tsx` (fourth choice + jitter slider +
Shuffle in the editor context), `style-panel.tsx` (hide Colour for emoji
glyphs), `symbol-picker.tsx`, `catalogue.ts` (Emoji group,
`EMOJI_FONT_STACK`), `watermark-panel.tsx` (Shuffle button per layer when
random), `bulk-tool.tsx` (frame controls), `library/index.tsx`
(`KIND_ICONS.shape = Shapes`, `describeSpec` for shapes), `preview-panel.tsx`
(`describePlacement` for random: "Random placement (seed …)").

## Tests

Unit: schema defaults for old presets (a text spec without
`letterSpacing`/`curve`/`effect` parses); `arcBounds` cases; `mulberry32`
fixed sequence; `seedFor` differs for different names and is stable;
`resolvePlacement` with `random` stays inside the margin box for 1,000
seeds (property test) and is deterministic per seed; `searchIcons`.

Browser: spacing 0.5 makes the run wider than spacing 0 by
`(clusters − 1) × 0.5 × fontSize` within 1 px; curve +1 draws pixels above
the straight baseline's top (sample rows); Outline effect leaves the
glyph interior untouched (a sampled interior pixel equals the background);
Emboss draws a light pixel up-left of a dark one; each shape kind paints
inside its box and not outside (four corner samples outside the ellipse
stay background); frame adds `2b` to the output size and the corner pixel
is the frame colour; a placement report with a frame is offset by `b`;
random placement puts the mark at different centres for two seeds and the
same centre for the same seed; icon `iconPathAsync('a-arrow-down')`
renders non-background pixels.

Page: designer Text tab shows Spacing, Curve and Effect; the Shape tab
saves a shape preset (fake library API receives `kind: 'shape'`); the
symbol picker search finds "camera" and a non-curated icon; the emoji
group renders 96 buttons and choosing one hides the Colour choice; editor
Shuffle changes the fake preview's mark seed; bulk frame settings reach the
runtime.

e2e (`e2e/library.spec.ts` on all projects): create a curved, embossed,
spaced text preset and a shape preset; the library lists both with the
right descriptions; open the shape preset in the editor and export (PNG
decodes, size unchanged). Keep the photo 640×400.

Red drills:

| Name                                           | Mutation                                       | Command                                                             |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Text: letter spacing ignored                   | `measureRun` adds 0 spacing                    | browser `text-layout.browser.test`                                  |
| Text: spacing 0 loses kerning (per-glyph path) | `drawGlyphs` always uses the glyph run         | browser `text-layout.browser.test` (kerned pair "AV" width differs) |
| Text: curve flattened                          | `arcBounds` returns the straight box           | unit `text-layout.test`                                             |
| Text: outline effect fills the glyph           | `outline` branch also calls `fillText`         | browser `pipeline.browser.test`                                     |
| Shape: ellipse drawn as a rectangle            | `drawShape` uses `rect` for ellipse            | browser `pipeline.browser.test`                                     |
| Frame: placement not offset by the border      | drop the `+ b` on placement centres            | browser `pipeline.browser.test`                                     |
| Random: same position for every seed           | `resolvePlacement` ignores `seed`              | unit `layout.test`                                                  |
| Random: jitter escapes the margin              | remove the clamp                               | unit `layout.test` (property)                                       |
| Icons: search misses non-curated icons         | `searchIcons` searches the curated list only   | unit `library.test`                                                 |
| Emoji: colour choice offered for emoji         | `style-panel` shows Colour for the emoji group | unit-client `library-pages.test`                                    |

## Docs

README "Watermark library" (text effects, curve, spacing; shapes; emoji;
icon search; random placement), "Editor" (frame, Shuffle), "Bulk" (frame);
CHANGELOG; PLAN §5.2 (placement modes: anchor, smart, custom, random) and
§3.1 (no new dependency: `lucide` is already installed; note the glob).

## Security and privacy

None new. Icon modules are static assets from the bundle (the glob is
resolved at build time; no runtime URL is built from user input:
`loadIconNode` looks the name up in the glob's record and throws for an
unknown name).

## Certification checklist

- [ ] gates, drills (ten new, all red), Lighthouse, screenshots (designer
      Text/Shape tabs and the icon search), bugs logged in §8
- [ ] initial JS for `/app/library/new` did not grow by more than 5 kB gz
      (the icon name list and library are lazy; check the build output)
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 1.4.0, tag, deploy, release
