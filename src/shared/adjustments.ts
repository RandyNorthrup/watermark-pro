/**
 * Photo orientation and colour-adjustment values, shared between the client
 * (which applies them to pixels) and the Worker (which will validate saved
 * values). Pure data and Zod schemas only; the pixel maths lives in
 * `src/client/engine/adjust.ts`.
 */
import { z } from 'zod'

export { SEPIA_MATRIX } from './constants'

/** Straighten range and step, in degrees. */
export const MAX_STRAIGHTEN_DEGREES = 45
export const STRAIGHTEN_STEP_DEGREES = 0.1
/** Full-strength brightness shifts a channel by this many levels (of 255). */
export const BRIGHTNESS_RANGE = 128
/** Full-strength warmth adds this to red and removes it from blue. */
export const WARMTH_RANGE = 20
/** Vignette leaves the inner fraction of the radius untouched. */
export const VIGNETTE_INNER = 0.3

const signedUnit = z.number().min(-1).max(1)
const unitInterval = z.number().min(0).max(1)

/** The four quarter-turn values as named data (a union of literals for the schema). */
const TURNS = { none: 0, quarter: 1, half: 2, threeQuarter: 3 } as const

export const orientationSchema = z.object({
  /** Quarter turns clockwise. */
  turns: z.union([
    z.literal(TURNS.none),
    z.literal(TURNS.quarter),
    z.literal(TURNS.half),
    z.literal(TURNS.threeQuarter),
  ]),
  flipX: z.boolean(),
  flipY: z.boolean(),
  /** Degrees, clockwise positive, applied after the turns and flips. */
  straighten: z.number().min(-MAX_STRAIGHTEN_DEGREES).max(MAX_STRAIGHTEN_DEGREES),
})

export type Orientation = z.infer<typeof orientationSchema>

export const adjustmentsSchema = z.object({
  brightness: signedUnit,
  contrast: signedUnit,
  saturation: signedUnit,
  warmth: signedUnit,
  sepia: unitInterval,
  vignette: unitInterval,
})

export type Adjustments = z.infer<typeof adjustmentsSchema>

export const IDENTITY_ORIENTATION: Orientation = {
  turns: 0,
  flipX: false,
  flipY: false,
  straighten: 0,
}

export const IDENTITY_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sepia: 0,
  vignette: 0,
}

export const FILTER_IDS = [
  'original',
  'mono',
  'sepia',
  'vivid',
  'warm',
  'cool',
  'fade',
  'noir',
] as const

export type FilterId = (typeof FILTER_IDS)[number]

export interface Filter {
  id: FilterId
  label: string
  adjust: Adjustments
}

function filter(id: FilterId, label: string, values: Partial<Adjustments>): Filter {
  return { id, label, adjust: { ...IDENTITY_ADJUSTMENTS, ...values } }
}

/** Named looks; each sets the six adjustments at once. */
export const FILTERS: readonly Filter[] = [
  filter('original', 'Original', {}),
  filter('mono', 'Mono', { contrast: 0.1, saturation: -1 }),
  filter('sepia', 'Sepia', { saturation: -0.3, sepia: 0.8 }),
  filter('vivid', 'Vivid', { contrast: 0.15, saturation: 0.35 }),
  filter('warm', 'Warm', { brightness: 0.05, saturation: 0.1, warmth: 0.4 }),
  filter('cool', 'Cool', { warmth: -0.4 }),
  filter('fade', 'Fade', { brightness: 0.1, contrast: -0.25, saturation: -0.15 }),
  filter('noir', 'Noir', { brightness: -0.05, contrast: 0.35, saturation: -1, vignette: 0.5 }),
]

export const FILTER_BY_ID: Record<FilterId, Filter> = Object.fromEntries(
  FILTERS.map((entry) => [entry.id, entry]),
) as Record<FilterId, Filter>

const ADJUSTMENT_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'warmth',
  'sepia',
  'vignette',
] as const

/** Two adjustment sets are the same look when every channel matches. */
function areAdjustmentsEqual(a: Adjustments, b: Adjustments): boolean {
  return ADJUSTMENT_KEYS.every((key) => Math.abs(a[key] - b[key]) < Number.EPSILON)
}

export function isIdentityAdjustments(adjust: Adjustments): boolean {
  return areAdjustmentsEqual(adjust, IDENTITY_ADJUSTMENTS)
}

export function isIdentityOrientation(orientation: Orientation): boolean {
  return (
    orientation.turns === 0 &&
    !orientation.flipX &&
    !orientation.flipY &&
    orientation.straighten === 0
  )
}

/** The filter whose values match `adjust`, or `'custom'` when none does. */
export function filterFor(adjust: Adjustments): FilterId | 'custom' {
  const match = FILTERS.find((entry) => areAdjustmentsEqual(entry.adjust, adjust))
  return match?.id ?? 'custom'
}
