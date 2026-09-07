import { describe, expect, it } from 'vitest'

import { alphaBounds, type PixelBuffer, removeBackground, trimTransparent } from './logo-cleanup'

const CHANNELS = 4

type Rgba = [number, number, number, number]

/** Builds a buffer by painting each pixel from `(x, y)`. */
function makeBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * CHANNELS)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * CHANNELS
      const [red, green, blue, alpha] = paint(x, y)
      data[offset] = red
      data[offset + 1] = green
      data[offset + 2] = blue
      data[offset + 3] = alpha
    }
  }
  return { data, width, height }
}

function alphaAt(image: PixelBuffer, x: number, y: number): number {
  return image.data[(y * image.width + x) * CHANNELS + CHANNELS - 1] ?? 0
}

function rgbaAt(image: PixelBuffer, x: number, y: number): number[] {
  const offset = (y * image.width + x) * CHANNELS
  return [...image.data.slice(offset, offset + CHANNELS)]
}

const WHITE: Rgba = [255, 255, 255, 255]
const RED: Rgba = [200, 30, 30, 255]

/** The centred 3x3 square (columns/rows 2..4) of a 7x7 field. */
function isInSquare(x: number, y: number): boolean {
  return x >= 2 && x <= 4 && y >= 2 && y <= 4
}

/** The 2x2 opaque block (columns/rows 1..2) of a 5x5 field. */
function isOpaque(x: number, y: number): boolean {
  return x >= 1 && x <= 2 && y >= 1 && y <= 2
}

/** A position-dependent colour, so a crop can prove which pixels it kept. */
function colourAt(x: number, y: number): Rgba {
  return [x * 10, y * 10, 40, 255]
}

/** A 7x7 white field with a solid red 3x3 square at columns/rows 2..4. */
function whiteFieldWithRedSquare(): PixelBuffer {
  return makeBuffer(7, 7, (x, y) => (isInSquare(x, y) ? RED : WHITE))
}

describe('removeBackground', () => {
  it('clears a white frame around a coloured square to transparent', () => {
    const image = whiteFieldWithRedSquare()
    const result = removeBackground(image)
    // The outer frame, far from the square, is fully transparent.
    for (const [x, y] of [
      [0, 0],
      [6, 6],
      [3, 0],
      [3, 6],
      [0, 3],
      [6, 3],
    ] as const) {
      expect(alphaAt(result, x, y)).toBe(0)
    }
    // The square is untouched: opaque and the same colour.
    expect(alphaAt(result, 3, 3)).toBe(255)
    expect(rgbaAt(result, 3, 3)).toEqual([...RED])
  })

  it('does not mutate the input buffer', () => {
    const image = whiteFieldWithRedSquare()
    const before = [...image.data]
    const result = removeBackground(image)
    expect(result.data).not.toBe(image.data)
    expect([...image.data]).toEqual(before)
  })

  it('leaves a one-pixel feather ring at half alpha', () => {
    const result = removeBackground(whiteFieldWithRedSquare())
    // Background pixels touching the square keep a half-opaque feather...
    expect(alphaAt(result, 2, 1)).toBe(128)
    expect(alphaAt(result, 1, 1)).toBe(128)
    // ...while their neighbours one pixel further out are fully cleared.
    expect(alphaAt(result, 2, 0)).toBe(0)
    expect(alphaAt(result, 0, 0)).toBe(0)
  })

  it('clears a non-white background colour', () => {
    const blue: Rgba = [20, 40, 180, 255]
    const yellow: Rgba = [240, 220, 20, 255]
    const image = makeBuffer(7, 7, (x, y) => (isInSquare(x, y) ? yellow : blue))
    const result = removeBackground(image)
    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 3, 3)).toBe(255)
    expect(rgbaAt(result, 3, 3)).toEqual([...yellow])
  })

  it('follows the tolerance: tight keeps a near-white ring, loose clears it', () => {
    // Corners white, mid-edges near-white grey (distance ~17 from white), the
    // centre a saturated red the flood never reaches.
    const grey: Rgba = [245, 245, 245, 255]
    const centreRed: Rgba = [200, 0, 0, 255]
    const paint = (x: number, y: number): Rgba => {
      if (x === 1 && y === 1) {
        return centreRed
      }
      const isCorner = (x === 0 || x === 2) && (y === 0 || y === 2)
      return isCorner ? WHITE : grey
    }
    const image = makeBuffer(3, 3, paint)
    // tolerance 4: the grey edge is beyond reach and stays fully opaque.
    expect(alphaAt(removeBackground(image, 4), 1, 0)).toBe(255)
    // tolerance 24: the grey edge is within reach, cleared, and (touching the
    // kept centre) left at the feather alpha.
    expect(alphaAt(removeBackground(image, 24), 1, 0)).toBe(128)
  })

  it('returns an empty buffer for an empty image without throwing', () => {
    const result = removeBackground({ data: new Uint8ClampedArray(0), width: 0, height: 0 })
    expect(result).toEqual({ data: new Uint8ClampedArray(0), width: 0, height: 0 })
  })
})

describe('alphaBounds', () => {
  it('bounds the visible pixels, ignoring transparent margins', () => {
    const image = makeBuffer(5, 5, (x, y) => (isOpaque(x, y) ? [10, 20, 30, 255] : [0, 0, 0, 0]))
    expect(alphaBounds(image)).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('treats alpha at the trim threshold as empty and just above it as present', () => {
    const atThreshold = makeBuffer(1, 1, () => [0, 0, 0, 8])
    expect(alphaBounds(atThreshold)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    const aboveThreshold = makeBuffer(1, 1, () => [0, 0, 0, 9])
    expect(alphaBounds(aboveThreshold)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('returns a zero-size box for an all-transparent image', () => {
    const image = makeBuffer(3, 3, () => [255, 255, 255, 0])
    expect(alphaBounds(image)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('returns a zero-size box for an empty image', () => {
    expect(alphaBounds({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })
  })
})

describe('trimTransparent', () => {
  it('crops away the empty margins around the visible pixels', () => {
    const image = makeBuffer(5, 5, (x, y) => (isOpaque(x, y) ? colourAt(x, y) : [0, 0, 0, 0]))
    const before = [...image.data]

    const result = trimTransparent(image)

    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    // Top-left of the crop is the (1, 1) pixel of the source.
    expect(rgbaAt(result, 0, 0)).toEqual([...colourAt(1, 1)])
    expect(rgbaAt(result, 1, 1)).toEqual([...colourAt(2, 2)])
    // The source is left untouched.
    expect([...image.data]).toEqual(before)
  })

  it('returns a zero-size buffer for an all-transparent image', () => {
    const image = makeBuffer(3, 3, () => [255, 255, 255, 0])
    expect(trimTransparent(image)).toEqual({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })
  })

  it('returns a zero-size buffer for an empty image', () => {
    expect(trimTransparent({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })
  })
})
