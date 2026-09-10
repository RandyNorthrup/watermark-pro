import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FONT_FAMILY,
  findFont,
  FONT_CATALOGUE,
  FONT_CATEGORIES,
  nearestWeight,
} from './catalogue'

const MINIMUM_FAMILIES = 501

describe('font catalogue', () => {
  it('offers a wide, categorised selection with a sensible default', () => {
    expect(FONT_CATALOGUE.length).toBeGreaterThanOrEqual(MINIMUM_FAMILIES)
    for (const category of FONT_CATEGORIES) {
      expect(FONT_CATALOGUE.filter((font) => font.category === category).length).toBeGreaterThan(1)
    }
    expect(findFont(DEFAULT_FONT_FAMILY)?.isVariable).toBe(true)
    expect(new Set(FONT_CATALOGUE.map((font) => font.family)).size).toBe(FONT_CATALOGUE.length)
    expect(
      new Set(FONT_CATALOGUE.map((font) => font.family.replace(/ Variable$/, '').toLowerCase()))
        .size,
    ).toBe(FONT_CATALOGUE.length)
  })

  it('picks the nearest available weight', () => {
    const lobster = findFont('Lobster')
    expect(lobster).toBeDefined()
    if (lobster !== undefined) {
      expect(nearestWeight(lobster, 700)).toBe(400)
    }
    const inter = findFont('Inter Variable')
    if (inter !== undefined) {
      expect(nearestWeight(inter, 650)).toBe(600)
      expect(nearestWeight(inter, 900)).toBe(800)
    }
  })
})
