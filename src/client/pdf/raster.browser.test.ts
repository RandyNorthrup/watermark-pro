/**
 * Runs in Chromium: `raster.ts` draws on an `OffscreenCanvas`, which jsdom
 * cannot provide. Proves a mark paints pixels on the otherwise transparent
 * page canvas and that the page size (points) scales to the raster size
 * (pixels) at the raster dpi. The smart-placement fallback is unit-tested in
 * `raster-layout.test.ts`; here it is exercised end to end.
 */
import { describe, expect, it, vi } from 'vitest'

import { DocumentRasteriser } from './raster'
import { type PageSize, pixelDimensions } from './raster-layout'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'

/** US Letter, in points. */
const LETTER: PageSize = { width: 612, height: 792 }

const NO_LOGOS = () => Promise.reject(new Error('this test uses no logos'))

/** A solid filled square, centred, so it paints an unmistakable block of pixels. */
const FILLED_SQUARE: WatermarkSpec = {
  kind: 'shape',
  shape: 'rectangle',
  aspect: 1,
  fill: { enabled: true, colour: '#6d4de6', opacity: 1 },
  stroke: { width: 0, colour: null },
  placement: { mode: 'anchor', anchor: 'center' },
  contrast: { mode: 'auto' },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.5 },
}

/** A smart-placed mark; over a blank page it must fall back to bottom-right. */
const SMART_SQUARE: WatermarkSpec = {
  kind: 'shape',
  shape: 'rectangle',
  aspect: 1,
  fill: { enabled: true, colour: '#6d4de6', opacity: 1 },
  stroke: { width: 0, colour: null },
  placement: { mode: 'smart' },
  contrast: { mode: 'auto' },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.3 },
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function decode(bytes: Uint8Array): Promise<ImageData> {
  // The cast bridges TS 6's narrower lib.dom BlobPart; a Uint8Array is one at runtime.
  const bitmap = await createImageBitmap(new Blob([bytes] as BlobPart[], { type: 'image/png' }))
  // Decode independently with DOM canvas so this oracle also works while the
  // capability test removes OffscreenCanvas from the browser under test.
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  ctx.drawImage(bitmap, 0, 0)
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return image
}

/** Pixels inside `rect` whose alpha is above zero. */
function opaqueCount(image: ImageData, rect: Rect): number {
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
        count += 1
      }
    }
  }
  return count
}

describe('DocumentRasteriser', () => {
  it.each(['offscreen', 'DOM'] as const)(
    'paints a real transparent mark at the correct scale with the %s canvas backend',
    async (backend) => {
      if (backend === 'DOM') vi.stubGlobal('OffscreenCanvas', undefined)
      const rasteriser = new DocumentRasteriser(NO_LOGOS)
      try {
        await rasteriser.prepare([FILLED_SQUARE])
        const png = await rasteriser.rasterise(LETTER)
        const image = await decode(png)
        // 612 × 792 pt at 150 dpi is 1275 × 1650 px.
        const expected = pixelDimensions(LETTER)
        expect({ width: image.width, height: image.height }).toEqual(expected)
        expect(expected).toEqual({ width: 1275, height: 1650 })
        const painted = opaqueCount(image, { x: 0, y: 0, width: image.width, height: image.height })
        expect(painted).toBeGreaterThan(0)
        // Empty output and opaque page fills fail different controls.
        expect(painted).toBeLessThan(image.width * image.height)
        expect(opaqueCount(image, { x: 0, y: 0, width: 100, height: 100 })).toBe(0)
        const centre =
          (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4
        expect([...image.data.slice(centre, centre + 4)]).toEqual([109, 77, 230, 255])
      } finally {
        rasteriser.close()
        vi.unstubAllGlobals()
      }
    },
  )

  it('falls a smart mark back to the bottom-right corner', async () => {
    const rasteriser = new DocumentRasteriser(NO_LOGOS)
    await rasteriser.prepare([SMART_SQUARE])
    const png = await rasteriser.rasterise(LETTER)
    rasteriser.close()

    const image = await decode(png)
    const halfWidth = Math.floor(image.width / 2)
    const halfHeight = Math.floor(image.height / 2)
    const bottomRight = opaqueCount(image, {
      x: halfWidth,
      y: halfHeight,
      width: image.width - halfWidth,
      height: image.height - halfHeight,
    })
    const topLeft = opaqueCount(image, { x: 0, y: 0, width: halfWidth, height: halfHeight })
    expect(bottomRight).toBeGreaterThan(0)
    expect(topLeft).toBe(0)
  })
})
