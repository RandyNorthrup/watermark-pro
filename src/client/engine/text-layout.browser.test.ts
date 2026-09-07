import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { measureRun } from './text-layout'

const FONT_SIZE = 100

function context() {
  const ctx = offscreenBackend.createCanvas(10, 10).context
  ctx.font = `${String(FONT_SIZE)}px sans-serif`
  return ctx
}

describe('measureRun', () => {
  it('widens the run by the spacing between clusters', () => {
    const ctx = context()
    const tight = measureRun(ctx, 'ABCD', 0, FONT_SIZE)
    const spaced = measureRun(ctx, 'ABCD', 0.5, FONT_SIZE)
    // Three gaps of 0.5 × fontSize between four clusters.
    const gap = 0.5 * FONT_SIZE
    expect(spaced.width - tight.width).toBeCloseTo(3 * gap, 0)
    expect(spaced.glyphs).toHaveLength(4)
  })

  it('keeps kerned pairs measurable and never reports zero width', () => {
    const ctx = context()
    expect(measureRun(ctx, 'AV', 0, FONT_SIZE).width).toBeGreaterThan(0)
    expect(measureRun(ctx, '', 0, FONT_SIZE).width).toBeGreaterThanOrEqual(1)
  })
})
