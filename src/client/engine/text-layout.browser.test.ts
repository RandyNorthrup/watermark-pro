import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { layoutText } from './text-layout'

const FONT_SIZE = 100
const LINE_HEIGHT = 1.15

function layout(lines: string[], spacing = 0, curve = 0) {
  const ctx = offscreenBackend.createCanvas(10, 10).context
  ctx.font = `${String(FONT_SIZE)}px sans-serif`
  return layoutText(ctx, lines, spacing, curve, FONT_SIZE, LINE_HEIGHT)
}

describe('measured text layout', () => {
  it('adds tracking only between clusters and retains shaping at zero tracking', () => {
    const tight = layout(['HHHH'])
    const spaced = layout(['HHHH'], 0.5)
    expect(spaced.width - tight.width).toBeCloseTo(3 * 0.5 * FONT_SIZE, 0)
    expect(spaced.glyphs).toHaveLength(4)
    expect(layout(['AV ffi']).glyphs).toHaveLength(1)
    expect(layout(['HHHH'], -0.1).width).toBeLessThan(tight.width)
    expect(layout(['']).width).toBe(1)
    expect(layout(['']).glyphs).toHaveLength(0)
    expect(layout(['X'], 0, 1)).toEqual(layout(['X']))
  })

  it('bends opposite ways within half a circle and stacks lines without intersecting ink', () => {
    const positive = layout(['HHHHHHHH'], 0, 1)
    const negative = layout(['HHHHHHHH'], 0, -1)
    expect(positive.width).toBeCloseTo(negative.width, 5)
    expect(positive.height).toBeCloseTo(negative.height, 5)
    expect(positive.height).toBeGreaterThan(layout(['HHHHHHHH']).height)
    expect(positive.glyphs.every((glyph) => Math.abs(glyph.rotation) < Math.PI / 2)).toBe(true)
    expect(negative.glyphs[0]?.rotation).toBeGreaterThan(0)
    expect(positive.glyphs[0]?.rotation).toBeLessThan(0)
    const multiline = layout(['HHHHHHHH', 'HHHHHHHH'], 0, 1)
    expect(multiline.height).toBeGreaterThan(positive.height * 2)
    expect(layout(['HHHHHHHH', '', 'HHHHHHHH'], 0, 1).height).toBeGreaterThan(multiline.height)
    expect(layout(['HHHHHHHH'], 0.5, 1).width).toBeGreaterThan(positive.width)
    // Tight tracking cannot force curved ink through its neighboring angular sector.
    expect(layout(['HHHHHHHH'], -0.2, 1)).toEqual(positive)
  })
})
