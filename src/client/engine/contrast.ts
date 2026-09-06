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
  variant: ContrastVariant
  /** 0 = no outline or shadow, 1 = strongest. */
  outline: number
  /** True when the values came from analysis rather than the user. */
  isAuto: boolean
}

/** Chooses the variant and outline for a region with the given mean luminance. */
export function chooseContrast(meanLuminance: number): ResolvedContrast {
  const variant: ContrastVariant = meanLuminance > LUMINANCE_MIDPOINT ? 'dark' : 'light'
  const ink = variant === 'dark' ? DARK_INK_LUMINANCE : LIGHT_INK_LUMINANCE
  const contrast = Math.abs(ink - meanLuminance)
  const shortfall = Math.max(0, COMFORTABLE_CONTRAST - contrast) / COMFORTABLE_CONTRAST
  const outline = Math.min(1, MINIMUM_OUTLINE + (1 - MINIMUM_OUTLINE) * shortfall)
  return { variant, outline, isAuto: true }
}

/** Applies the user's manual choice, or falls back to analysis. */
export function resolveContrast(setting: Contrast, meanLuminance: number): ResolvedContrast {
  if (setting.mode === 'manual') {
    return { variant: setting.variant, outline: setting.outline, isAuto: false }
  }
  return chooseContrast(meanLuminance)
}

/** Ink colours for each variant. */
export const INK: Record<ContrastVariant, { fill: string; outline: string }> = {
  light: { fill: '#f8fafc', outline: 'rgba(15, 23, 42, 0.75)' },
  dark: { fill: '#0f172a', outline: 'rgba(248, 250, 252, 0.75)' },
}
