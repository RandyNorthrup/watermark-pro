import { afterEach, describe, expect, it, vi } from 'vitest'

import { InvisibleReadError, readInvisibleFromFile } from './read-invisible'
import { embedInvisibleMark } from '../engine/invisible'

const WIDTH = 128
const HEIGHT = 96
const NOTICE = 'Private ownership test — العربية'

async function png(mark: string | null): Promise<Blob> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Browser fixture needs a canvas')
  context.fillStyle = '#c86b82'
  context.fillRect(0, 0, WIDTH, HEIGHT)
  if (mark !== null) {
    const pixels = context.getImageData(0, 0, WIDTH, HEIGHT)
    embedInvisibleMark(pixels.data, WIDTH, HEIGHT, mark)
    context.putImageData(pixels, 0, 0)
  }
  return await canvas.convertToBlob({ type: 'image/png' })
}

afterEach(() => vi.restoreAllMocks())

describe('actual image-file invisible reader', () => {
  it('reads a real encoded PNG and keeps an unmarked image distinct', async () => {
    const marked = await png(NOTICE)
    const unmarked = await png(null)
    expect(await readInvisibleFromFile(marked)).toBe(NOTICE)
    expect(await readInvisibleFromFile(unmarked)).toBeNull()
  })

  it('rejects unreadable image bytes instead of reporting that no mark exists', async () => {
    await expect(
      readInvisibleFromFile(new Blob(['not a PNG'], { type: 'image/png' })),
    ).rejects.toThrow()
  })

  it('reports unavailable Canvas2D as a typed failure and closes the decoded bitmap', async () => {
    const image = await png(NOTICE)
    const close = vi.spyOn(ImageBitmap.prototype, 'close')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(readInvisibleFromFile(image)).rejects.toBeInstanceOf(InvisibleReadError)
    expect(close).toHaveBeenCalledOnce()
  })
})
