import { describe, expect, it } from 'vitest'

import { analysePixels } from './pipeline'

/** A flat RGBA image of one grey level, as the pure `analysePixels` reads it. */
function greyImage(width: number, height: number, level: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = level
    data[index + 1] = level
    data[index + 2] = level
    data[index + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' }
}

describe('analysePixels', () => {
  it('returns the image at its own size when it is already small enough', () => {
    const map = analysePixels(greyImage(4, 3, 255))
    expect(map.width).toBe(4)
    expect(map.height).toBe(3)
    expect(map.values[0]).toBeCloseTo(1, 5)
  })

  it('box-averages a larger image down to the analysis resolution', () => {
    const map = analysePixels(greyImage(1024, 4, 128))
    expect(map.width).toBe(256)
    expect(map.height).toBe(1)
    for (const value of map.values) {
      expect(value).toBeCloseTo(128 / 255, 5)
    }
  })
})
