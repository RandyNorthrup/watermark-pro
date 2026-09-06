import { describe, expect, it } from 'vitest'

import { chooseContrast, resolveContrast } from './contrast'
import { markSize, meanLuminanceUnder, resolvePlacement, tileCentres } from './layout'
import { anchorCentre, rankPlacements } from './placement'
import { mapFrom } from './test-support/maps'
import { ANCHORS, DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'

/** Deterministic pseudo-noise so "busy" regions are reproducible. */
function noise(x: number, y: number): number {
  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43_758.5453
  return seed - Math.floor(seed)
}

const size = { markWidth: 0.25, markHeight: 0.1, margin: 0.04 }

describe('rankPlacements', () => {
  it('prefers a flat corner over a busy one and is deterministic', () => {
    // Top half is textured noise, bottom half is flat mid-grey.
    const map = mapFrom(64, 48, (x, y) => (y < 24 ? noise(x, y) : 0.5))
    const first = rankPlacements({ map, ...size })
    const second = rankPlacements({ map, ...size })
    expect(first).toEqual(second)
    expect(first[0]?.y).toBeGreaterThan(0.5)
    expect(['bottom-right', 'bottom-left', 'bottom-center', null]).toContain(first[0]?.anchor)
    const top = first.find((candidate) => candidate.anchor === 'top-left')
    const bottom = first.find((candidate) => candidate.anchor === 'bottom-right')
    expect(bottom?.cost).toBeLessThan(top?.cost ?? Infinity)
  })

  it('breaks ties between flat corners by photographer convention', () => {
    const map = mapFrom(64, 64, () => 0.3)
    const [best] = rankPlacements({ map, ...size })
    expect(best?.anchor).toBe('bottom-right')
  })

  it('avoids a bright subject in the centre-right and reports the luminance under the choice', () => {
    const map = mapFrom(64, 64, (x, y) => (x > 32 && y > 16 && y < 56 ? 1 : 0.2))
    const [best] = rankPlacements({ map, ...size })
    expect(best?.x).toBeLessThan(0.5)
    expect(best?.meanLuminance).toBeCloseTo(0.2, 1)
  })

  it('covers all nine anchors plus grid candidates without duplicates', () => {
    const map = mapFrom(32, 32, () => 0.5)
    const ranked = rankPlacements({ map, ...size })
    const anchors = ranked.map((candidate) => candidate.anchor).filter((anchor) => anchor !== null)
    expect(new Set(anchors).size).toBe(ANCHORS.length)
    expect(ranked.length).toBeGreaterThan(ANCHORS.length)
    const keys = ranked.map((candidate) => `${candidate.x.toFixed(4)},${candidate.y.toFixed(4)}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('refuses an empty map', () => {
    expect(() => rankPlacements({ map: mapFrom(0, 0, () => 0), ...size })).toThrow(RangeError)
  })
})

describe('anchorCentre', () => {
  it('keeps the whole mark inside the margins', () => {
    const topLeft = anchorCentre('top-left', 0.2, 0.1, 0.05, 0.05)
    expect(topLeft.x).toBeCloseTo(0.15)
    expect(topLeft.y).toBeCloseTo(0.1)
    const bottomRight = anchorCentre('bottom-right', 0.2, 0.1, 0.05, 0.05)
    expect(bottomRight.x).toBeCloseTo(0.85)
    expect(bottomRight.y).toBeCloseTo(0.9)
    expect(anchorCentre('center', 0.2, 0.1, 0.05, 0.05)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('collapses to the middle when the mark is wider than the image', () => {
    expect(anchorCentre('top-left', 1.2, 0.1, 0.05, 0.05).x).toBeCloseTo(0.5)
  })
})

describe('chooseContrast', () => {
  it('uses light ink on dark regions and dark ink on bright ones', () => {
    expect(chooseContrast(0.1).variant).toBe('light')
    expect(chooseContrast(0.9).variant).toBe('dark')
  })

  it('strengthens the outline as the region approaches the ink luminance', () => {
    const easy = chooseContrast(0.05)
    const hard = chooseContrast(0.45)
    expect(hard.outline).toBeGreaterThan(easy.outline)
    expect(easy.outline).toBeGreaterThan(0)
    expect(hard.outline).toBeLessThanOrEqual(1)
  })

  it('honours a manual override', () => {
    expect(resolveContrast({ mode: 'manual', variant: 'dark', outline: 0.2 }, 0.1)).toEqual({
      variant: 'dark',
      outline: 0.2,
      isAuto: false,
    })
    expect(resolveContrast({ mode: 'auto' }, 0.1).isAuto).toBe(true)
  })
})

const textSpec: WatermarkSpec = {
  kind: 'text',
  text: 'demo',
  fontFamily: 'Inter Variable',
  fontWeight: 600,
  placement: { mode: 'anchor', anchor: 'bottom-right' },
  contrast: { mode: 'auto' },
  style: DEFAULT_STYLE,
}

describe('layout', () => {
  const image = { width: 1000, height: 500 }

  it('sizes the mark from the scale and aspect ratio, capped by the image height', () => {
    expect(markSize(textSpec, image, 4)).toEqual({ width: 220, height: 55 })
    const tall = markSize({ ...textSpec, style: { ...DEFAULT_STYLE, scale: 1 } }, image, 0.5)
    expect(tall.height).toBe(450)
    expect(tall.width).toBe(225)
    expect(() => markSize(textSpec, image, 0)).toThrow(RangeError)
  })

  it('places anchored, custom and smart marks in image pixels', () => {
    const map = mapFrom(100, 50, (x) => (x < 50 ? 0.9 : 0.1))
    const mark = { width: 200, height: 50 }
    const anchored = resolvePlacement(textSpec, image, mark, map)
    expect(anchored.anchor).toBe('bottom-right')
    expect(anchored.centreX).toBeCloseTo(1000 - 20 - 100)
    expect(anchored.centreY).toBeCloseTo(500 - 20 - 25)
    expect(anchored.meanLuminance).toBeCloseTo(0.1, 1)

    const custom = resolvePlacement(
      { ...textSpec, placement: { mode: 'custom', x: 0.01, y: 0.5 } },
      image,
      mark,
      map,
    )
    expect(custom.anchor).toBeNull()
    expect(custom.centreX).toBe(100)
    expect(custom.meanLuminance).toBeCloseTo(0.9, 1)

    const smart = resolvePlacement({ ...textSpec, placement: { mode: 'smart' } }, image, mark, map)
    expect(smart.centreX).toBeGreaterThan(0)
    expect(smart.centreX).toBeLessThan(1000)
  })

  it('reads mean luminance under a region and clamps to the map', () => {
    const map = mapFrom(10, 10, (x) => (x < 5 ? 1 : 0))
    expect(meanLuminanceUnder(map, 0.25, 0.5, 0.5, 1)).toBeCloseTo(1)
    expect(meanLuminanceUnder(map, 0.75, 0.5, 0.5, 1)).toBeCloseTo(0)
    expect(meanLuminanceUnder(map, 5, 5, 0.1, 0.1)).toBe(0)
  })

  it('tiles in a brick pattern that overshoots the edges', () => {
    const centres = tileCentres({ width: 400, height: 200 }, { width: 100, height: 50 }, 1)
    expect(centres.length).toBeGreaterThan(8)
    expect(Math.min(...centres.map((c) => c.x))).toBeLessThan(0)
    expect(Math.max(...centres.map((c) => c.x))).toBeGreaterThan(400)
    const rows = [...new Set(centres.map((c) => c.y))]
    const firstRowXs = centres.filter((c) => c.y === rows[0]).map((c) => c.x)
    const secondRowXs = centres.filter((c) => c.y === rows[1]).map((c) => c.x)
    expect(firstRowXs[0]).not.toBe(secondRowXs[0])
    expect(() => tileCentres(image, { width: 0, height: 10 }, 1)).toThrow(RangeError)
  })
})
