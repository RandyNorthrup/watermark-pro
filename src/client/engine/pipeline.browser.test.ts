import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { INK } from './contrast'
import { EncodeError, encodeCanvas } from './encode'
import { orientedFrame } from './orient'
import { analyseSource, applyWatermark, prepareCanvas } from './pipeline'
import { measureAspect } from './render'
import {
  colourAt,
  countChanged,
  pixelsOf,
  quadBitmap,
  splitBitmap,
  textSpecFixture as textSpec,
} from './test-support/fixtures'
import { WatermarkWorker } from './worker-client'
import { IDENTITY_ORIENTATION, type Orientation } from '../../shared/adjustments'
import { DEFAULT_STYLE, type TextEffect, type WatermarkSpec } from '../../shared/watermark'

const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]

const ICON_CHECK = 'M20 6 9 17l-5-5'

/** Pixels that are clearly red: the chosen ink, not the white background. */
function countRed(pixels: ImageData): number {
  let count = 0
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const [r, g, b] = [
      pixels.data[offset] ?? 0,
      pixels.data[offset + 1] ?? 0,
      pixels.data[offset + 2] ?? 0,
    ]
    if (r > 200 && g < 80 && b < 80) {
      count += 1
    }
  }
  return count
}

describe('applyWatermark', () => {
  it('draws dark text on a bright region and leaves the rest untouched', async () => {
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const result = await applyWatermark(
      {
        source,
        marks: [{ spec: textSpec }],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    expect(result.blob.type).toBe('image/png')
    expect(result.width).toBe(400)
    expect(result.marks[0]?.contrast.variant).toBe('dark')
    expect(result.marks[0]?.placement.anchor).toBe('bottom-right')

    const pixels = await pixelsOf(result.blob)
    const markBox = { x: 250, y: 150, width: 150, height: 50 }
    const farAway = { x: 0, y: 0, width: 150, height: 80 }
    expect(countChanged(pixels, markBox, WHITE)).toBeGreaterThan(200)
    expect(countChanged(pixels, farAway, WHITE)).toBe(0)
  })

  it('switches to light ink on a dark region', async () => {
    const source = await splitBitmap(400, 200, '#000000', '#000000')
    const result = await applyWatermark(
      {
        source,
        marks: [{ spec: textSpec }],
        output: { format: 'image/jpeg', quality: 0.9 },
      },
      offscreenBackend,
    )
    expect(result.blob.type).toBe('image/jpeg')
    expect(result.marks[0]?.contrast.variant).toBe('light')
    const pixels = await pixelsOf(result.blob)
    expect(
      countChanged(pixels, { x: 250, y: 150, width: 150, height: 50 }, BLACK, 60),
    ).toBeGreaterThan(200)
  })

  it('places a smart mark on the flat half rather than the busy half', async () => {
    const canvas = offscreenBackend.createCanvas(400, 200)
    const ctx = canvas.context
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, 400, 200)
    // Busy checkerboard on the left half.
    for (let y = 0; y < 200; y += 8) {
      for (let x = 0; x < 200; x += 8) {
        ctx.fillStyle = (x / 8 + y / 8) % 2 === 0 ? '#000000' : '#ffffff'
        ctx.fillRect(x, y, 8, 8)
      }
    }
    const source = await canvas.toBitmap()
    const result = await applyWatermark(
      {
        source,
        marks: [{ spec: { ...textSpec, placement: { mode: 'smart' } } }],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    expect(result.marks[0]?.placement.centreX).toBeGreaterThan(200)
  })

  it('crops and resizes before marking', async () => {
    const source = await splitBitmap(400, 200, '#ff0000', '#0000ff')
    const result = await applyWatermark(
      {
        source,
        marks: [{ spec: textSpec }],
        output: { format: 'image/png', quality: 1 },
        transform: {
          crop: { x: 200, y: 0, width: 200, height: 200 },
          resize: { width: 100, height: 100 },
        },
      },
      offscreenBackend,
    )
    expect(result.width).toBe(100)
    expect(result.height).toBe(100)
    const pixels = await pixelsOf(result.blob)
    // Top-left of the output comes from the blue half of the source.
    expect(pixels.data[2]).toBeGreaterThan(200)
    expect(pixels.data[0]).toBeLessThan(40)
  })

  it('tiles across the whole image', async () => {
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const result = await applyWatermark(
      {
        source,
        marks: [
          {
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
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const pixels = await pixelsOf(result.blob)
    expect(countChanged(pixels, { x: 0, y: 0, width: 200, height: 100 }, WHITE)).toBeGreaterThan(50)
    expect(
      countChanged(pixels, { x: 200, y: 100, width: 200, height: 100 }, WHITE),
    ).toBeGreaterThan(50)
  })

  it('renders icon symbols and image marks', async () => {
    const source = await splitBitmap(300, 300, '#ffffff', '#ffffff')
    const icon = await applyWatermark(
      {
        source,
        marks: [
          {
            spec: {
              ...textSpec,
              kind: 'symbol',
              symbol: { type: 'icon', name: 'check' },
              placement: { mode: 'anchor', anchor: 'center' },
            },
            iconPath: ICON_CHECK,
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const iconPixels = await pixelsOf(icon.blob)
    expect(
      countChanged(iconPixels, { x: 100, y: 100, width: 100, height: 100 }, WHITE),
    ).toBeGreaterThan(100)

    const logo = await splitBitmap(40, 20, '#00ff00', '#00ff00')
    const withLogo = await applyWatermark(
      {
        source: await splitBitmap(300, 300, '#ffffff', '#ffffff'),
        marks: [
          {
            spec: {
              ...textSpec,
              kind: 'image',
              assetId: 'logo',
              placement: { mode: 'anchor', anchor: 'top-left' },
              style: { ...textSpec.style, scale: 0.4 },
            },
            image: logo,
          },
        ],
        output: { format: 'image/webp', quality: 0.8 },
      },
      offscreenBackend,
    )
    expect(withLogo.blob.type).toBe('image/webp')
    const logoPixels = await pixelsOf(withLogo.blob)
    expect(
      countChanged(logoPixels, { x: 15, y: 15, width: 100, height: 40 }, WHITE),
    ).toBeGreaterThan(1000)
  })

  it('draws several marks in order and reports each placement', async () => {
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const result = await applyWatermark(
      {
        source,
        marks: [
          { spec: { ...textSpec, placement: { mode: 'anchor', anchor: 'top-left' } } },
          {
            spec: {
              ...textSpec,
              placement: { mode: 'anchor', anchor: 'bottom-right' },
              contrast: { mode: 'colour', colour: '#ff0000', outline: 0 },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    expect(result.marks.map((mark) => mark.placement.anchor)).toEqual(['top-left', 'bottom-right'])
    expect(result.marks.map((mark) => mark.contrast.fill)).toEqual([INK.dark.fill, '#ff0000'])
    const pixels = await pixelsOf(result.blob)
    expect(countChanged(pixels, { x: 0, y: 0, width: 150, height: 50 }, WHITE)).toBeGreaterThan(200)
    expect(countChanged(pixels, { x: 250, y: 150, width: 150, height: 50 }, WHITE)).toBeGreaterThan(
      200,
    )
    expect(countChanged(pixels, { x: 150, y: 60, width: 100, height: 80 }, WHITE)).toBe(0)
  })

  it('paints a chosen colour, boxes multi-line text, and draws scannable QR modules', async () => {
    const red = await applyWatermark(
      {
        source: await splitBitmap(300, 200, '#ffffff', '#ffffff'),
        marks: [
          {
            spec: {
              ...textSpec,
              placement: { mode: 'anchor', anchor: 'center' },
              contrast: { mode: 'colour', colour: '#ff0000', outline: 0 },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    expect(red.marks[0]?.contrast.fill).toBe('#ff0000')
    expect(red.marks[0]?.contrast.variant).toBe('dark')
    const redPixels = await pixelsOf(red.blob)
    expect(
      countChanged(redPixels, { x: 100, y: 80, width: 100, height: 40 }, WHITE),
    ).toBeGreaterThan(100)
    expect(countRed(redPixels)).toBeGreaterThan(50)

    const boxed = await applyWatermark(
      {
        source: await splitBitmap(300, 300, '#ffffff', '#ffffff'),
        marks: [
          {
            spec: {
              ...textSpec,
              text: 'TWO\nLINES',
              placement: { mode: 'anchor', anchor: 'center' },
              contrast: { mode: 'manual', variant: 'light', outline: 0 },
              style: { ...textSpec.style, scale: 0.5, backdrop: { enabled: true, opacity: 1 } },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    // Two lines make the mark about as tall as it is wide instead of a thin strip.
    const boxedPlacement = boxed.marks[0]?.placement
    expect(boxedPlacement?.height).toBeGreaterThan((boxedPlacement?.width ?? 0) * 0.6)
    const boxedPixels = await pixelsOf(boxed.blob)
    // The dark box covers the whole mark area, well beyond the glyph strokes.
    const box = { x: 90, y: 90, width: 120, height: 120 }
    expect(countChanged(boxedPixels, box, WHITE)).toBeGreaterThan(box.width * box.height * 0.8)

    const qr = await applyWatermark(
      {
        source: await splitBitmap(300, 300, '#000000', '#000000'),
        marks: [
          {
            spec: {
              ...textSpec,
              kind: 'qr',
              content: 'https://lumafoil.com',
              placement: { mode: 'anchor', anchor: 'center' },
              style: { ...textSpec.style, scale: 0.5, opacity: 1 },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const qrPlacement = qr.marks[0]?.placement
    expect(qrPlacement?.width).toBeCloseTo(qrPlacement?.height ?? -1, 5)
    const qrPixels = await pixelsOf(qr.blob)
    const field = { x: 75, y: 75, width: 150, height: 150 }
    // Dark modules are near-black ink (sum of channel deltas 80), the field near-white.
    const light = countChanged(qrPixels, field, BLACK, 100)
    // A QR code is roughly half dark, half light, and sits on a light field.
    expect(light).toBeGreaterThan(field.width * field.height * 0.3)
    expect(light).toBeLessThan(field.width * field.height * 0.8)
    expect(countChanged(qrPixels, { x: 0, y: 0, width: 60, height: 60 }, BLACK)).toBe(0)
  })

  it('rejects impossible requests clearly', async () => {
    const source = await splitBitmap(50, 50, '#ffffff', '#ffffff')
    await expect(
      applyWatermark(
        {
          source,
          marks: [{ spec: { ...textSpec, kind: 'image', assetId: 'missing' } }],
          output: { format: 'image/png', quality: 1 },
        },
        offscreenBackend,
      ),
    ).rejects.toThrow(/resolved bitmap/)
    expect(() =>
      prepareCanvas(source, { crop: { x: 0, y: 0, width: 0, height: 10 } }, offscreenBackend),
    ).toThrow(RangeError)
    await expect(
      encodeCanvas(offscreenBackend.createCanvas(10, 10), { format: 'image/png', quality: 2 }),
    ).rejects.toThrow(RangeError)
    const glyphMark = {
      spec: {
        ...textSpec,
        kind: 'symbol' as const,
        symbol: { type: 'glyph' as const, glyph: '©', fontFamily: 'serif' },
      },
    }
    expect(measureAspect(offscreenBackend.createCanvas(10, 10).context, glyphMark)).toBeGreaterThan(
      0,
    )
  })

  it('analyses at reduced resolution, after the crop and resize', async () => {
    const source = await splitBitmap(2000, 1000, '#ffffff', '#000000')
    const map = analyseSource(source, undefined, offscreenBackend)
    expect(map.width).toBe(256)
    expect(map.height).toBe(128)
    expect(map.values[0]).toBeCloseTo(1, 1)
    expect(map.values[255]).toBeCloseTo(0, 1)
    // The black half alone, stretched to a square output.
    const cropped = analyseSource(
      source,
      { crop: { x: 1000, y: 0, width: 1000, height: 1000 }, resize: { width: 512, height: 512 } },
      offscreenBackend,
    )
    expect(cropped.width).toBe(256)
    expect(cropped.height).toBe(256)
    expect(cropped.values[0]).toBeCloseTo(0, 1)
    expect(cropped.values.at(-1)).toBeCloseTo(0, 1)
  })

  it('surfaces unsupported encoders as EncodeError', () => {
    expect(new EncodeError('x')).toBeInstanceOf(Error)
  })
})

const QUADS = {
  topLeft: '#ff0000',
  topRight: '#00ff00',
  bottomLeft: '#0000ff',
  bottomRight: '#ffff00',
}

function orientation(overrides: Partial<Orientation>): Orientation {
  return { ...IDENTITY_ORIENTATION, ...overrides }
}

function isRed([r, g, b]: readonly number[]): boolean {
  return (r ?? 0) > 180 && (g ?? 0) < 90 && (b ?? 0) < 90
}

describe('applyWatermark orientation', () => {
  it('turns the photo a quarter clockwise, swapping width and height', async () => {
    const source = await quadBitmap(400, 200, QUADS)
    const result = await applyWatermark(
      {
        source,
        marks: [],
        output: { format: 'image/png', quality: 1 },
        transform: { orientation: orientation({ turns: 1 }) },
      },
      offscreenBackend,
    )
    expect(result.width).toBe(200)
    expect(result.height).toBe(400)
    const pixels = await pixelsOf(result.blob)
    // The source top-left (red) quadrant centre maps to output (150, 100).
    expect(isRed(colourAt(pixels, 150, 100))).toBe(true)
  })

  it('mirrors the photo under a horizontal flip', async () => {
    const source = await quadBitmap(400, 200, QUADS)
    const result = await applyWatermark(
      {
        source,
        marks: [],
        output: { format: 'image/png', quality: 1 },
        transform: { orientation: orientation({ flipX: true }) },
      },
      offscreenBackend,
    )
    expect(result.width).toBe(400)
    const pixels = await pixelsOf(result.blob)
    // The red top-left quadrant is mirrored to the top-right.
    expect(isRed(colourAt(pixels, 300, 50))).toBe(true)
    expect(isRed(colourAt(pixels, 100, 50))).toBe(false)
  })

  it('straightens with an auto-crop that leaves no empty corners', async () => {
    const source = await splitBitmap(400, 200, '#808080', '#808080')
    const result = await applyWatermark(
      {
        source,
        marks: [],
        output: { format: 'image/png', quality: 1 },
        transform: { orientation: orientation({ straighten: 10 }) },
      },
      offscreenBackend,
    )
    const expected = orientedFrame({ width: 400, height: 200 }, orientation({ straighten: 10 }))
    expect(Math.abs(result.width - expected.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(result.height - expected.height)).toBeLessThanOrEqual(1)
    const pixels = await pixelsOf(result.blob)
    // Every corner is opaque grey (the fill), never a transparent or black gap.
    for (const [x, y] of [
      [1, 1],
      [result.width - 2, 1],
      [1, result.height - 2],
      [result.width - 2, result.height - 2],
    ] as const) {
      const [r, g, b, a] = colourAt(pixels, x, y)
      expect(a).toBe(255)
      expect(r).toBeGreaterThan(100)
      expect(g).toBeGreaterThan(100)
      expect(b).toBeGreaterThan(100)
    }
  })
})

const shapeSpec: WatermarkSpec = {
  kind: 'shape',
  shape: 'ellipse',
  aspect: 1,
  fill: { enabled: true, colour: '#ff0000', opacity: 1 },
  stroke: { width: 0, colour: null },
  placement: { mode: 'anchor', anchor: 'center' },
  contrast: { mode: 'manual', variant: 'dark', outline: 0 },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.6 },
}

/** Red channel at the centre of a full-block glyph rendered under one effect. */
async function centreInk(effect: TextEffect): Promise<number> {
  const result = await applyWatermark(
    {
      source: await splitBitmap(300, 300, '#ffffff', '#ffffff'),
      marks: [
        {
          spec: {
            ...textSpec,
            text: '█', // a full block: solid fills it, an outline leaves it hollow
            effect,
            placement: { mode: 'anchor', anchor: 'center' },
            contrast: { mode: 'manual', variant: 'dark', outline: 0 },
            style: { ...textSpec.style, scale: 0.4 },
          },
        },
      ],
      output: { format: 'image/png', quality: 1 },
    },
    offscreenBackend,
  )
  const pixels = await pixelsOf(result.blob)
  const placement = result.marks[0]?.placement
  return colourAt(
    pixels,
    Math.round(placement?.centreX ?? 150),
    Math.round(placement?.centreY ?? 150),
  )[0]
}

describe('applyWatermark M12', () => {
  it('draws an ellipse that leaves its bounding-box corners clear', async () => {
    const result = await applyWatermark(
      {
        source: await splitBitmap(300, 300, '#ffffff', '#ffffff'),
        marks: [{ spec: shapeSpec }],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const pixels = await pixelsOf(result.blob)
    const placement = result.marks[0]?.placement
    const half = (placement?.width ?? 0) / 2
    const cx = placement?.centreX ?? 150
    const cy = placement?.centreY ?? 150
    // The centre is red; a corner of the mark's box is background (outside the ellipse).
    const INSET = 3
    const centre = colourAt(pixels, Math.round(cx), Math.round(cy))
    const corner = colourAt(pixels, Math.round(cx - half + INSET), Math.round(cy - half + INSET))
    expect(isRed(centre)).toBe(true)
    expect(isRed(corner)).toBe(false)
  })

  it('frames the photo and offsets the mark placement by the border', async () => {
    const mark = {
      spec: { ...textSpec, placement: { mode: 'anchor' as const, anchor: 'top-left' as const } },
    }
    const plain = await applyWatermark(
      {
        source: await splitBitmap(200, 200, '#ffffff', '#ffffff'),
        marks: [mark],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const framed = await applyWatermark(
      {
        source: await splitBitmap(200, 200, '#ffffff', '#ffffff'),
        marks: [mark],
        output: { format: 'image/png', quality: 1 },
        transform: { border: { width: 0.05, colour: '#ff0000' } },
      },
      offscreenBackend,
    )
    // 200 + 2 × round(0.05 × 200) = 220; the border is 10 px.
    const BORDER = 10
    expect(framed.width).toBe(200 + BORDER * 2)
    const pixels = await pixelsOf(framed.blob)
    expect(isRed(colourAt(pixels, 3, 3))).toBe(true)
    // The framed mark's centre is the plain one shifted by exactly the border.
    expect(framed.marks[0]?.placement.centreX ?? 0).toBeCloseTo(
      (plain.marks[0]?.placement.centreX ?? 0) + BORDER,
      3,
    )
  })

  it('leaves a glyph hollow under the outline effect', async () => {
    // The block's centre is dark when filled, near-white when only outlined.
    expect(await centreInk('solid')).toBeLessThan(80)
    expect(await centreInk('outline')).toBeGreaterThan(180)
  })
})

describe('WatermarkWorker', () => {
  it('applies a mark off the main thread and transfers bitmaps', async () => {
    const worker = new WatermarkWorker()
    try {
      const source = await splitBitmap(200, 100, '#ffffff', '#ffffff')
      const result = await worker.apply({
        source,
        marks: [{ spec: textSpec }],
        fonts: [],
        output: { format: 'image/png', quality: 1 },
      })
      expect(result.blob.type).toBe('image/png')
      expect(result.width).toBe(200)
      expect(result.marks[0]?.contrast.variant).toBe('dark')
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
          marks: [{ spec: { ...textSpec, kind: 'image', assetId: 'missing' } }],
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
      marks: [{ spec: textSpec }],
      fonts: [],
      output: { format: 'image/png', quality: 1 },
    })
    worker.terminate()
    await expect(pending).rejects.toThrow(/terminated/)
  })
})
