import { describe, expect, it } from 'vitest'

import {
  exportGeometry,
  SIGNATURE_EXPORT_SIDE,
  SIGNATURE_PADDING_RATIO,
  type Stroke,
  strokeBounds,
} from './signature'

const strokes: Stroke[] = [
  {
    width: 4,
    points: [
      { x: 100, y: 50 },
      { x: 300, y: 150 },
    ],
  },
  { width: 10, points: [{ x: 40, y: 200 }] },
]

describe('strokeBounds', () => {
  it('covers every point plus half the pen width, and is null with no ink', () => {
    expect(strokeBounds([])).toBeNull()
    expect(strokeBounds([{ width: 4, points: [] }])).toBeNull()
    expect(strokeBounds(strokes)).toEqual({ x: 35, y: 48, width: 267, height: 157 })
  })
})

describe('exportGeometry', () => {
  it('pads the ink and scales the longer side to the export size', () => {
    const bounds = { x: 35, y: 48, width: 267, height: 157 }
    const geometry = exportGeometry(bounds)
    const padding = 267 * SIGNATURE_PADDING_RATIO
    expect(geometry.width).toBe(SIGNATURE_EXPORT_SIDE)
    expect(geometry.height).toBe(Math.round((157 + padding * 2) * geometry.scale))
    expect(geometry.scale).toBeCloseTo(SIGNATURE_EXPORT_SIDE / (267 + padding * 2))
    // The ink's top-left lands one padding in from the corner.
    expect(geometry.offsetX + bounds.x).toBeCloseTo(padding)
    expect(geometry.offsetY + bounds.y).toBeCloseTo(padding)
  })

  it('never produces an empty image for a single dot', () => {
    const geometry = exportGeometry({ x: 10, y: 10, width: 4, height: 4 })
    expect(geometry.width).toBe(SIGNATURE_EXPORT_SIDE)
    expect(geometry.height).toBe(SIGNATURE_EXPORT_SIDE)
  })
})
