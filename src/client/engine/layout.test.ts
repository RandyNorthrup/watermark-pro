import { describe, expect, it } from 'vitest'

import type { LuminanceMap } from './analysis'
import { resolvePlacement, type Size } from './layout'
import { DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'

const IMAGE: Size = { width: 800, height: 600 }
const MARK: Size = { width: 160, height: 60 }
const MAP: LuminanceMap = { width: 4, height: 4, values: new Float32Array(16).fill(0.5) }

function randomSpec(jitter = 0.08): WatermarkSpec {
  return { ...DEFAULT_TEXT_SPEC, placement: { mode: 'random', jitter } }
}

describe('resolvePlacement random', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const spec = randomSpec()
    const a = resolvePlacement(spec, IMAGE, MARK, MAP, 123)
    const b = resolvePlacement(spec, IMAGE, MARK, MAP, 123)
    expect(a.centreX).toBe(b.centreX)
    expect(a.centreY).toBe(b.centreY)

    const anchors = new Set<string>()
    for (let seed = 1; seed <= 20; seed += 1) {
      anchors.add(resolvePlacement(spec, IMAGE, MARK, MAP, seed).anchor ?? '')
    }
    expect(anchors.size).toBeGreaterThan(1)
  })

  it('keeps the mark inside the image for every seed', () => {
    const spec = randomSpec(0.15)
    for (let seed = 0; seed < 300; seed += 1) {
      const { centreX, centreY } = resolvePlacement(spec, IMAGE, MARK, MAP, seed)
      expect(centreX).toBeGreaterThanOrEqual(MARK.width / 2 - 1)
      expect(centreX).toBeLessThanOrEqual(IMAGE.width - MARK.width / 2 + 1)
      expect(centreY).toBeGreaterThanOrEqual(MARK.height / 2 - 1)
      expect(centreY).toBeLessThanOrEqual(IMAGE.height - MARK.height / 2 + 1)
    }
  })
})
