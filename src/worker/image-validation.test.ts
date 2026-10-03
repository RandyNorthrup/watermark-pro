import { describe, expect, it } from 'vitest'

import {
  AVIF_IMAGE,
  EXTENDED_WEBP,
  GIF_IMAGE,
  LOGO_PNG,
  LOGO_WEBP,
  LOSSLESS_WEBP,
  OVERSIZED_PNG,
  OVERSIZED_THUMBNAIL_PNG,
  PROGRESSIVE_JPEG,
  ROTATED_JPEG_6,
  ROTATED_JPEG_8,
  THUMBNAIL_JPEG,
} from './test-support/image-fixtures'
import { readImageUpload } from './uploads'
import {
  HTTP_STATUS,
  MAX_LOGO_BYTES,
  MAX_LOGO_SIDE,
  MAX_THUMBNAIL_BYTES,
  THUMBNAIL_MAX_SIDE,
} from '../shared/constants'

describe('encoded stored-image admission', () => {
  it.each([
    ['PNG', LOGO_PNG, 'image/png'],
    ['progressive JPEG', PROGRESSIVE_JPEG, 'image/jpeg'],
    ['lossy WebP', LOGO_WEBP, 'image/webp'],
    ['lossless WebP', LOSSLESS_WEBP, 'image/webp'],
    ['extended WebP', EXTENDED_WEBP, 'image/webp'],
  ] as const)('derives %s size and MIME from encoder-produced bytes', async (_, bytes, mime) => {
    const file = new File([bytes], 'declared-as-text.bin', { type: 'text/plain' })
    const image = await readImageUpload(file, MAX_LOGO_BYTES, MAX_LOGO_SIDE, {
      width: 64,
      height: 32,
    })
    expect(image).toMatchObject({ width: 64, height: 32, contentType: mime })
    expect(new Uint8Array(image.bytes)).toEqual(bytes)
  })

  it.each([ROTATED_JPEG_6, ROTATED_JPEG_8])('retains genuine EXIF display axes', async (bytes) => {
    const image = await readImageUpload(
      new File([bytes], 'rotated.jpg'),
      MAX_LOGO_BYTES,
      MAX_LOGO_SIDE,
      {
        width: 8,
        height: 16,
      },
    )
    expect(image).toMatchObject({ width: 8, height: 16, contentType: 'image/jpeg' })
    await expect(
      readImageUpload(new File([bytes], 'rotated.jpg'), MAX_LOGO_BYTES, MAX_LOGO_SIDE, {
        width: 16,
        height: 8,
      }),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
  })

  it('rejects a wrong claim on a valid image and oversized actual dimensions with a small claim', async () => {
    await expect(
      readImageUpload(new File([LOGO_PNG], 'valid.png'), MAX_LOGO_BYTES, MAX_LOGO_SIDE, {
        width: 1,
        height: 1,
      }),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
    await expect(
      readImageUpload(new File([OVERSIZED_PNG], 'wide.png'), MAX_LOGO_BYTES, MAX_LOGO_SIDE, {
        width: 1,
        height: 1,
      }),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
  })

  it.each([8, 12, 20, 23])(
    'rejects a PNG truncated before complete dimension fields at %i bytes',
    async (length) => {
      const file = new File([LOGO_PNG.slice(0, length)], 'truncated.png')
      await expect(readImageUpload(file, MAX_LOGO_BYTES, MAX_LOGO_SIDE)).rejects.toMatchObject({
        status: HTTP_STATUS.badRequest,
      })
    },
  )

  it('rejects malformed header fields and zero dimensions', async () => {
    const malformed = new Uint8Array(LOGO_PNG)
    malformed[12] = 0
    await expect(
      readImageUpload(new File([malformed], 'bad.png'), MAX_LOGO_BYTES, MAX_LOGO_SIDE),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
    const zero = new Uint8Array(LOGO_PNG)
    new DataView(zero.buffer).setUint32(16, 0)
    await expect(
      readImageUpload(new File([zero], 'zero.png'), MAX_LOGO_BYTES, MAX_LOGO_SIDE),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
  })

  it.each([GIF_IMAGE, AVIF_IMAGE])(
    'retains stored-format restrictions despite a forged PNG MIME',
    async (bytes) => {
      await expect(
        readImageUpload(
          new File([bytes], 'forged.png', { type: 'image/png' }),
          MAX_LOGO_BYTES,
          MAX_LOGO_SIDE,
        ),
      ).rejects.toMatchObject({ status: HTTP_STATUS.unsupportedMediaType })
    },
  )

  it('checks actual byte limits and thumbnail side limits independently', async () => {
    const big = new Uint8Array(MAX_THUMBNAIL_BYTES + 1)
    big.set(THUMBNAIL_JPEG)
    await expect(
      readImageUpload(new File([big], 'large.jpg'), MAX_THUMBNAIL_BYTES, THUMBNAIL_MAX_SIDE),
    ).rejects.toMatchObject({ status: HTTP_STATUS.payloadTooLarge })
    const valid = await readImageUpload(
      new File([THUMBNAIL_JPEG], 'thumbnail.jpg'),
      MAX_THUMBNAIL_BYTES,
      THUMBNAIL_MAX_SIDE,
    )
    expect(valid).toMatchObject({ width: 400, height: 300 })
    await expect(
      readImageUpload(
        new File([OVERSIZED_THUMBNAIL_PNG], 'not-a-thumbnail.png'),
        MAX_THUMBNAIL_BYTES,
        THUMBNAIL_MAX_SIDE,
      ),
    ).rejects.toMatchObject({ status: HTTP_STATUS.badRequest })
  })
})
