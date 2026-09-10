/**
 * Runs in Chromium: proves the invisible mark survives a real lossless PNG
 * round-trip (encode -> decode -> read) and is destroyed by a lossy JPEG
 * re-encode (the honesty proof). jsdom has no canvas encoder, so this cannot
 * live in the unit project.
 */
import { describe, expect, it } from 'vitest'

import { embedInvisibleMark, readInvisibleMark } from './invisible'
import { pixelsOf } from './test-support/fixtures'

const OPAQUE = 255
const MESSAGE = '© 2026 Randy — Lumafoil'

/** An opaque canvas carrying a gradient with the mark embedded in its pixels. */
function markedCanvas(width: number, height: number, message: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('no 2d context')
  }
  const image = context.createImageData(width, height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4
    image.data[offset] = pixel % 256
    image.data[offset + 1] = (pixel * 3) % 256
    image.data[offset + 2] = (pixel * 7) % 256
    image.data[offset + 3] = OPAQUE
  }
  embedInvisibleMark(image.data, width, height, message)
  context.putImageData(image, 0, 0)
  return canvas
}

describe('invisible mark through a real canvas', () => {
  it('survives a lossless PNG encode and decode', async () => {
    const width = 128
    const height = 96
    const canvas = markedCanvas(width, height, MESSAGE)
    const png = await canvas.convertToBlob({ type: 'image/png' })
    const pixels = await pixelsOf(png)
    expect(readInvisibleMark(pixels.data, pixels.width, pixels.height)).toBe(MESSAGE)
  })

  it('does not survive a lossy JPEG re-encode (honesty proof)', async () => {
    const width = 128
    const height = 96
    const canvas = markedCanvas(width, height, MESSAGE)
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    const pixels = await pixelsOf(jpeg)
    expect(readInvisibleMark(pixels.data, pixels.width, pixels.height)).toBeNull()
  })
})
