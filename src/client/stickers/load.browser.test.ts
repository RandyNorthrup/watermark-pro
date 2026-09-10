import { describe, expect, it } from 'vitest'

import { STICKER_CATALOGUE } from './catalogue'
import { loadSticker } from './load'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'
import { offscreenBackend } from '../engine/canvas'
import { applyWatermark } from '../engine/pipeline'
import { pixelsOf, splitBitmap } from '../engine/test-support/fixtures'
import { MarkResources } from '../lib/mark-resources'

describe('real sticker artwork', () => {
  it('decodes every bundled vector in the browser', async () => {
    for (const sticker of STICKER_CATALOGUE) {
      const image = new Image()
      image.src = sticker.url
      await image.decode()
      expect(image.naturalWidth, sticker.id).toBeGreaterThan(0)
      expect(image.naturalHeight, sticker.id).toBeGreaterThan(0)
    }
  }, 30_000)

  it('rejects external or unknown image sources', async () => {
    await expect(loadSticker('https://untrusted.example/a.svg')).rejects.toThrow('Unknown sticker')
  })

  it('renders coloured sticker pixels through the actual export pipeline', async () => {
    const spec: WatermarkSpec = {
      kind: 'symbol',
      symbol: { type: 'sticker', id: 'cherries' },
      placement: { mode: 'anchor', anchor: 'center' },
      contrast: { mode: 'auto' },
      style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.6 },
    }
    const resources = new MarkResources(() =>
      Promise.reject(new Error('Sticker must not request a private logo')),
    )
    const resolved = await resources.resolve([spec])
    const bitmap = resolved.marks[0]?.image
    expect(bitmap?.width).toBe(2048)
    expect(resolved.fonts).toEqual([])
    const source = await splitBitmap(600, 600, '#ffffff', '#ffffff')
    try {
      const exported = await applyWatermark(
        { source, marks: resolved.marks, output: { format: 'image/png', quality: 1 } },
        offscreenBackend,
      )
      const pixels = await pixelsOf(exported.blob)
      let redPixels = 0
      for (let index = 0; index < pixels.data.length; index += 4) {
        if ((pixels.data[index] ?? 0) > (pixels.data[index + 1] ?? 0) * 2) redPixels += 1
      }
      expect(redPixels).toBeGreaterThan(1000)
      expect([...pixels.data.slice(0, 4)]).toEqual([255, 255, 255, 255])
    } finally {
      source.close()
      bitmap?.close()
      resources.clear()
    }
  })
})
