import { describe, expect, it } from 'vitest'

import { apply, orientedSize, sourceToOriented, straightenedSize } from './orient'
import { IDENTITY_ORIENTATION, type Orientation } from '../../shared/adjustments'

const EPSILON = 1e-9

function orientation(overrides: Partial<Orientation>): Orientation {
  return { ...IDENTITY_ORIENTATION, ...overrides }
}

describe('orientedSize', () => {
  it('swaps width and height for odd quarter turns', () => {
    const source = { width: 400, height: 200 }
    expect(orientedSize(source, orientation({ turns: 0 }))).toEqual({ width: 400, height: 200 })
    expect(orientedSize(source, orientation({ turns: 1 }))).toEqual({ width: 200, height: 400 })
    expect(orientedSize(source, orientation({ turns: 2 }))).toEqual({ width: 400, height: 200 })
    expect(orientedSize(source, orientation({ turns: 3 }))).toEqual({ width: 200, height: 400 })
  })
})

describe('straightenedSize', () => {
  it('returns the full size at zero and shrinks with the angle', () => {
    const oriented = { width: 400, height: 200 }
    expect(straightenedSize(oriented, 0)).toEqual(oriented)
    const ten = straightenedSize(oriented, 10)
    // k = min(W/(W c + H s), H/(W s + H c)); computed from the formula, not the code.
    const cos = Math.cos((10 * Math.PI) / 180)
    const sin = Math.sin((10 * Math.PI) / 180)
    const k = Math.min(400 / (400 * cos + 200 * sin), 200 / (400 * sin + 200 * cos))
    expect(ten.width).toBeCloseTo(400 * k, 6)
    expect(ten.height).toBeCloseTo(200 * k, 6)
    expect(k).toBeLessThan(1)
    // Larger angle, smaller rectangle.
    expect(straightenedSize(oriented, 20).width).toBeLessThan(ten.width)
  })

  it('is symmetric in the sign of the angle', () => {
    const oriented = { width: 300, height: 500 }
    expect(straightenedSize(oriented, 12).width).toBeCloseTo(
      straightenedSize(oriented, -12).width,
      9,
    )
  })
})

describe('sourceToOriented', () => {
  it('sends the source top-left to the top-right after one clockwise turn', () => {
    const source = { width: 400, height: 200 }
    const matrix = sourceToOriented(source, orientation({ turns: 1 }))
    const corner = apply(matrix, 0, 0)
    // Oriented size is 200×400, so the top-right is (200, 0).
    expect(corner.x).toBeCloseTo(200, 6)
    expect(corner.y).toBeCloseTo(0, 6)
  })

  it('mirrors x under a horizontal flip', () => {
    const source = { width: 400, height: 200 }
    const matrix = sourceToOriented(source, orientation({ flipX: true }))
    expect(apply(matrix, 0, 0)).toMatchObject({
      x: expect.closeTo(400, 6),
      y: expect.closeTo(0, 6),
    })
    expect(apply(matrix, 400, 0)).toMatchObject({
      x: expect.closeTo(0, 6),
      y: expect.closeTo(0, 6),
    })
  })

  it('treats a 90 degree straighten of a square as one quarter turn', () => {
    const square = { width: 256, height: 256 }
    const straight = sourceToOriented(square, orientation({ straighten: 90 }))
    const turned = sourceToOriented(square, orientation({ turns: 1 }))
    for (const [x, y] of [
      [0, 0],
      [256, 0],
      [128, 200],
    ] as const) {
      const a = apply(straight, x, y)
      const b = apply(turned, x, y)
      expect(Math.abs(a.x - b.x)).toBeLessThan(EPSILON)
      expect(Math.abs(a.y - b.y)).toBeLessThan(EPSILON)
    }
  })
})
