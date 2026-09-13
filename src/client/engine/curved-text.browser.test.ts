import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { applyWatermark, type MarkPlacement } from './pipeline'
import { pixelsOf, splitBitmap, textSpecFixture } from './test-support/fixtures'
import { DEFAULT_SHAPE_SPEC, MAX_STROKE_RATIO, SHAPES } from '../../shared/watermark'
import { SHAPE_CATALOGUE } from '../shapes/catalogue'

const WIDTH = 600
const HEIGHT = 400
const DARK_THRESHOLD = 100
const MIN_CURVE_OFFSET = 10

/** Inverse-transform actual pixels into the selection's local coordinates. */
function inkOutsideSelection(
  pixels: ImageData,
  box: MarkPlacement,
): { outside: number; ink: number } {
  const angle = (box.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  let outside = 0
  let ink = 0
  for (let pixel = 0; pixel < pixels.width * pixels.height; pixel += 1) {
    if ((pixels.data[pixel * 4] ?? 255) >= DARK_THRESHOLD) continue
    ink += 1
    const dx = (pixel % pixels.width) + 0.5 - box.centreX
    const dy = Math.floor(pixel / pixels.width) + 0.5 - box.centreY
    const localX = dx * cosine - dy * sine
    const localY = dx * sine + dy * cosine
    // Raster antialiasing can reach the adjacent pixel at an exact ink edge.
    if (Math.abs(localX) > box.width / 2 + 1 || Math.abs(localY) > box.height / 2 + 1) outside += 1
  }
  return { outside, ink }
}

/** Pixel centroids compare both ends against the middle, independent of layout's arc maths. */
function inkCentre(pixels: ImageData, bands: readonly [number, number][]): number {
  let totalY = 0
  let count = 0
  for (let y = 0; y < pixels.height; y += 1) {
    for (const [left, right] of bands) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * pixels.width + x) * 4
        if ((pixels.data[offset] ?? 255) < DARK_THRESHOLD) {
          totalY += y
          count += 1
        }
      }
    }
  }
  if (count === 0) throw new Error('Expected visible text in the measured band')
  return totalY / count
}

async function bendOffset(curve: number): Promise<number> {
  const source = await splitBitmap(WIDTH, HEIGHT, '#ffffff', '#ffffff')
  try {
    const result = await applyWatermark(
      {
        source,
        marks: [
          {
            spec: {
              ...textSpecFixture,
              text: 'HHHHHHHHH',
              curve,
              placement: { mode: 'anchor', anchor: 'center' },
              contrast: { mode: 'manual', variant: 'dark', outline: 0 },
              style: { ...textSpecFixture.style, scale: 0.6, rotation: 0 },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const pixels = await pixelsOf(result.blob)
    const ends = inkCentre(pixels, [
      [120, 180],
      [420, 480],
    ])
    const middle = inkCentre(pixels, [[250, 350]])
    return ends - middle
  } finally {
    source.close()
  }
}

describe('curved text in exported pixels', () => {
  it.each(SHAPES)(
    'includes the widest %s stroke in the rotated selection and image bounds',
    async (shape) => {
      const source = await splitBitmap(WIDTH, HEIGHT, '#ffffff', '#ffffff')
      try {
        const result = await applyWatermark(
          {
            source,
            marks: [
              {
                spec: {
                  ...DEFAULT_SHAPE_SPEC,
                  shape,
                  aspect: SHAPE_CATALOGUE[shape].aspect,
                  fill: { enabled: false, colour: '#000000', opacity: 1 },
                  stroke: { width: MAX_STROKE_RATIO, colour: '#000000' },
                  placement: { mode: 'custom', x: 0.98, y: 0.02 },
                  style: { ...DEFAULT_SHAPE_SPEC.style, opacity: 1, scale: 0.6, rotation: 27 },
                },
              },
            ],
            output: { format: 'image/png', quality: 1 },
          },
          offscreenBackend,
        )
        const placement = result.marks[0]?.placement
        if (placement === undefined) throw new Error('Missing shape placement')
        const measured = inkOutsideSelection(await pixelsOf(result.blob), placement)
        expect(measured.ink).toBeGreaterThan(100)
        expect(measured.outside).toBe(0)
      } finally {
        source.close()
      }
    },
  )

  it.each([
    { curve: 0, rotation: 35, scale: 0.4, text: 'AV ffi © Lumafoil' },
    { curve: 1, rotation: 0, scale: 0.2, text: '© Lumafoil Sep 12, 2026' },
    { curve: -1, rotation: -40, scale: 0.55, text: '© Lumafoil Sep 12, 2026' },
    { curve: 0.75, rotation: 70, scale: 0.9, text: '© Lumafoil\nSep 12, 2026' },
    { curve: -0.75, rotation: 150, scale: 0.9, text: '© Lumafoil\nSep 12, 2026' },
  ])('contains transformed ink in its selection: $curve / $rotation / $scale', async (options) => {
    const source = await splitBitmap(WIDTH, HEIGHT, '#ffffff', '#ffffff')
    try {
      const result = await applyWatermark(
        {
          source,
          marks: [
            {
              spec: {
                ...textSpecFixture,
                text: options.text,
                curve: options.curve,
                placement: { mode: 'custom', x: 0.9, y: 0.1 },
                contrast: { mode: 'manual', variant: 'dark', outline: 0 },
                style: {
                  ...textSpecFixture.style,
                  scale: options.scale,
                  rotation: options.rotation,
                },
              },
            },
          ],
          output: { format: 'image/png', quality: 1 },
        },
        offscreenBackend,
      )
      const placement = result.marks[0]?.placement
      if (placement === undefined) throw new Error('Missing text placement')
      const pixels = await pixelsOf(result.blob)
      const measured = inkOutsideSelection(pixels, placement)
      expect(measured.ink).toBeGreaterThan(100)
      expect(measured.outside).toBe(0)
      // A deliberately wrong, straight-text-sized box must reject the same pixels.
      expect(inkOutsideSelection(pixels, { ...placement, height: 1 }).outside).toBeGreaterThan(0)
    } finally {
      source.close()
    }
  })

  it('bends opposite directions and keeps zero curvature straight', async () => {
    const straight = await bendOffset(0)
    const upward = await bendOffset(0.75)
    const downward = await bendOffset(-0.75)
    expect(Math.abs(straight)).toBeLessThan(3)
    expect(upward).toBeGreaterThan(MIN_CURVE_OFFSET)
    expect(downward).toBeLessThan(-MIN_CURVE_OFFSET)
  })
})
