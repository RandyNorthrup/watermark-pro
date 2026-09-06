import { describe, expect, it } from 'vitest'

import {
  boxArea,
  boxSum,
  integralImage,
  regionStats,
  sobelMagnitude,
  toLuminanceMap,
} from './analysis'
import { mapFrom } from './test-support/maps'

describe('toLuminanceMap', () => {
  it('weights channels with Rec. 709 coefficients and ignores alpha', () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 0, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255,
    ])
    const map = toLuminanceMap(data, 2, 2)
    expect(map.width).toBe(2)
    expect(map.values[0]).toBeCloseTo(1)
    expect(map.values[1]).toBeCloseTo(0)
    expect(map.values[2]).toBeCloseTo(0.2126)
    expect(map.values[3]).toBeCloseTo(0.0722)
  })

  it('rejects mismatched dimensions', () => {
    expect(() => toLuminanceMap(new Uint8ClampedArray(8), 3, 1)).toThrow(RangeError)
  })
})

describe('sobelMagnitude', () => {
  it('is zero on a flat image and strongest on a hard vertical edge', () => {
    const flat = sobelMagnitude(mapFrom(8, 8, () => 0.4))
    expect(Math.max(...flat.values)).toBe(0)

    const edge = sobelMagnitude(mapFrom(8, 8, (x) => (x < 4 ? 0 : 1)))
    const row = [...edge.values.slice(4 * 8, 5 * 8)]
    expect(row[3]).toBeCloseTo(row[4] ?? -1)
    expect(row[3]).toBeGreaterThan(0.6)
    expect(row[0]).toBe(0)
    expect(row[7]).toBe(0)
  })
})

describe('integral images', () => {
  const map = mapFrom(4, 3, (x, y) => x + y * 4)

  it('sums arbitrary boxes and clamps to the image', () => {
    const integral = integralImage(map)
    expect(boxSum(integral, { x: 0, y: 0, width: 4, height: 3 })).toBe(66)
    expect(boxSum(integral, { x: 1, y: 1, width: 2, height: 1 })).toBe(5 + 6)
    expect(boxSum(integral, { x: -5, y: -5, width: 100, height: 100 })).toBe(66)
    expect(boxSum(integral, { x: 10, y: 10, width: 2, height: 2 })).toBe(0)
    expect(boxArea(integral, { x: 3, y: 2, width: 5, height: 5 })).toBe(1)
  })

  it('reports mean and variance of a region', () => {
    const values = integralImage(map)
    const squares = integralImage(map, (v) => v * v)
    const stats = regionStats(values, squares, { x: 0, y: 0, width: 2, height: 1 })
    expect(stats.mean).toBeCloseTo(0.5)
    expect(stats.variance).toBeCloseTo(0.25)
    expect(regionStats(values, squares, { x: 9, y: 9, width: 1, height: 1 })).toEqual({
      mean: 0,
      variance: 0,
    })
  })
})
