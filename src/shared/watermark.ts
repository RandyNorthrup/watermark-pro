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

/** `#rrggbb`, lower or upper case. */
export const HEX_COLOUR_PATTERN = /^#[\da-f]{6}$/i

export const contrastSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({
    mode: z.literal('manual'),
    variant: z.enum(CONTRAST_VARIANTS),
    /** Outline and shadow strength, 0 = none, 1 = strongest. */
    outline: unitInterval,
  }),
  /** A chosen ink colour; the outline takes the opposite tone of that colour. */
  z.object({
    mode: z.literal('colour'),
    colour: z.string().regex(HEX_COLOUR_PATTERN),
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
  /**
   * A box behind text and symbol marks in the opposite tone of the ink.
   * Optional on input so presets saved before it existed still parse.
   */
  backdrop: z
    .object({
      enabled: z.boolean(),
      opacity: unitInterval,
    })
    .default({ enabled: false, opacity: 0.6 }),
})

export type WatermarkStyle = z.infer<typeof styleSchema>

export const MAX_TEXT_LENGTH = 120
/** Text marks wrap at newlines; more lines than this become unreadable at watermark sizes. */
export const MAX_TEXT_LINES = 4
export const MAX_GLYPH_LENGTH = 8
export const MAX_ICON_NAME_LENGTH = 64
export const MAX_QR_CONTENT_LENGTH = 512

/**
 * Placeholders a text mark may carry; the host fills them in per photo
 * (`resolveTextTokens`) before the engine sees the text.
 */
export const TEXT_TOKENS = ['{date}', '{time}', '{filename}'] as const

export interface TextTokenContext {
  /** When the photo was taken or, failing that, last modified. */
  date: Date
  /** The photo's file name without its extension. */
  fileName: string
}

/** Fills `{date}`, `{time}` and `{filename}` in a text mark. */
export function resolveTextTokens(text: string, context: TextTokenContext): string {
  const values: Record<(typeof TEXT_TOKENS)[number], string> = {
    '{date}': context.date.toLocaleDateString(undefined, { dateStyle: 'medium' }),
    '{time}': context.date.toLocaleTimeString(undefined, { timeStyle: 'short' }),
    '{filename}': context.fileName,
  }
  // Split-and-join: a replacement value is never reparsed for `$` patterns.
  let resolved = text
  for (const token of TEXT_TOKENS) {
    resolved = resolved.split(token).join(values[token])
  }
  return resolved
}

const fontWeightSchema = z.union(FONT_WEIGHTS.map((weight) => z.literal(weight)))

function hasAllowedLineCount(value: string): boolean {
  return value.split('\n').length <= MAX_TEXT_LINES
}

const textSchema = z
  .string()
  .min(1)
  .max(MAX_TEXT_LENGTH)
  .refine(hasAllowedLineCount, { message: `at most ${String(MAX_TEXT_LINES)} lines` })

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
    text: textSchema,
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
  /** A QR code of `content` (a URL, usually); always dark modules on a light field so it scans. */
  baseMarkSchema.extend({
    kind: z.literal('qr'),
    content: z.string().min(1).max(MAX_QR_CONTENT_LENGTH),
  }),
])

export type WatermarkSpec = z.infer<typeof watermarkSpecSchema>

export const DEFAULT_STYLE: WatermarkStyle = {
  opacity: 0.85,
  rotation: 0,
  scale: 0.22,
  margin: 0.04,
  tiling: { enabled: false, spacing: 1.5 },
  backdrop: { enabled: false, opacity: 0.6 },
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
