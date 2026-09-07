import { describe, expect, it } from 'vitest'

import { arcBounds, clustersOf } from './text-layout'

const LINE_HEIGHT = 1.15

describe('clustersOf', () => {
  it('splits into grapheme clusters, keeping combined emoji whole', () => {
    expect(clustersOf('abc')).toEqual(['a', 'b', 'c'])
    // A flag is two code points but one grapheme.
    expect(clustersOf('🇬🇧!')).toEqual(['🇬🇧', '!'])
  })
})

describe('arcBounds', () => {
  it('is the straight box at zero curve', () => {
    const one = arcBounds(200, 100, 1, 0, LINE_HEIGHT)
    expect(one.width).toBe(200)
    expect(one.height).toBeCloseTo(100 * LINE_HEIGHT, 6)
    // Two lines are twice as tall.
    const two = arcBounds(200, 100, 2, 0, LINE_HEIGHT)
    expect(two.height).toBeCloseTo(2 * 100 * LINE_HEIGHT, 6)
  })

  it('bends into a half circle at full curve', () => {
    // angle = π, radius = runWidth/π; width = 2r, height = r + one line block.
    const runWidth = 300
    const fontSize = 100
    const radius = runWidth / Math.PI
    const box = arcBounds(runWidth, fontSize, 1, 1, LINE_HEIGHT)
    expect(box.width).toBeCloseTo(2 * radius, 6)
    expect(box.height).toBeCloseTo(radius + fontSize * LINE_HEIGHT, 6)
  })

  it('is symmetric in the sign of the curve and shrinks the box width below the run width', () => {
    const positive = arcBounds(300, 100, 1, 0.5, LINE_HEIGHT)
    const negative = arcBounds(300, 100, 1, -0.5, LINE_HEIGHT)
    expect(positive).toEqual(negative)
    expect(positive.width).toBeLessThan(300)
  })
})
