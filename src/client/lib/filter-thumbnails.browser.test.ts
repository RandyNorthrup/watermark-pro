import { describe, expect, it } from 'vitest'

import { renderFilterThumbnails } from './filter-thumbnails'
import { FILTER_IDS } from '../../shared/adjustments'
import { offscreenBackend } from '../engine/canvas'
import { colourAt, pixelsOf, splitBitmap } from '../engine/test-support/fixtures'

describe('renderFilterThumbnails', () => {
  it('renders one thumbnail per filter and greyscales the Mono one', async () => {
    const source = await splitBitmap(200, 120, '#c02020', '#2040c0')
    const thumbnails = await renderFilterThumbnails(source, offscreenBackend)
    try {
      expect(thumbnails.size).toBe(FILTER_IDS.length)
      for (const id of FILTER_IDS) {
        expect(thumbnails.has(id)).toBe(true)
      }

      const monoUrl = thumbnails.get('mono')
      expect(monoUrl).toBeDefined()
      const response = await fetch(monoUrl ?? '')
      const pixels = await pixelsOf(await response.blob())
      const [r, g, b] = colourAt(
        pixels,
        Math.floor(pixels.width / 2),
        Math.floor(pixels.height / 2),
      )
      expect(Math.abs(r - g)).toBeLessThanOrEqual(3)
      expect(Math.abs(g - b)).toBeLessThanOrEqual(3)
    } finally {
      for (const url of thumbnails.values()) {
        URL.revokeObjectURL(url)
      }
    }
  })
})
