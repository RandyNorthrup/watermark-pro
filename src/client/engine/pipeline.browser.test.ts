import { describe, expect, it } from 'vitest'

import { EncodeError, encodeCanvas } from './encode'
import { analyseCanvas, applyWatermark, createCanvas, prepareCanvas } from './pipeline'
import { measureAspect } from './render'
import { countChanged, pixelsOf, splitBitmap } from './test-support/fixtures'
import { WatermarkWorker } from './worker-client'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'

const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]

const textSpec: WatermarkSpec = {
  kind: 'text',
  text: 'PROOF',
  fontFamily: 'sans-serif',
  fontWeight: 700,
  placement: { mode: 'anchor', anchor: 'bottom-right' },
  contrast: { mode: 'auto' },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.3 },
}

const ICON_CHECK = 'M20 6 9 17l-5-5'

describe('applyWatermark', () => {
  it('draws dark text on a bright region and leaves the rest untouched', async () => {
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const result = await applyWatermark({
      source,
      mark: { spec: textSpec },
      output: { format: 'image/png', quality: 1 },
    })
    expect(result.blob.type).toBe('image/png')
    expect(result.width).toBe(400)
    expect(result.contrast.variant).toBe('dark')
    expect(result.placement.anchor).toBe('bottom-right')

    const pixels = await pixelsOf(result.blob)
    const markBox = { x: 250, y: 150, width: 150, height: 50 }
    const farAway = { x: 0, y: 0, width: 150, height: 80 }
    expect(countChanged(pixels, markBox, WHITE)).toBeGreaterThan(200)
    expect(countChanged(pixels, farAway, WHITE)).toBe(0)
  })

  it('switches to light ink on a dark region', async () => {
    const source = await splitBitmap(400, 200, '#000000', '#000000')
    const result = await applyWatermark({
      source,
      mark: { spec: textSpec },
      output: { format: 'image/jpeg', quality: 0.9 },
    })
    expect(result.blob.type).toBe('image/jpeg')
    expect(result.contrast.variant).toBe('light')
    const pixels = await pixelsOf(result.blob)
    expect(
      countChanged(pixels, { x: 250, y: 150, width: 150, height: 50 }, BLACK, 60),
    ).toBeGreaterThan(200)
  })

  it('places a smart mark on the flat half rather than the busy half', async () => {
    const canvas = createCanvas(400, 200)
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('no 2d context')
    }
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, 400, 200)
    // Busy checkerboard on the left half.
    for (let y = 0; y < 200; y += 8) {
      for (let x = 0; x < 200; x += 8) {
        ctx.fillStyle = (x / 8 + y / 8) % 2 === 0 ? '#000000' : '#ffffff'
        ctx.fillRect(x, y, 8, 8)
      }
    }
    const source = await createImageBitmap(canvas)
    const result = await applyWatermark({
      source,
      mark: { spec: { ...textSpec, placement: { mode: 'smart' } } },
      output: { format: 'image/png', quality: 1 },
    })
    expect(result.placement.centreX).toBeGreaterThan(200)
  })

  it('crops and resizes before marking', async () => {
    const source = await splitBitmap(400, 200, '#ff0000', '#0000ff')
    const result = await applyWatermark({
      source,
      mark: { spec: textSpec },
      output: { format: 'image/png', quality: 1 },
      transform: {
        crop: { x: 200, y: 0, width: 200, height: 200 },
        resize: { width: 100, height: 100 },
      },
    })
    expect(result.width).toBe(100)
    expect(result.height).toBe(100)
    const pixels = await pixelsOf(result.blob)
    // Top-left of the output comes from the blue half of the source.
    expect(pixels.data[2]).toBeGreaterThan(200)
    expect(pixels.data[0]).toBeLessThan(40)
  })

  it('tiles across the whole image', async () => {
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const result = await applyWatermark({
      source,
      mark: {
        spec: {
          ...textSpec,
          style: {
            ...textSpec.style,
            scale: 0.15,
            tiling: { enabled: true, spacing: 0.5 },
            rotation: 30,
          },
        },
      },
      output: { format: 'image/png', quality: 1 },
    })
    const pixels = await pixelsOf(result.blob)
    expect(countChanged(pixels, { x: 0, y: 0, width: 200, height: 100 }, WHITE)).toBeGreaterThan(50)
    expect(
      countChanged(pixels, { x: 200, y: 100, width: 200, height: 100 }, WHITE),
    ).toBeGreaterThan(50)
  })

  it('renders icon symbols and image marks', async () => {
    const source = await splitBitmap(300, 300, '#ffffff', '#ffffff')
    const icon = await applyWatermark({
      source,
      mark: {
        spec: {
          ...textSpec,
          kind: 'symbol',
          symbol: { type: 'icon', name: 'check' },
          placement: { mode: 'anchor', anchor: 'center' },
        },
        iconPath: ICON_CHECK,
      },
      output: { format: 'image/png', quality: 1 },
    })
    const iconPixels = await pixelsOf(icon.blob)
    expect(
      countChanged(iconPixels, { x: 100, y: 100, width: 100, height: 100 }, WHITE),
    ).toBeGreaterThan(100)

    const logo = await splitBitmap(40, 20, '#00ff00', '#00ff00')
    const withLogo = await applyWatermark({
      source: await splitBitmap(300, 300, '#ffffff', '#ffffff'),
      mark: {
        spec: {
          ...textSpec,
          kind: 'image',
          assetId: 'logo',
          placement: { mode: 'anchor', anchor: 'top-left' },
          style: { ...textSpec.style, scale: 0.4 },
        },
        image: logo,
      },
      output: { format: 'image/webp', quality: 0.8 },
    })
    expect(withLogo.blob.type).toBe('image/webp')
    const logoPixels = await pixelsOf(withLogo.blob)
    expect(
      countChanged(logoPixels, { x: 15, y: 15, width: 100, height: 40 }, WHITE),
    ).toBeGreaterThan(1000)
  })

  it('rejects impossible requests clearly', async () => {
    const source = await splitBitmap(50, 50, '#ffffff', '#ffffff')
    await expect(
      applyWatermark({
        source,
        mark: { spec: { ...textSpec, kind: 'image', assetId: 'missing' } },
        output: { format: 'image/png', quality: 1 },
      }),
    ).rejects.toThrow(/resolved bitmap/)
    expect(() => prepareCanvas(source, { crop: { x: 0, y: 0, width: 0, height: 10 } })).toThrow(
      RangeError,
    )
    await expect(
      encodeCanvas(createCanvas(10, 10), { format: 'image/png', quality: 2 }),
    ).rejects.toThrow(RangeError)
    const glyphMark = {
      spec: {
        ...textSpec,
        kind: 'symbol' as const,
        symbol: { type: 'glyph' as const, glyph: '©', fontFamily: 'serif' },
      },
    }
    const ctx = createCanvas(10, 10).getContext('2d')
    expect(ctx).not.toBeNull()
    if (ctx !== null) {
      expect(measureAspect(ctx, glyphMark)).toBeGreaterThan(0)
    }
  })

  it('analyses at reduced resolution', async () => {
    const canvas = prepareCanvas(await splitBitmap(2000, 1000, '#ffffff', '#000000'), undefined)
    const map = analyseCanvas(canvas)
    expect(map.width).toBe(256)
    expect(map.height).toBe(128)
    expect(map.values[0]).toBeCloseTo(1, 1)
    expect(map.values[255]).toBeCloseTo(0, 1)
  })

  it('surfaces unsupported encoders as EncodeError', () => {
    expect(new EncodeError('x')).toBeInstanceOf(Error)
  })
})

describe('WatermarkWorker', () => {
  it('applies a mark off the main thread and transfers bitmaps', async () => {
    const worker = new WatermarkWorker()
    try {
      const source = await splitBitmap(200, 100, '#ffffff', '#ffffff')
      const result = await worker.apply({
        source,
        spec: textSpec,
        fonts: [],
        output: { format: 'image/png', quality: 1 },
      })
      expect(result.blob.type).toBe('image/png')
      expect(result.width).toBe(200)
      expect(result.contrast.variant).toBe('dark')
      // The bitmap was transferred to the worker and is unusable here now.
      expect(source.width).toBe(0)
      expect(worker.busy).toBe(0)
    } finally {
      worker.terminate()
    }
  })

  it('reports worker-side failures as errors', async () => {
    const worker = new WatermarkWorker()
    try {
      const source = await splitBitmap(20, 20, '#ffffff', '#ffffff')
      await expect(
        worker.apply({
          source,
          spec: { ...textSpec, kind: 'image', assetId: 'missing' },
          fonts: [],
          output: { format: 'image/png', quality: 1 },
        }),
      ).rejects.toThrow(/resolved bitmap/)
    } finally {
      worker.terminate()
    }
  })

  it('rejects pending work when terminated', async () => {
    const worker = new WatermarkWorker()
    const source = await splitBitmap(20, 20, '#ffffff', '#ffffff')
    const pending = worker.apply({
      source,
      spec: textSpec,
      fonts: [],
      output: { format: 'image/png', quality: 1 },
    })
    worker.terminate()
    await expect(pending).rejects.toThrow(/terminated/)
  })
})
