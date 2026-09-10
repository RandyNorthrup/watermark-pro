import { describe, expect, it } from 'vitest'

import { withAssetNotice } from './asset-notice'
import { jpegSegments, pngChunks } from './segments'
import { FLUENT_STICKER_NOTICE } from '../../../shared/asset-licenses'
import { offscreenBackend } from '../canvas'
import { pixelsOf, splitBitmap } from '../test-support/fixtures'

describe('portable sticker license notices', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'] as const)(
    'preserves readable %s pixels while retaining the full sticker-only licence',
    async (format) => {
      const source = await splitBitmap(320, 180, '#c86b82', '#293d34')
      const canvas = offscreenBackend.createCanvas(320, 180)
      canvas.context.drawImage(source, 0, 0)
      const original = await canvas.encode({ format, quality: 0.9 })
      const result = await withAssetNotice(original, format, FLUENT_STICKER_NOTICE, {
        width: 320,
        height: 180,
      })
      const before = await pixelsOf(original)
      const after = await pixelsOf(result)
      expect(after.width).toBe(320)
      expect(after.height).toBe(180)
      expect(after.data).toEqual(before.data)
      const bytes = new Uint8Array(await result.arrayBuffer())
      expect(new TextDecoder().decode(bytes)).toContain('Copyright (c) Microsoft Corporation.')
      expect(new TextDecoder().decode(bytes)).toContain('does not claim any rights')
      if (format === 'image/png')
        expect(pngChunks(bytes).some((chunk) => chunk.type === 'iTXt')).toBe(true)
      else if (format === 'image/jpeg')
        expect(jpegSegments(bytes).some((segment) => segment.marker === 0xff_fe)).toBe(true)
      else {
        const container = new TextDecoder().decode(bytes)
        const start = container.indexOf('<x:xmpmeta')
        const end = container.indexOf('</x:xmpmeta>') + '</x:xmpmeta>'.length
        const xml = new DOMParser().parseFromString(container.slice(start, end), 'application/xml')
        expect(xml.querySelectorAll(':scope parsererror')).toHaveLength(0)
        expect(
          xml.getElementsByTagNameNS('https://lumafoil.com/ns/assets/1.0/', 'ArtworkLicense')[0]
            ?.textContent,
        ).toBe(FLUENT_STICKER_NOTICE)
      }
      source.close()
    },
  )

  it('preserves WebP alpha and keeps non-sticker exports unchanged', async () => {
    const canvas = offscreenBackend.createCanvas(64, 64)
    canvas.context.fillStyle = '#c86b82'
    canvas.context.fillRect(20, 20, 24, 24)
    const original = await canvas.encode({ format: 'image/webp', quality: 1 })
    expect(await withAssetNotice(original, 'image/webp', null, { width: 64, height: 64 })).toBe(
      original,
    )
    const result = await withAssetNotice(original, 'image/webp', FLUENT_STICKER_NOTICE, {
      width: 64,
      height: 64,
    })
    const after = await pixelsOf(result)
    const before = await pixelsOf(original)
    expect(after.data).toEqual(before.data)
  })
})
