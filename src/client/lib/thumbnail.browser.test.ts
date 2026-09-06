import { describe, expect, it } from 'vitest'

import { createThumbnail, THUMBNAIL_MAX_SIDE } from './thumbnail'

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
