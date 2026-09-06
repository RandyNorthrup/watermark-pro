/**
 * Pure helpers for editing a watermark spec in the designer. Each function
 * returns a new spec; the shared placement, contrast and style settings
 * survive a change of mark kind.
 */
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'
import { DEFAULT_FONT_FAMILY } from '../fonts/catalogue'

export type MarkKind = WatermarkSpec['kind']

export const MARK_KINDS: readonly { value: MarkKind; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'image', label: 'Logo' },
]

/** The settings every kind shares. */
type SharedSettings = Pick<WatermarkSpec, 'placement' | 'contrast' | 'style'>

function shared(spec: WatermarkSpec): SharedSettings {
  return { placement: spec.placement, contrast: spec.contrast, style: spec.style }
}

export const DEFAULT_GLYPH = '©'

/** Symbol marks default to a smaller scale than text; a glyph at 22% width is a poster. */
const DEFAULT_SYMBOL_SCALE = 0.12

export function defaultSpecFor(kind: MarkKind, base: WatermarkSpec, assetId = ''): WatermarkSpec {
  const settings = shared(base)
  switch (kind) {
    case 'text': {
      return {
        ...settings,
        kind: 'text',
        text: DEFAULT_TEXT_SPEC.kind === 'text' ? DEFAULT_TEXT_SPEC.text : '',
        fontFamily: DEFAULT_FONT_FAMILY,
        fontWeight: 600,
      }
    }
    case 'symbol': {
      return {
        ...settings,
        style: { ...settings.style, scale: DEFAULT_SYMBOL_SCALE },
        kind: 'symbol',
        symbol: { type: 'glyph', glyph: DEFAULT_GLYPH, fontFamily: DEFAULT_FONT_FAMILY },
      }
    }
    case 'image': {
      return { ...settings, kind: 'image', assetId }
    }
  }
}

/** Fresh designer state. */
export function blankSpec(): WatermarkSpec {
  return { ...DEFAULT_TEXT_SPEC, style: { ...DEFAULT_STYLE, tiling: { ...DEFAULT_STYLE.tiling } } }
}

export function withPlacement(spec: WatermarkSpec, placement: WatermarkSpec['placement']) {
  return { ...spec, placement }
}

export function withContrast(spec: WatermarkSpec, contrast: WatermarkSpec['contrast']) {
  return { ...spec, contrast }
}

export function withStyle(
  spec: WatermarkSpec,
  patch: Partial<Omit<WatermarkSpec['style'], 'tiling'>> & {
    tiling?: Partial<WatermarkSpec['style']['tiling']>
  },
): WatermarkSpec {
  const { tiling, ...rest } = patch
  return {
    ...spec,
    style: {
      ...spec.style,
      ...rest,
      tiling: { ...spec.style.tiling, ...tiling },
    },
  }
}
