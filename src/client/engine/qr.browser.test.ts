/** Independent decoding of real exports, rather than checking the encoder's own matrix. */
import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { applyWatermark } from './pipeline'
import { pixelsOf, splitBitmap } from './test-support/fixtures'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'
import { blankSpec, defaultSpecFor } from '../lib/spec-edit'

const CONTENTS = [
  'https://studio.example/portfolio',
  'https://studio.example/contact?name=Avery',
  'Lumafoil — fotografía 日本語',
]

describe('QR export scanability', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'] as const)(
    'decodes a rotated QR at the default size in %s',
    async (format) => {
      const source = await splitBitmap(1200, 800, '#202020', '#c86b82')
      const base = defaultSpecFor('qr', blankSpec())
      if (base.kind !== 'qr') throw new Error('Expected QR default')
      const spec: WatermarkSpec = {
        ...base,
        content: 'https://studio.example/portfolio',
        placement: { mode: 'anchor', anchor: 'center' },
        style: { ...base.style, rotation: 15 },
      }
      try {
        const result = await applyWatermark(
          { source, marks: [{ spec }], output: { format, quality: 0.9 } },
          offscreenBackend,
        )
        const pixels = await pixelsOf(result.blob)
        expect(jsQR(pixels.data, pixels.width, pixels.height)?.data).toBe(spec.content)
      } finally {
        source.close()
      }
    },
  )
  it.each(CONTENTS)('decodes the exact saved content: %s', async (content) => {
    const source = await splitBitmap(1200, 800, '#202020', '#c86b82')
    try {
      const spec: WatermarkSpec = {
        kind: 'qr',
        content,
        placement: { mode: 'anchor', anchor: 'bottom-right' },
        contrast: { mode: 'auto' },
        style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.35 },
      }
      const result = await applyWatermark(
        { source, marks: [{ spec }], output: { format: 'image/png', quality: 1 } },
        offscreenBackend,
      )
      const pixels = await pixelsOf(result.blob)
      const decoded = jsQR(pixels.data, pixels.width, pixels.height)
      expect(decoded?.data).toBe(content)
      expect(decoded?.data).not.toBe('https://unrelated.example/')
    } finally {
      source.close()
    }
  })

  it('does not report a QR payload in an unmarked image', () => {
    const canvas = new OffscreenCanvas(400, 400)
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('Canvas unavailable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 400, 400)
    const pixels = context.getImageData(0, 0, 400, 400)
    expect(jsQR(pixels.data, pixels.width, pixels.height)).toBeNull()
  })
})
