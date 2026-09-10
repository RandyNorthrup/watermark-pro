/**
 * Runs in Chromium: the preview renderer drives the real engine worker with
 * real fonts from the bundled catalogue, the sample photo, and a logo blob.
 */
import { describe, expect, it } from 'vitest'

import { domBackend } from './canvas-backend'
import { PreviewRenderer, scaleTransform } from './preview'
import { createSamplePhoto, SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from './sample-photo'
import { SAMPLE_SCENE_PATH } from '../../shared/constants'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'
import { offscreenBackend } from '../engine/canvas'
import type { WatermarkEngine } from '../engine/engine'
import { LocalEngine } from '../engine/local-engine'
import { FONT_CATALOGUE } from '../fonts/catalogue'
import { loadFont } from '../fonts/load'

const LOGO_SIZE = 64
const PREVIEW_TIMEOUT_MS = 20_000
/** Mean channel difference JPEG compression may introduce over a flat region. */
const JPEG_TOLERANCE = 6

function pixelsOf(bitmap: ImageBitmap): ImageData {
  const canvas = offscreenBackend.createCanvas(bitmap.width, bitmap.height)
  canvas.context.drawImage(bitmap, 0, 0)
  return canvas.context.getImageData(0, 0, bitmap.width, bitmap.height)
}

function meanColour(
  pixels: ImageData,
  region: { x: number; y: number; width: number; height: number },
): number[] {
  const sums = [0, 0, 0]
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * pixels.width + x) * 4
      for (const channel of [0, 1, 2]) {
        sums[channel] = (sums[channel] ?? 0) + (pixels.data[offset + channel] ?? 0)
      }
    }
  }
  return sums.map((sum) => sum / (region.width * region.height))
}

async function logoBlob(): Promise<Blob> {
  const canvas = new OffscreenCanvas(LOGO_SIZE, LOGO_SIZE)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  ctx.fillStyle = '#ff3366'
  ctx.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE)
  return await canvas.convertToBlob({ type: 'image/png' })
}

/** The logo as a chosen photo, dated so `{date}` stamps are predictable. */
async function logoFile(): Promise<File> {
  return new File([await logoBlob()], 'logo-photo.png', {
    type: 'image/png',
    lastModified: new Date(2026, 8, 6, 9, 30).getTime(),
  })
}

async function decodedSize(url: string): Promise<{ width: number; height: number }> {
  const response = await fetch(url)
  const bitmap = await createImageBitmap(await response.blob())
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

describe('font loading', () => {
  it('registers a catalogue family on the page and returns a same-origin woff2 url', async () => {
    const resource = await loadFont('Lobster', 700)
    expect(resource.family).toBe('Lobster')
    expect(resource.weight).toBe(400)
    expect(new URL(resource.url, location.href).origin).toBe(location.origin)
    expect(resource.url.endsWith('.woff2')).toBe(true)
    await document.fonts.load('400 24px "Lobster"')
    expect(document.fonts.check('400 24px "Lobster"')).toBe(true)
    await expect(loadFont('Comic Sans', 400)).rejects.toThrow(/unknown font family/)
  })

  it(
    'bundles a stylesheet and a latin file for every family and weight in the catalogue',
    async () => {
      for (const font of FONT_CATALOGUE) {
        for (const weight of font.weights) {
          const resource = await loadFont(font.family, weight)
          expect(resource.weight).toBe(weight)
          expect(resource.url.endsWith('.woff2')).toBe(true)
        }
      }
    },
    PREVIEW_TIMEOUT_MS,
  )
})

describe('sample photo', () => {
  it('draws a scene at the documented size', async () => {
    const bitmap = await createSamplePhoto(offscreenBackend)
    expect(bitmap.width).toBe(SAMPLE_PHOTO_WIDTH)
    expect(bitmap.height).toBe(SAMPLE_PHOTO_HEIGHT)
    bitmap.close()
  })

  it('ships public/sample-scene.jpg as the same scene (rerun scripts/sample-scene.mjs otherwise)', async () => {
    const response = await fetch(SAMPLE_SCENE_PATH)
    expect(response.ok).toBe(true)
    const shipped = await createImageBitmap(await response.blob())
    const drawn = await createSamplePhoto(offscreenBackend)
    expect([shipped.width, shipped.height]).toEqual([drawn.width, drawn.height])
    const shippedPixels = pixelsOf(shipped)
    const drawnPixels = pixelsOf(drawn)
    // Sky, sun, hills and ground: the mean colour of each region within JPEG tolerance.
    const regions = [
      { x: 40, y: 40, width: 200, height: 100 },
      { x: 660, y: 150, width: 60, height: 60 },
      { x: 300, y: 430, width: 200, height: 60 },
      { x: 100, y: 560, width: 400, height: 60 },
    ]
    for (const region of regions) {
      const [a, b] = [meanColour(shippedPixels, region), meanColour(drawnPixels, region)]
      for (const channel of [0, 1, 2]) {
        expect(Math.abs((a[channel] ?? 0) - (b[channel] ?? 0))).toBeLessThan(JPEG_TOLERANCE)
      }
    }
    shipped.close()
    drawn.close()
  })
})

describe('PreviewRenderer', () => {
  it(
    'renders text, symbol and logo marks and reports placement',
    async () => {
      let loads = 0
      const renderer = new PreviewRenderer(async () => {
        loads += 1
        return await logoBlob()
      })
      try {
        const text = await renderer.render(DEFAULT_TEXT_SPEC)
        expect(text).not.toBeNull()
        expect(text?.marks[0]?.placement.anchor).not.toBeNull()
        expect(await decodedSize(text?.url ?? '')).toEqual({
          width: SAMPLE_PHOTO_WIDTH,
          height: SAMPLE_PHOTO_HEIGHT,
        })

        const icon: WatermarkSpec = {
          kind: 'symbol',
          symbol: { type: 'icon', name: 'camera' },
          placement: { mode: 'anchor', anchor: 'top-left' },
          contrast: { mode: 'auto' },
          style: DEFAULT_STYLE,
        }
        const iconResult = await renderer.render(icon)
        expect(iconResult?.marks[0]?.placement.anchor).toBe('top-left')

        const glyph: WatermarkSpec = {
          ...icon,
          symbol: { type: 'glyph', glyph: '★', fontFamily: 'Pacifico' },
        }
        expect(await renderer.render(glyph)).not.toBeNull()

        const logo: WatermarkSpec = {
          kind: 'image',
          assetId: 'asset-1',
          placement: { mode: 'custom', x: 0.5, y: 0.5 },
          contrast: { mode: 'manual', variant: 'light', outline: 0.3 },
          style: DEFAULT_STYLE,
        }
        const first = await renderer.render(logo)
        const second = await renderer.render(logo)
        expect(first?.marks[0]?.placement.anchor).toBeNull()
        expect(second?.marks[0]?.contrast.variant).toBe('light')
        expect(loads).toBe(1)
        renderer.forgetLogo('asset-1')
        await renderer.render(logo)
        expect(loads).toBe(2)
      } finally {
        renderer.dispose()
      }
    },
    PREVIEW_TIMEOUT_MS,
  )

  it(
    'discards stale frames and accepts a custom subject',
    async () => {
      const renderer = new PreviewRenderer(() => Promise.reject(new Error('no logos')))
      try {
        const [stale, fresh] = await Promise.all([
          renderer.render(DEFAULT_TEXT_SPEC),
          renderer.render({ ...DEFAULT_TEXT_SPEC, style: { ...DEFAULT_STYLE, rotation: 30 } }),
        ])
        expect(stale).toBeNull()
        expect(fresh).not.toBeNull()

        await renderer.setSubject(await logoFile())
        const onLogo = await renderer.render(DEFAULT_TEXT_SPEC)
        expect(await decodedSize(onLogo?.url ?? '')).toEqual({
          width: LOGO_SIZE,
          height: LOGO_SIZE,
        })

        await expect(
          renderer.render({
            kind: 'image',
            assetId: 'missing',
            placement: { mode: 'smart' },
            contrast: { mode: 'auto' },
            style: DEFAULT_STYLE,
          }),
        ).rejects.toThrow('no logos')
      } finally {
        renderer.dispose()
      }
    },
    PREVIEW_TIMEOUT_MS,
  )

  it(
    'renders the same scene through the main-thread engine on DOM canvases',
    async () => {
      const renderer = new PreviewRenderer(
        async () => await logoBlob(),
        new LocalEngine(domBackend, document.fonts),
        domBackend,
      )
      try {
        const text = await renderer.render(DEFAULT_TEXT_SPEC)
        expect(text?.marks[0]?.placement.anchor).not.toBeNull()
        expect(await decodedSize(text?.url ?? '')).toEqual({
          width: SAMPLE_PHOTO_WIDTH,
          height: SAMPLE_PHOTO_HEIGHT,
        })
        await renderer.setSubject(await logoFile())
        const script: WatermarkSpec = {
          kind: 'text',
          text: 'Lobster',
          fontFamily: 'Lobster',
          fontWeight: 400,
          letterSpacing: 0,
          curve: 0,
          effect: 'solid',
          placement: { mode: 'smart' },
          contrast: { mode: 'auto' },
          style: DEFAULT_STYLE,
        }
        const full = await renderer.exportFull(
          script,
          { format: 'image/webp', quality: 0.8 },
          { resize: { width: 32, height: 32 } },
        )
        expect(full.type).toBe('image/webp')
        expect(await decodedSize(URL.createObjectURL(full))).toEqual({ width: 32, height: 32 })
      } finally {
        renderer.dispose()
      }
    },
    PREVIEW_TIMEOUT_MS,
  )

  it('fills text tokens from the chosen photo, or from now and the sample name without one', async () => {
    const seen: string[] = []
    const engine: WatermarkEngine = {
      busy: 0,
      apply: (input) => {
        const [first] = input.marks
        if (first?.spec.kind === 'text') {
          seen.push(first.spec.text)
        }
        input.source.close()
        return Promise.resolve({
          blob: new Blob(),
          width: 1,
          height: 1,
          marks: [
            {
              placement: { centreX: 0, centreY: 0, anchor: null, width: 1, height: 1, rotation: 0 },
              contrast: { variant: 'dark', fill: '#000000', outline: 0, isAuto: true },
            },
          ],
        })
      },
      terminate: () => {
        // Nothing to stop: every apply resolves at once.
      },
    }
    const renderer = new PreviewRenderer(() => Promise.reject(new Error('no logos')), engine)
    try {
      const stamp: WatermarkSpec = {
        kind: 'text',
        text: '{filename} {date}',
        fontFamily: 'Inter Variable',
        fontWeight: 600,
        letterSpacing: 0,
        curve: 0,
        effect: 'solid',
        placement: { mode: 'smart' },
        contrast: { mode: 'auto' },
        style: DEFAULT_STYLE,
      }
      await renderer.render(stamp)
      expect(seen.at(-1)?.startsWith('sample-photo ')).toBe(true)
      await renderer.setSubject(await logoFile())
      await renderer.exportFull(stamp, { format: 'image/png', quality: 1 })
      expect(seen.at(-1)?.startsWith('logo-photo ')).toBe(true)
      expect(seen.at(-1)).toContain('2026')
      await renderer.render(DEFAULT_TEXT_SPEC)
      expect(seen.at(-1)).toBe('© Lumafoil')
    } finally {
      renderer.dispose()
    }
  })

  it(
    'scales source-pixel transforms to the preview and exports at full size',
    async () => {
      const renderer = new PreviewRenderer(() => Promise.reject(new Error('no logos')))
      try {
        // A 2560×1600 subject previews at half size (1280 max side).
        const big = new OffscreenCanvas(2560, 1600)
        const ctx = big.getContext('2d')
        if (ctx === null) {
          throw new Error('no 2d context')
        }
        ctx.fillStyle = '#4488cc'
        ctx.fillRect(0, 0, 2560, 1600)
        await renderer.setSubject(
          new File([await big.convertToBlob({ type: 'image/png' })], 'big.png', {
            type: 'image/png',
          }),
        )
        expect(renderer.sourceSize).toEqual({ width: 2560, height: 1600 })
        expect(renderer.subjectScale).toBeCloseTo(0.5)

        const transform = {
          crop: { x: 640, y: 400, width: 1280, height: 800 },
          resize: { width: 640, height: 400 },
        }
        const preview = await renderer.render(DEFAULT_TEXT_SPEC, { transform })
        expect(preview).not.toBeNull()
        expect(await decodedSize(preview?.url ?? '')).toEqual({ width: 320, height: 200 })
        expect(preview?.marks[0]?.placement.width).toBeGreaterThan(0)
        expect(preview?.marks[0]?.placement.height).toBeGreaterThan(0)

        const full = await renderer.exportFull(
          DEFAULT_TEXT_SPEC,
          { format: 'image/png', quality: 1 },
          transform,
        )
        expect(full.type).toBe('image/png')
        expect(await decodedSize(URL.createObjectURL(full))).toEqual({ width: 640, height: 400 })

        const untouched = await renderer.exportFull(DEFAULT_TEXT_SPEC, {
          format: 'image/webp',
          quality: 0.8,
        })
        expect(await decodedSize(URL.createObjectURL(untouched))).toEqual({
          width: 2560,
          height: 1600,
        })
      } finally {
        renderer.dispose()
      }
    },
    PREVIEW_TIMEOUT_MS,
  )

  it('scales transforms only when the subject is downscaled', () => {
    const transform = {
      crop: { x: 10, y: 20, width: 30, height: 40 },
      resize: { width: 3, height: 4 },
    }
    expect(scaleTransform(transform, 1)).toBe(transform)
    expect(scaleTransform(undefined, 0.5)).toBeUndefined()
    expect(scaleTransform(transform, 0.5)).toEqual({
      crop: { x: 5, y: 10, width: 15, height: 20 },
      resize: { width: 2, height: 2 },
    })
    expect(scaleTransform({ crop: transform.crop }, 0.01)?.crop?.width).toBe(1)
  })
})
