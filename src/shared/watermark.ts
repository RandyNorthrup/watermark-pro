/**
 * Watermark specification: the serialisable description of a mark that the
 * library stores, the editor edits, and the engine renders. Everything here
 * is plain data; image sources are referenced by asset id and resolved to
 * bitmaps by the client before rendering.
 */
import { z } from 'zod'

import { FONT_WEIGHTS } from './constants'

export const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type Anchor = (typeof ANCHORS)[number]

export const CONTRAST_VARIANTS = ['light', 'dark'] as const

export type ContrastVariant = (typeof CONTRAST_VARIANTS)[number]

const unitInterval = z.number().min(0).max(1)

export const placementSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('anchor'), anchor: z.enum(ANCHORS) }),
  z.object({ mode: z.literal('smart') }),
  /** Centre of the mark as fractions of the image width and height. */
  z.object({ mode: z.literal('custom'), x: unitInterval, y: unitInterval }),
])

export const contrastSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({
    mode: z.literal('manual'),
    variant: z.enum(CONTRAST_VARIANTS),
    /** Outline and shadow strength, 0 = none, 1 = strongest. */
    outline: unitInterval,
  }),
])

export type Contrast = z.infer<typeof contrastSchema>

export const MAX_ROTATION_DEGREES = 180
export const MIN_SCALE = 0.02
export const MAX_SCALE = 1
export const MAX_MARGIN = 0.25
export const MIN_TILE_SPACING = 0.5
export const MAX_TILE_SPACING = 4

export const styleSchema = z.object({
  opacity: unitInterval,
  /** Degrees, counter-clockwise positive, applied around the mark's centre. */
  rotation: z.number().min(-MAX_ROTATION_DEGREES).max(MAX_ROTATION_DEGREES),
  /** Width of the mark as a fraction of the image width. */
  scale: z.number().min(MIN_SCALE).max(MAX_SCALE),
  /** Distance from the edges as a fraction of the shorter image side. */
  margin: unitInterval.max(MAX_MARGIN),
  tiling: z.object({
    enabled: z.boolean(),
    /** Gap between tiles as a multiple of the mark's own size. */
    spacing: z.number().min(MIN_TILE_SPACING).max(MAX_TILE_SPACING),
  }),
})

export type WatermarkStyle = z.infer<typeof styleSchema>

export const MAX_TEXT_LENGTH = 120
export const MAX_GLYPH_LENGTH = 8
export const MAX_ICON_NAME_LENGTH = 64

const fontWeightSchema = z.union(FONT_WEIGHTS.map((weight) => z.literal(weight)))

const baseMarkSchema = z.object({
  placement: placementSchema,
  contrast: contrastSchema,
  style: styleSchema,
})

export const symbolSourceSchema = z.discriminatedUnion('type', [
  /** A Unicode glyph such as © or ★, drawn with the given font family. */
  z.object({
    type: z.literal('glyph'),
    glyph: z.string().min(1).max(MAX_GLYPH_LENGTH),
    fontFamily: z.string().min(1),
  }),
  /** A named icon from the bundled icon catalogue. */
  z.object({ type: z.literal('icon'), name: z.string().min(1).max(MAX_ICON_NAME_LENGTH) }),
])

export const watermarkSpecSchema = z.discriminatedUnion('kind', [
  baseMarkSchema.extend({
    kind: z.literal('text'),
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
    fontFamily: z.string().min(1),
    fontWeight: fontWeightSchema,
  }),
  baseMarkSchema.extend({
    kind: z.literal('symbol'),
    symbol: symbolSourceSchema,
  }),
  baseMarkSchema.extend({
    kind: z.literal('image'),
    /** Logo stored in the organization's asset library. */
    assetId: z.string().min(1),
  }),
])

export type WatermarkSpec = z.infer<typeof watermarkSpecSchema>

export const DEFAULT_STYLE: WatermarkStyle = {
  opacity: 0.85,
  rotation: 0,
  scale: 0.22,
  margin: 0.04,
  tiling: { enabled: false, spacing: 1.5 },
}

export const DEFAULT_TEXT_SPEC: WatermarkSpec = {
  kind: 'text',
  text: '© Watermark Pro',
  fontFamily: 'Inter Variable',
  fontWeight: 600,
  placement: { mode: 'smart' },
  contrast: { mode: 'auto' },
  style: DEFAULT_STYLE,
}
