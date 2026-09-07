import { describe, expect, it } from 'vitest'

import { adjustPixels, channelLuminance } from './adjust'
import { type Adjustments, IDENTITY_ADJUSTMENTS } from '../../shared/adjustments'

function adjust(overrides: Partial<Adjustments>): Adjustments {
  return { ...IDENTITY_ADJUSTMENTS, ...overrides }
}

/** One 1×1 pixel, adjusted, returned as `[r, g, b, a]`. */
function pixel(rgba: [number, number, number, number], values: Adjustments): number[] {
  const data = new Uint8ClampedArray(rgba)
  adjustPixels(data, 1, 1, values)
  return [...data]
}

describe('adjustPixels', () => {
  it('leaves the bytes untouched for the identity adjustment', () => {
    expect(pixel([12, 34, 56, 200], IDENTITY_ADJUSTMENTS)).toEqual([12, 34, 56, 200])
  })

  it('never touches alpha', () => {
    expect(pixel([100, 100, 100, 123], adjust({ brightness: 0.5 }))[3]).toBe(123)
  })

  it('shifts every channel by brightness', () => {
    // brightness +1 adds 128; 0 -> 128, 200 -> 328 clamped to 255.
    expect(pixel([0, 0, 200, 255], adjust({ brightness: 1 }))).toEqual([128, 128, 255, 255])
  })

  it('flattens to the midpoint at minimum contrast', () => {
    expect(pixel([0, 128, 255, 255], adjust({ contrast: -1 }))).toEqual([128, 128, 128, 255])
  })

  it('greyscales at minimum saturation', () => {
    const luma = Math.round(channelLuminance(200, 100, 50) * 255)
    const [r, g, b] = pixel([200, 100, 50, 255], adjust({ saturation: -1 }))
    expect(r).toBe(luma)
    expect(g).toBe(luma)
    expect(b).toBe(luma)
  })

  it('warms red up and blue down', () => {
    // warmth +1 adds 20 to red and removes 20 from blue.
    expect(pixel([100, 100, 100, 255], adjust({ warmth: 1 }))).toEqual([120, 100, 80, 255])
  })

  it('sepia-tones pure white to the documented triple', () => {
    // R' = 1.351*255 -> 255, G' = 1.203*255 -> 255, B' = 0.937*255 -> 239.
    expect(pixel([255, 255, 255, 255], adjust({ sepia: 1 }))).toEqual([255, 255, 239, 255])
  })

  it('darkens the corners more than the centre under a vignette', () => {
    const width = 9
    const height = 9
    const data = new Uint8ClampedArray(width * height * 4).fill(200)
    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255
    }
    adjustPixels(data, width, height, adjust({ vignette: 1 }))
    const centre = data[(4 * width + 4) * 4] ?? 0
    const corner = data[0] ?? 0
    expect(centre).toBe(200)
    expect(corner).toBeLessThan(centre)
  })
})
