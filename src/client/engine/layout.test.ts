import { describe, expect, it } from 'vitest'

import type { LuminanceMap } from './analysis'
import {
  clampMarkCentre,
  fitMarkSize,
  resolvePlacement,
  rotatedMarkSize,
  type Size,
} from './layout'
import { DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'

const IMAGE: Size = { width: 800, height: 600 }
const MARK: Size = { width: 160, height: 60 }
const MAP: LuminanceMap = { width: 4, height: 4, values: new Float32Array(16).fill(0.5) }

it('contains the complete rotated footprint and fits oversized marks before positioning', () => {
  expect(clampMarkCentre({ x: -100, y: 700 }, IMAGE, MARK, 0)).toEqual({ x: 80, y: 570 })
  const turned = clampMarkCentre({ x: -100, y: 700 }, IMAGE, MARK, 90)
  expect(turned.x).toBeCloseTo(30)
  expect(turned.y).toBeCloseTo(520)
  const fitted = fitMarkSize({ width: 800, height: 500 }, IMAGE, 45)
  const footprint = rotatedMarkSize(fitted, 45)
  expect(footprint.width).toBeLessThanOrEqual(IMAGE.width)
  expect(footprint.height).toBeCloseTo(IMAGE.height)
  expect(fitted.width / fitted.height).toBeCloseTo(1.6)
})

it('snaps mark edges to the configured grid and keeps the last grid point inside the photo', () => {
  const image = { width: 300, height: 200 }
  const mark = { width: 50, height: 30 }
  expect(clampMarkCentre({ x: 123, y: 95 }, image, mark, 0, 20)).toEqual({ x: 125, y: 95 })
  expect(clampMarkCentre({ x: 123, y: 95 }, image, mark, 0, 40)).toEqual({ x: 105, y: 95 })
  expect(clampMarkCentre({ x: 1000, y: 1000 }, image, mark, 0, 20)).toEqual({ x: 265, y: 175 })
  const rotated = clampMarkCentre({ x: 123, y: 95 }, image, mark, 90, 20)
  expect(rotated.x).toBeCloseTo(115)
  expect(rotated.y).toBeCloseTo(105)
})

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
