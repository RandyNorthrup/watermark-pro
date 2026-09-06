/**
 * Throughput benchmark for PLAN.md §5.5: a 4000×3000 JPEG with a text mark.
 * Numbers are printed for docs/benchmarks.md; the assertion is a loose
 * safety net so a regression of an order of magnitude fails CI without the
 * test flaking on a busy machine.
 */
import { describe, expect, it } from 'vitest'

import { WatermarkWorker } from './worker-client'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'

const WIDTH = 4000
const HEIGHT = 3000
const IMAGES = 8
const MAX_SECONDS_PER_IMAGE_SINGLE_WORKER = 4
const MILLISECONDS = 1000

const spec: WatermarkSpec = {
  kind: 'text',
  text: '© Watermark Pro benchmark',
  fontFamily: 'sans-serif',
  fontWeight: 600,
  placement: { mode: 'smart' },
  contrast: { mode: 'auto' },
  style: DEFAULT_STYLE,
}

async function photoLike(): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  gradient.addColorStop(0, '#f4d35e')
  gradient.addColorStop(1, '#0d3b66')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#ee964b'
  ctx.beginPath()
  ctx.arc(WIDTH * 0.55, HEIGHT * 0.5, HEIGHT * 0.25, 0, Math.PI * 2)
  ctx.fill()
  return await createImageBitmap(canvas)
}

describe('engine throughput', () => {
  it('processes a 4000×3000 image within budget, single and pooled', async () => {
    const single = new WatermarkWorker()
    const output = { format: 'image/jpeg' as const, quality: 0.9 }
    try {
      const warmup = await photoLike()
      await single.apply({ source: warmup, spec, fonts: [], output })
      const started = performance.now()
      const source = await photoLike()
      await single.apply({ source, spec, fonts: [], output })
      const seconds = (performance.now() - started) / MILLISECONDS
      console.info(`single worker: ${seconds.toFixed(2)} s per image`)
      expect(seconds).toBeLessThan(MAX_SECONDS_PER_IMAGE_SINGLE_WORKER)
    } finally {
      single.terminate()
    }

    const poolSize = Math.max(1, Math.min(IMAGES, navigator.hardwareConcurrency))
    const pool = Array.from({ length: poolSize }, () => new WatermarkWorker())
    try {
      const sources = await Promise.all(Array.from({ length: IMAGES }, () => photoLike()))
      const started = performance.now()
      await Promise.all(
        sources.map((source, index) => {
          const worker = pool[index % poolSize]
          if (worker === undefined) {
            throw new Error('pool index out of range')
          }
          return worker.apply({ source, spec, fonts: [], output })
        }),
      )
      const seconds = (performance.now() - started) / MILLISECONDS
      console.info(
        `${String(poolSize)} workers: ${String(IMAGES)} images in ${seconds.toFixed(2)} s = ${(IMAGES / seconds).toFixed(2)} images/s`,
      )
      expect(seconds).toBeLessThan(MAX_SECONDS_PER_IMAGE_SINGLE_WORKER * IMAGES)
    } finally {
      for (const worker of pool) {
        worker.terminate()
      }
    }
  })
})
