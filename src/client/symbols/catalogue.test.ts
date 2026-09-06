import type { IconNode } from 'lucide'
import { describe, expect, it } from 'vitest'

import { findIcon, GLYPH_GROUPS, ICON_CATALOGUE, iconPath, iconToPath } from './catalogue'

describe('symbol catalogue', () => {
  it('offers glyph groups and a large icon set without duplicates', () => {
    expect(GLYPH_GROUPS.length).toBeGreaterThanOrEqual(6)
    const glyphs = GLYPH_GROUPS.flatMap((group) => group.glyphs)
    expect(glyphs.length).toBeGreaterThan(60)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(ICON_CATALOGUE.length).toBeGreaterThanOrEqual(60)
    expect(new Set(ICON_CATALOGUE.map((icon) => icon.name)).size).toBe(ICON_CATALOGUE.length)
  })

  it('flattens every catalogue icon to a non-empty path', () => {
    for (const icon of ICON_CATALOGUE) {
      const path = iconPath(icon.name)
      expect(path.length).toBeGreaterThan(5)
      expect(path).toMatch(/^[Mm]/)
    }
    expect(findIcon('camera')?.label).toBe('Camera')
    expect(() => iconPath('does-not-exist')).toThrow(/unknown icon/)
  })

  it('converts circles, rectangles, lines and polygons', () => {
    expect(iconToPath([['circle', { cx: '12', cy: '12', r: '2' }]])).toBe(
      'M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    )
    expect(iconToPath([['rect', { x: '1', y: '2', width: '3', height: '4' }]])).toBe('M1 2h3v4h-3Z')
    expect(iconToPath([['line', { x1: '0', y1: '0', x2: '5', y2: '5' }]])).toBe('M0 0L5 5')
    expect(iconToPath([['polygon', { points: '0,0 4,0 2,3' }]])).toBe('M0,0L4,0L2,3Z')
    expect(iconToPath([['polyline', { points: '0,0 4,0' }]])).toBe('M0,0L4,0')
    expect(iconToPath([['ellipse', { cx: '5', cy: '5', rx: '2', ry: '1' }]])).toContain(
      'a2 1 0 1 0 4 0',
    )
    expect(() => iconToPath([['text', {}]] as unknown as IconNode)).toThrow(/unsupported/)
    expect(() => iconToPath([['circle', { cx: 'x', cy: '1', r: '1' }]])).toThrow(TypeError)
  })
})
