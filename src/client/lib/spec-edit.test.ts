import { describe, expect, it } from 'vitest'

import { blankSpec, defaultSpecFor, withContrast, withPlacement, withStyle } from './spec-edit'
import { DEFAULT_STYLE } from '../../shared/watermark'

describe('spec editing helpers', () => {
  it('keeps placement, contrast and style when the mark kind changes', () => {
    const placed = withPlacement(blankSpec(), { mode: 'anchor', anchor: 'top-left' })
    const contrasted = withContrast(placed, { mode: 'manual', variant: 'light', outline: 0.2 })
    const base = withStyle(contrasted, { opacity: 0.5, tiling: { enabled: true } })
    const symbol = defaultSpecFor('symbol', base)
    expect(symbol.kind).toBe('symbol')
    expect(symbol.placement).toEqual({ mode: 'anchor', anchor: 'top-left' })
    expect(symbol.contrast).toEqual({ mode: 'manual', variant: 'light', outline: 0.2 })
    expect(symbol.style.opacity).toBe(0.5)
    expect(symbol.style.tiling).toEqual({ enabled: true, spacing: DEFAULT_STYLE.tiling.spacing })
    expect(symbol.style.scale).toBeLessThan(base.style.scale)

    const image = defaultSpecFor('image', base, 'asset-9')
    expect(image).toMatchObject({ kind: 'image', assetId: 'asset-9', style: base.style })

    const text = defaultSpecFor('text', image)
    expect(text.kind === 'text' && text.text.length > 0).toBe(true)
  })

  it('returns fresh objects so edits never leak into the defaults', () => {
    const first = blankSpec()
    const second = blankSpec()
    expect(first).toEqual(second)
    expect(first.style).not.toBe(second.style)
    expect(withStyle(first, { rotation: 45 }).style.rotation).toBe(45)
    expect(first.style.rotation).toBe(0)
  })
})
