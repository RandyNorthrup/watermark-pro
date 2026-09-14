import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { layoutText } from './text-layout'
import { MAX_CURVE } from '../../shared/watermark'

const FONT_SIZE = 100
const LINE_HEIGHT = 1.15

function layout(lines: string[], spacing = 0, curve = 0) {
  const ctx = offscreenBackend.createCanvas(10, 10).context
  ctx.font = `${String(FONT_SIZE)}px sans-serif`
  return layoutText(ctx, lines, spacing, curve, FONT_SIZE, LINE_HEIGHT)
}

function addInk(occupied: Uint8Array, pixels: Uint8ClampedArray): number {
  let overlap = 0
  for (let index = 0; index < occupied.length; index += 1) {
    if ((pixels[index * 4 + 3] ?? 0) <= 127) continue
    if (occupied[index] === 1) overlap += 1
    occupied[index] = 1
  }
  return overlap
}

/** Native raster coverage detects collisions independently of reserved angular sectors. */
function overlappingInk(value: ReturnType<typeof layout>, shouldCoincide = false): number {
  const padding = 2
  const canvas = offscreenBackend.createCanvas(
    value.width + padding * 2,
    value.height + padding * 2,
  )
  const ctx = canvas.context
  ctx.font = `${String(FONT_SIZE)}px sans-serif`
  ctx.textBaseline = 'alphabetic'
  const occupied = new Uint8Array(canvas.width * canvas.height)
  let overlap = 0
  for (const glyph of value.glyphs) {
    const pose = shouldCoincide ? value.glyphs[0] : glyph
    if (pose === undefined) throw new Error('Expected a glyph pose')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(pose.x - value.bounds.left + padding, pose.y - value.bounds.top + padding)
    ctx.rotate(pose.rotation)
    ctx.fillText(glyph.text, 0, 0)
    ctx.restore()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    overlap += addInk(occupied, pixels)
  }
  return overlap
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

  it.each([-1, 1])(
    'closes the maximum curve into a full ring without overlapping glyphs: %s',
    (direction) => {
      const full = layout(['HHHHHHHHHHHHHHHH'], 0, direction * MAX_CURVE)
      const first = full.glyphs[0]
      const last = full.glyphs.at(-1)
      if (first === undefined || last === undefined) throw new Error('Expected ring endpoints')
      expect(Math.abs(last.rotation - first.rotation)).toBeGreaterThan(Math.PI * 1.8)
      expect(full.width / full.height).toBeCloseTo(1, 1)
      expect(overlappingInk(full)).toBe(0)
      // Deliberately superimposed glyphs must fail the same independent raster check.
      expect(overlappingInk(full, true)).toBeGreaterThan(100)
      const curvedWords = layout(['© Lumafoil 2026', 'CONFIDENTIAL'], 0.15, direction * MAX_CURVE)
      expect(overlappingInk(curvedWords)).toBe(0)
    },
  )
})
