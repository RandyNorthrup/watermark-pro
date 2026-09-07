/**
 * Runs in Chromium: the main-thread engine over the DOM canvas backend, the
 * path Safari before 16.4 takes. Same behaviour as the worker, checked with
 * the same pixel probes.
 */
import { describe, expect, it, vi } from 'vitest'

import { LocalEngine, LocalEngineError } from './local-engine'
import {
  countChanged,
  pixelsOf,
  splitBitmap,
  textSpecFixture as textSpec,
} from './test-support/fixtures'
import { loadFont } from '../fonts/load'
import { domBackend } from '../lib/canvas-backend'

const WHITE: [number, number, number] = [255, 255, 255]

describe('LocalEngine', () => {
  it('applies a mark on the calling thread and releases the bitmaps', async () => {
    const engine = new LocalEngine(domBackend, document.fonts)
    const source = await splitBitmap(400, 200, '#ffffff', '#ffffff')
    const logo = await splitBitmap(40, 20, '#00ff00', '#00ff00')
    const pending = engine.apply({
      source,
      marks: [{ spec: textSpec, image: logo }],
      fonts: [],
      output: { format: 'image/png', quality: 1 },
    })
    expect(engine.busy).toBe(1)
    const result = await pending
    expect(engine.busy).toBe(0)
    expect(result.blob.type).toBe('image/png')
    expect(result.width).toBe(400)
    expect(result.marks[0]?.contrast.variant).toBe('dark')
    expect(result.marks[0]?.placement.anchor).toBe('bottom-right')
    const pixels = await pixelsOf(result.blob)
    expect(countChanged(pixels, { x: 250, y: 150, width: 150, height: 50 }, WHITE)).toBeGreaterThan(
      200,
    )
    expect(countChanged(pixels, { x: 0, y: 0, width: 150, height: 80 }, WHITE)).toBe(0)
    // Closed bitmaps report zero size.
    expect(source.width).toBe(0)
    expect(logo.width).toBe(0)
    engine.terminate()
  })

  it('loads each font into the document once', async () => {
    const engine = new LocalEngine(domBackend, document.fonts)
    const lobster = await loadFont('Lobster', 400)
    const add = vi.spyOn(document.fonts, 'add')
    try {
      for (let pass = 0; pass < 2; pass += 1) {
        const result = await engine.apply({
          source: await splitBitmap(300, 100, '#ffffff', '#ffffff'),
          marks: [{ spec: { ...textSpec, fontFamily: 'Lobster', fontWeight: 400 } }],
          fonts: [lobster],
          output: { format: 'image/jpeg', quality: 0.9 },
        })
        expect(result.blob.type).toBe('image/jpeg')
      }
      expect(add).toHaveBeenCalledTimes(1)
      const face = add.mock.calls[0]?.[0]
      expect(face?.family).toBe('Lobster')
      expect(face?.status).toBe('loaded')
    } finally {
      add.mockRestore()
      engine.terminate()
    }
  })

  it('reports pipeline failures and refuses work after termination', async () => {
    const engine = new LocalEngine(domBackend, document.fonts)
    await expect(
      engine.apply({
        source: await splitBitmap(20, 20, '#ffffff', '#ffffff'),
        marks: [{ spec: { ...textSpec, kind: 'image', assetId: 'missing' } }],
        fonts: [],
        output: { format: 'image/png', quality: 1 },
      }),
    ).rejects.toThrow(/resolved bitmap/)
    engine.terminate()
    const source = await splitBitmap(20, 20, '#ffffff', '#ffffff')
    await expect(
      engine.apply({
        source,
        marks: [{ spec: textSpec }],
        fonts: [],
        output: { format: 'image/png', quality: 1 },
      }),
    ).rejects.toThrow(LocalEngineError)
    expect(source.width).toBe(0)
    expect(engine.busy).toBe(0)
  })
})
