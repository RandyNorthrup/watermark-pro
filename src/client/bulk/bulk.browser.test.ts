/**
 * Runs in Chromium: the worker pool, the per-file processor and the ZIP
 * builder against the real engine, plus the M5 throughput measurement over
 * a batch of 20 fixtures (PLAN.md §5.5: ≥ 2 images/s with 8 workers).
 */
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { BulkProcessor, outputFileName } from './processor'
import { CancelledError, JobQueue } from './queue'
import { createBulkRuntime } from './runtime'
import { defaultPoolSize, MAX_POOL_SIZE, WorkerPool } from './worker-pool'
import { uniqueNames, zipEntries } from './zip'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { MarkResources } from '../lib/mark-resources'

const FIXTURES = 20
const FIXTURE_WIDTH = 1600
const FIXTURE_HEIGHT = 1200
const BENCHMARK_TIMEOUT_MS = 60_000
const MIN_IMAGES_PER_SECOND = 2
const MILLISECONDS = 1000

async function photoFile(name: string, hue: number, width = FIXTURE_WIDTH): Promise<File> {
  const height = Math.round((width * FIXTURE_HEIGHT) / FIXTURE_WIDTH)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, `hsl(${String(hue)} 70% 30%)`)
  gradient.addColorStop(1, `hsl(${String(hue + 40)} 70% 80%)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  return new File([blob], name, { type: 'image/jpeg' })
}

async function decodedSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

describe('WorkerPool', () => {
  it('sizes itself from the hardware and hands work to the least busy worker', () => {
    expect(defaultPoolSize(1)).toBe(1)
    expect(defaultPoolSize(4)).toBe(3)
    expect(defaultPoolSize(64)).toBe(MAX_POOL_SIZE)
    expect(defaultPoolSize(NaN)).toBe(1)
    expect(() => new WorkerPool(0)).toThrow(RangeError)
    const pool = new WorkerPool(2)
    try {
      expect(pool.size).toBe(2)
    } finally {
      pool.terminate()
    }
  })
})

describe('zip', () => {
  it('stores entries under unique names and produces a readable archive', async () => {
    expect(uniqueNames(['a.png', 'a.png', 'b', 'a.png', 'b'])).toEqual([
      'a.png',
      'a (1).png',
      'b',
      'a (2).png',
      'b (1)',
    ])
    const blob = await zipEntries([
      { name: 'one.txt', blob: new Blob(['first']) },
      { name: 'one.txt', blob: new Blob(['second']) },
    ])
    expect(blob.type).toBe('application/zip')
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(files).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'one (1).txt',
      'one.txt',
    ])
    expect(new TextDecoder().decode(files['one (1).txt'])).toBe('second')
  })
})

describe('BulkProcessor', () => {
  it('watermarks a file, resizes to the long edge, names the output, and honours cancellation', async () => {
    const pool = new WorkerPool(1)
    const processor = new BulkProcessor(
      pool,
      new MarkResources(() => Promise.reject(new Error('no logos'))),
    )
    try {
      const file = await photoFile('holiday.JPG', 200)
      const kept = await processor.process(
        file,
        DEFAULT_TEXT_SPEC,
        { output: { format: 'image/webp', quality: 0.8 }, fitLongestSide: null },
        new AbortController().signal,
      )
      expect(kept.fileName).toBe('holiday-watermarked.webp')
      expect(kept.blob.type).toBe('image/webp')
      expect(await decodedSize(kept.blob)).toEqual({ width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT })

      const small = await processor.process(
        file,
        DEFAULT_TEXT_SPEC,
        { output: { format: 'image/png', quality: 1 }, fitLongestSide: 800 },
        new AbortController().signal,
      )
      expect(await decodedSize(small.blob)).toEqual({ width: 800, height: 600 })
      expect(outputFileName('no-extension', 'image/jpeg')).toBe('no-extension-watermarked.jpg')

      const aborted = new AbortController()
      aborted.abort()
      await expect(
        processor.process(
          file,
          DEFAULT_TEXT_SPEC,
          { output: { format: 'image/png', quality: 1 }, fitLongestSide: null },
          aborted.signal,
        ),
      ).rejects.toBeInstanceOf(CancelledError)

      await expect(
        processor.process(
          new File(['not an image'], 'notes.txt', { type: 'text/plain' }),
          DEFAULT_TEXT_SPEC,
          { output: { format: 'image/png', quality: 1 }, fitLongestSide: null },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/notes\.txt is not an image/)
    } finally {
      pool.terminate()
    }
  })
})

describe('bulk throughput', () => {
  it(
    `processes ${String(FIXTURES)} fixtures through the queue within budget`,
    async () => {
      const runtime = createBulkRuntime(() => Promise.reject(new Error('no logos')))
      const queue = new JobQueue<File, { blob: Blob }>({
        concurrency: runtime.workers,
        run: (file, signal) =>
          runtime.run(
            file,
            DEFAULT_TEXT_SPEC,
            { output: { format: 'image/jpeg', quality: 0.9 }, fitLongestSide: null },
            signal,
          ),
      })
      try {
        const files = await Promise.all(
          Array.from({ length: FIXTURES }, (_, index) =>
            photoFile(`fixture-${String(index)}.jpg`, index * 17),
          ),
        )
        queue.add(files)
        const started = performance.now()
        const result = await queue.start()
        const seconds = (performance.now() - started) / MILLISECONDS
        const perSecond = FIXTURES / seconds
        console.info(
          `bulk: ${String(FIXTURES)} × ${String(FIXTURE_WIDTH)}×${String(FIXTURE_HEIGHT)} JPEG through ${String(runtime.workers)} workers in ${seconds.toFixed(2)} s = ${perSecond.toFixed(2)} images/s`,
        )
        expect(result.jobs.every((job) => job.status === 'done')).toBe(true)
        expect(perSecond).toBeGreaterThan(MIN_IMAGES_PER_SECOND)
      } finally {
        runtime.dispose()
      }
    },
    BENCHMARK_TIMEOUT_MS,
  )
})
