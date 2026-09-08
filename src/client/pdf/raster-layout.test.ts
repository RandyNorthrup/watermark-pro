import { describe, expect, it } from 'vitest'

import {
  distinctPageSizes,
  documentSpec,
  hasSmartPlacement,
  type PageSize,
  pixelDimensions,
  sizeKey,
} from './raster-layout'
import { PDF_POINTS_PER_INCH, PDF_RASTER_DPI } from '../../shared/constants'
import { DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'

/** US Letter, in points. */
const LETTER: PageSize = { width: 612, height: 792 }
/** A4, in points. */
const A4: PageSize = { width: 595, height: 842 }

describe('pixelDimensions', () => {
  it('scales points to pixels at the raster dpi', () => {
    const pixels = pixelDimensions(LETTER)
    const scale = PDF_RASTER_DPI / PDF_POINTS_PER_INCH
    expect(pixels).toEqual({
      width: Math.round(LETTER.width * scale),
      height: Math.round(LETTER.height * scale),
    })
    // 612 pt at 150 dpi is 1275 px; a wrong points-per-inch would not land here.
    expect(pixels.width).toBe(1275)
    expect(pixels.height).toBe(1650)
  })

  it('never returns a sub-pixel dimension', () => {
    expect(pixelDimensions({ width: 0.1, height: 0.1 })).toEqual({ width: 1, height: 1 })
  })
})

describe('distinctPageSizes', () => {
  it('keeps one entry per distinct size, in first-seen order', () => {
    const distinct = distinctPageSizes([LETTER, A4, LETTER, A4])
    expect(distinct.map((entry) => entry.size)).toEqual([LETTER, A4])
    expect(distinct.map((entry) => entry.key)).toEqual([sizeKey(LETTER), sizeKey(A4)])
  })

  it('groups sizes that differ only below a whole point', () => {
    const distinct = distinctPageSizes([LETTER, { width: 611.6, height: 792.4 }])
    expect(distinct).toHaveLength(1)
  })
})

describe('hasSmartPlacement', () => {
  it('is true only for the smart mode', () => {
    expect(hasSmartPlacement(DEFAULT_TEXT_SPEC)).toBe(true)
    const anchored: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      placement: { mode: 'anchor', anchor: 'top-left' },
    }
    expect(hasSmartPlacement(anchored)).toBe(false)
  })
})

describe('documentSpec', () => {
  it('falls back to a bottom-right anchor when placement is smart', () => {
    const spec = documentSpec(DEFAULT_TEXT_SPEC)
    expect(spec.placement).toEqual({ mode: 'anchor', anchor: 'bottom-right' })
  })

  it('leaves every other placement mode unchanged', () => {
    const custom: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      placement: { mode: 'custom', x: 0.25, y: 0.75 },
    }
    expect(documentSpec(custom)).toBe(custom)
    const anchored: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      placement: { mode: 'anchor', anchor: 'top-left' },
    }
    expect(documentSpec(anchored).placement).toEqual({ mode: 'anchor', anchor: 'top-left' })
  })
})
