import { memoryUsage } from 'node:process'

import { describe, expect, it } from 'vitest'

import { LOGO_PNG, ROTATED_JPEG_6, ROTATED_JPEG_8 } from './test-support/image-fixtures'
import { readImageUpload } from './uploads'
import {
  HTTP_STATUS,
  MAX_LOGO_BYTES,
  MAX_LOGO_SIDE,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_SIDE,
} from '../shared/constants'

function memory() {
  try {
    return memoryUsage()
  } catch {
    return null
  }
}

describe('actual workerd encoded-image boundary', () => {
  it.each([ROTATED_JPEG_6, ROTATED_JPEG_8])(
    'preserves actual JPEG orientation without FileReader or client dimensions',
    async (bytes) => {
      const image = await readImageUpload(
        new File([bytes], 'rotated.jpg'),
        MAX_LOGO_BYTES,
        MAX_LOGO_SIDE,
        { width: 8, height: 16 },
      )
      expect(image).toMatchObject({ width: 8, height: 16, contentType: 'image/jpeg' })
    },
  )

  it('reads actual near-limit File data without cloning its pixel payload for normal headers', async () => {
    const file = new File(
      [LOGO_PNG, new Uint8Array(MAX_PHOTO_BYTES - LOGO_PNG.byteLength)],
      'near-limit.png',
    )
    const before = memory()
    const started = performance.now()
    const reader = file.stream().getReader()
    const chunk = await reader.read()
    const data: unknown = chunk.value
    if (!(data instanceof Uint8Array)) throw new Error('Native File stream did not produce bytes')
    const firstChunkBytes = data.byteLength
    await reader.cancel()
    const image = await readImageUpload(file, MAX_PHOTO_BYTES, MAX_PHOTO_SIDE, {
      width: 64,
      height: 32,
    })
    expect(image.bytes.byteLength).toBe(MAX_PHOTO_BYTES)
    expect(image).toMatchObject({ width: 64, height: 32, contentType: 'image/png' })
    console.info(
      'IMAGE_NATIVE_LIMIT',
      JSON.stringify({
        bytes: file.size,
        firstChunkBytes,
        wallMilliseconds: performance.now() - started,
        before,
        after: memory(),
      }),
    )
  })

  it('rejects a near-limit malformed JPEG header instead of admitting client dimensions', async () => {
    const bytes = new Uint8Array(MAX_PHOTO_BYTES)
    bytes.set([0xff, 0xd8, 0xff, 0xe0])
    const file = new File([bytes], 'malformed.jpg')
    const started = performance.now()
    await expect(
      readImageUpload(file, MAX_PHOTO_BYTES, MAX_PHOTO_SIDE, { width: 1, height: 1 }),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
    console.info(
      'IMAGE_NATIVE_MALFORMED',
      JSON.stringify({
        bytes: file.size,
        wallMilliseconds: performance.now() - started,
        memory: memory(),
      }),
    )
  })
})
