/**
 * Runs in Chromium: the DOM canvas backend against real `HTMLCanvasElement`
 * encoding, and the capability switch that decides between the worker and
 * the main-thread engine.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEngine, domBackend, mainThreadBackend, hasOffscreenCanvas } from './canvas-backend'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { offscreenBackend } from '../engine/canvas'
import { pixelsOf } from '../engine/test-support/fixtures'
import { WatermarkWorker } from '../engine/worker-client'

const RED: [number, number, number] = [255, 0, 0]

describe('domBackend', () => {
  it('draws, encodes every output format and hands back bitmaps', async () => {
    const canvas = domBackend.createCanvas(8.4, 0)
    expect(canvas.width).toBe(8)
    expect(canvas.height).toBe(1)
    canvas.context.fillStyle = '#ff0000'
    canvas.context.fillRect(0, 0, 8, 1)
    for (const format of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      const blob = await canvas.encode({ format, quality: 0.9 })
      expect(blob.type).toBe(format)
    }
    const pixels = await pixelsOf(await canvas.encode({ format: 'image/png', quality: 1 }))
    expect([pixels.data[0], pixels.data[1], pixels.data[2]]).toEqual(RED)
    const bitmap = await canvas.toBitmap()
    expect(bitmap.width).toBe(8)
    bitmap.close()
  })
})

/** A flat white bitmap drawn without OffscreenCanvas, for the tests that stub it away. */
async function whiteBitmap(width: number, height: number): Promise<ImageBitmap> {
  const canvas = domBackend.createCanvas(width, height)
  canvas.context.fillStyle = '#ffffff'
  canvas.context.fillRect(0, 0, width, height)
  return await canvas.toBitmap()
}

describe('capability detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers OffscreenCanvas and Web Workers when the browser has them', () => {
    expect(hasOffscreenCanvas()).toBe(true)
    expect(mainThreadBackend()).toBe(offscreenBackend)
    const engine = createEngine()
    expect(engine).toBeInstanceOf(WatermarkWorker)
    engine.terminate()
  })

  it('falls back to the DOM backend and a lazily loaded main-thread engine without OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(hasOffscreenCanvas()).toBe(false)
    expect(mainThreadBackend()).toBe(domBackend)
    const engine = createEngine()
    expect(engine).not.toBeInstanceOf(WatermarkWorker)
    const source = await whiteBitmap(120, 60)
    const pending = engine.apply({
      source,
      marks: [{ spec: DEFAULT_TEXT_SPEC }],
      fonts: [],
      output: { format: 'image/png', quality: 1 },
    })
    expect(engine.busy).toBe(1)
    const result = await pending
    expect(result.width).toBe(120)
    expect(result.blob.type).toBe('image/png')
    expect(engine.busy).toBe(0)
    engine.terminate()
    await expect(
      engine.apply({
        source: await whiteBitmap(8, 8),
        marks: [{ spec: DEFAULT_TEXT_SPEC }],
        fonts: [],
        output: { format: 'image/png', quality: 1 },
      }),
    ).rejects.toThrow(/terminated/)
  })

  it('refuses work when terminated before the engine module arrived', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const engine = createEngine()
    const pending = engine.apply({
      source: await whiteBitmap(8, 8),
      marks: [{ spec: DEFAULT_TEXT_SPEC }],
      fonts: [],
      output: { format: 'image/png', quality: 1 },
    })
    engine.terminate()
    await expect(pending).rejects.toThrow(/terminated/)
    expect(engine.busy).toBe(0)
  })
})
