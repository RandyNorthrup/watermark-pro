/**
 * Runs in Chromium: the preview renderer drives the real engine worker with
 * real fonts from the bundled catalogue, the sample photo, and a logo blob.
 */
import { describe, expect, it } from 'vitest'

import { PreviewRenderer, scaleTransform } from './preview'
import { createSamplePhoto, SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from './sample-photo'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'
import { FONT_CATALOGUE } from '../fonts/catalogue'
import { loadFont } from '../fonts/load'

const LOGO_SIZE = 64
const PREVIEW_TIMEOUT_MS = 20_000

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
    const bitmap = await createSamplePhoto()
    expect(bitmap.width).toBe(SAMPLE_PHOTO_WIDTH)
    expect(bitmap.height).toBe(SAMPLE_PHOTO_HEIGHT)
    bitmap.close()
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
        expect(text?.placement.anchor).not.toBeNull()
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
        expect(iconResult?.placement.anchor).toBe('top-left')

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
        expect(first?.placement.anchor).toBeNull()
        expect(second?.contrast.variant).toBe('light')
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

        await renderer.setSubject(await logoBlob())
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
        await renderer.setSubject(await big.convertToBlob({ type: 'image/png' }))
        expect(renderer.sourceSize).toEqual({ width: 2560, height: 1600 })
        expect(renderer.subjectScale).toBeCloseTo(0.5)

        const transform = {
          crop: { x: 640, y: 400, width: 1280, height: 800 },
          resize: { width: 640, height: 400 },
        }
        const preview = await renderer.render(DEFAULT_TEXT_SPEC, { transform })
        expect(preview).not.toBeNull()
        expect(await decodedSize(preview?.url ?? '')).toEqual({ width: 320, height: 200 })
        expect(preview?.placement.width).toBeGreaterThan(0)
        expect(preview?.placement.height).toBeGreaterThan(0)

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
