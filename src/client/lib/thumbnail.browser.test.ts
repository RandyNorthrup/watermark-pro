import { describe, expect, it } from 'vitest'

import { createThumbnail, THUMBNAIL_MAX_SIDE } from './thumbnail'
import { drawStrokes, exportGeometry, strokeBounds } from '../editor/signature'
import { offscreenBackend } from '../engine/canvas'

async function image(width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  ctx.fillStyle = '#3366ff'
  ctx.fillRect(0, 0, width, height)
  return await canvas.convertToBlob({ type: 'image/png' })
}

describe('createThumbnail', () => {
  it('fits the longest side without enlarging small images', async () => {
    const large = await createThumbnail(await image(2000, 1000))
    expect(large.blob.type).toBe('image/jpeg')
    expect(large).toMatchObject({ width: THUMBNAIL_MAX_SIDE, height: THUMBNAIL_MAX_SIDE / 2 })
    const decoded = await createImageBitmap(large.blob)
    expect(decoded.width).toBe(THUMBNAIL_MAX_SIDE)
    decoded.close()

    const small = await createThumbnail(await image(120, 300))
    expect(small).toMatchObject({ width: 120, height: 300 })
    await expect(createThumbnail(new Blob(['nope'], { type: 'text/plain' }))).rejects.toThrow()
  })
})

describe('signature drawing', () => {
  it('renders strokes cropped to the ink as a transparent PNG at logo size', async () => {
    const strokes = [
      {
        width: 4,
        points: [
          { x: 100, y: 50 },
          { x: 300, y: 150 },
        ],
      },
      { width: 10, points: [{ x: 40, y: 200 }] },
    ]
    const bounds = strokeBounds(strokes)
    expect(bounds).not.toBeNull()
    if (bounds === null) {
      return
    }
    const geometry = exportGeometry(bounds)
    const canvas = offscreenBackend.createCanvas(geometry.width, geometry.height)
    canvas.context.translate(geometry.offsetX * geometry.scale, geometry.offsetY * geometry.scale)
    drawStrokes(canvas.context, strokes, geometry.scale)
    const pixels = canvas.context.getImageData(0, 0, geometry.width, geometry.height)
    let inked = 0
    let opaqueCorner = 0
    for (let offset = 3; offset < pixels.data.length; offset += 4) {
      if ((pixels.data[offset] ?? 0) > 0) {
        inked += 1
      }
    }
    // The padding keeps the corners clear; the line and the dot leave ink.
    for (const [x, y] of [
      [0, 0],
      [geometry.width - 1, geometry.height - 1],
    ]) {
      opaqueCorner += pixels.data[((y ?? 0) * geometry.width + (x ?? 0)) * 4 + 3] ?? 0
    }
    expect(opaqueCorner).toBe(0)
    expect(inked).toBeGreaterThan(1000)
    expect(inked).toBeLessThan(geometry.width * geometry.height * 0.2)
    const blob = await canvas.encode({ format: 'image/png', quality: 1 })
    expect(blob.type).toBe('image/png')
  })
})
