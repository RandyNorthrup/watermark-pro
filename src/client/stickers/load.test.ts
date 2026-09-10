import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadSticker } from './load'

afterEach(() => vi.unstubAllGlobals())

describe('sticker resource boundaries', () => {
  it('loads only the catalogue URL and creates a fresh export-size bitmap', async () => {
    const decode = vi.fn(() => Promise.resolve())
    const drawImage = vi.fn()
    const bitmap = { width: 2048, height: 2048 }
    const transfer = vi.fn(() => bitmap)
    const images: { src: string }[] = []
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decode = decode
        constructor() {
          images.push(this)
        }
      },
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = () => ({ drawImage })
        transferToImageBitmap = transfer
      },
    )
    expect(await loadSticker('camera')).toBe(bitmap)
    expect(images[0]?.src).toMatch(/^\/stickers\/camera-[\da-f]{12}\.svg$/)
    expect(drawImage).toHaveBeenCalledWith(images[0], 0, 0, 2048, 2048)
    expect(transfer).toHaveBeenCalledOnce()
    await expect(loadSticker('../account/photo')).rejects.toThrow('Unknown sticker')
    expect(images).toHaveLength(1)
  })

  it('surfaces unavailable canvas and image decode failures', async () => {
    const decode = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decode = decode
      },
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = () => null
      },
    )
    await expect(loadSticker('camera')).rejects.toThrow('Sticker rendering is unavailable')
    decode.mockRejectedValueOnce(new Error('Invalid image bytes'))
    await expect(loadSticker('camera')).rejects.toThrow('Invalid image bytes')
  })
})
