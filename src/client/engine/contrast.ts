/**
 * Auto contrast (PLAN.md §5.2): picks the light or dark variant of a mark
 * from the luminance under it and sizes the outline by how close the region
 * is to the mark's own luminance.
 */
import type { Contrast, ContrastVariant } from '../../shared/watermark'

/** Regions brighter than this get the dark variant. */
export const LUMINANCE_MIDPOINT = 0.5
/** Luminance of the rendered variants: near-white and near-black ink. */
const LIGHT_INK_LUMINANCE = 0.96
const DARK_INK_LUMINANCE = 0.08
/**
 * Outline strength grows as the ink/background contrast shrinks below this.
 * Mid-tones give at best ~0.46 against either ink, so the threshold sits
 * above that; only clearly dark or bright regions get the minimum outline.
 */
const COMFORTABLE_CONTRAST = 0.7
/** Even a strongly contrasting mark keeps a faint outline for busy textures. */
const MINIMUM_OUTLINE = 0.15

export interface ResolvedContrast {
  /** The tone of the ink; the outline and backdrop take the opposite one. */
  variant: ContrastVariant
  /** The ink itself: the variant's stock colour, or the colour the user chose. */
  fill: string
  /** 0 = no outline or shadow, 1 = strongest. */
  outline: number
  /** True when the values came from analysis rather than the user. */
  isAuto: boolean
}

/** Ink colours for each variant, with the opposite tone for outlines and backdrops. */
export const INK: Record<ContrastVariant, { fill: string; outline: string; backdrop: string }> = {
  light: { fill: '#f8fafc', outline: 'rgba(15, 23, 42, 0.75)', backdrop: '#0f172a' },
  dark: { fill: '#0f172a', outline: 'rgba(248, 250, 252, 0.75)', backdrop: '#f8fafc' },
}

const HEX_RADIX = 16
const HEX_CHANNEL_LENGTH = 2
const CHANNEL_MAX = 255
/** sRGB transfer function constants. */
const SRGB_LINEAR_THRESHOLD = 0.04045
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_OFFSET = 0.055
const SRGB_SCALE = 1.055
const SRGB_GAMMA = 2.4
/** Rec. 709 luminance weights, the same ones the analysis map uses. */
const LUMA_WEIGHTS = { red: 0.2126, green: 0.7152, blue: 0.0722 }

function linearChannel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + HEX_CHANNEL_LENGTH), HEX_RADIX)
  const srgb = value / CHANNEL_MAX
  return srgb <= SRGB_LINEAR_THRESHOLD
    ? srgb / SRGB_LINEAR_DIVISOR
    : ((srgb + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA
}

/** Relative luminance of an `#rrggbb` colour, 0 (black) to 1 (white). */
export function hexLuminance(colour: string): number {
  const hex = colour.slice(1)
  return (
    LUMA_WEIGHTS.red * linearChannel(hex, 0) +
    LUMA_WEIGHTS.green * linearChannel(hex, HEX_CHANNEL_LENGTH) +
    LUMA_WEIGHTS.blue * linearChannel(hex, HEX_CHANNEL_LENGTH * 2)
  )
}

/** Chooses the variant and outline for a region with the given mean luminance. */
export function chooseContrast(meanLuminance: number): ResolvedContrast {
  const variant: ContrastVariant = meanLuminance > LUMINANCE_MIDPOINT ? 'dark' : 'light'
  const ink = variant === 'dark' ? DARK_INK_LUMINANCE : LIGHT_INK_LUMINANCE
  const contrast = Math.abs(ink - meanLuminance)
  const shortfall = Math.max(0, COMFORTABLE_CONTRAST - contrast) / COMFORTABLE_CONTRAST
  const outline = Math.min(1, MINIMUM_OUTLINE + (1 - MINIMUM_OUTLINE) * shortfall)
  return { variant, fill: INK[variant].fill, outline, isAuto: true }
}

/** Applies the user's choice (a variant or a colour), or falls back to analysis. */
export function resolveContrast(setting: Contrast, meanLuminance: number): ResolvedContrast {
  if (setting.mode === 'manual') {
    return {
      variant: setting.variant,
      fill: INK[setting.variant].fill,
      outline: setting.outline,
      isAuto: false,
    }
  }
  if (setting.mode === 'colour') {
    // A dark colour is "dark ink" and gets a light outline, and the reverse.
    const variant: ContrastVariant =
      hexLuminance(setting.colour) > LUMINANCE_MIDPOINT ? 'light' : 'dark'
    return { variant, fill: setting.colour, outline: setting.outline, isAuto: false }
  }
  return chooseContrast(meanLuminance)
}
