/**
 * Runs in Chromium: the preview renderer drives the real engine worker with
 * real fonts from the bundled catalogue, the sample photo, and a logo blob.
 */
import { describe, expect, it } from 'vitest'

import { PreviewRenderer } from './preview'
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
})
