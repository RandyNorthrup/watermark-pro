/**
 * Runs in Chromium: the worker pool, the per-file processor and the ZIP
 * builder against the real engine, plus the M5 throughput measurement over
 * a batch of 20 fixtures (PLAN.md §5.5: ≥ 2 images/s with 8 workers).
 */
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { DEFAULT_NAME_PATTERN } from './names'
import { type BatchPosition, type BulkJobInput, BulkProcessor } from './processor'
import { CancelledError, JobQueue } from './queue'
import { createBulkRuntime } from './runtime'
import { defaultPoolSize, MAX_POOL_SIZE, WorkerPool } from './worker-pool'
import { uniqueNames, zipEntries } from './zip'
import { IDENTITY_ADJUSTMENTS } from '../../shared/adjustments'
import { EMPTY_PHOTO_METADATA } from '../../shared/metadata'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { MarkResources } from '../lib/mark-resources'

/** Orientation, adjustments, frame and naming every basic case leaves at the default. */
const BULK_EXTRA = {
  orientation: { turns: 0, flipX: false, flipY: false },
  adjust: IDENTITY_ADJUSTMENTS,
  border: null,
  namePattern: DEFAULT_NAME_PATTERN,
  presetName: 'Test',
} as const

/** No source metadata and a single-photo batch, the shape most cases use. */
const NO_METADATA = EMPTY_PHOTO_METADATA
const FIRST: BatchPosition = { index: 1, count: 1 }

/** A batch job input for one file with no folder path. */
function jobInput(file: File): BulkJobInput {
  return { file, relativePath: file.name, metadata: NO_METADATA, override: null }
}

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

const JPEG_SOI_LENGTH = 2
const EXIF_ORIENTATION_TAG = 0x01_12
const EXIF_ROTATE_90_CLOCKWISE = 6
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0] // "Exif\0\0"

/** Little-endian 16- and 32-bit words for a hand-built TIFF block. */
function word16(value: number): number[] {
  return [value & 0xff, value >> 8]
}
function word32(value: number): number[] {
  return [...word16(value & 0xff_ff), ...word16(value >>> 16)]
}

/**
 * Inserts an APP1 Exif segment carrying only an Orientation tag after the
 * SOI marker, the way a camera or phone tags its files.
 */
function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array<ArrayBuffer> {
  const tiff = [
    0x49,
    0x49, // "II": little-endian
    ...word16(0x2a),
    ...word32(8), // first IFD follows the header
    ...word16(1), // one entry
    ...word16(EXIF_ORIENTATION_TAG),
    ...word16(3), // SHORT
    ...word32(1),
    ...word16(orientation),
    ...word16(0), // value padding
    ...word32(0), // no next IFD
  ]
  const payload = [...EXIF_HEADER, ...tiff]
  const segment = [0xff, 0xe1, ...word16(payload.length + 2).toReversed(), ...payload]
  return new Uint8Array([
    ...jpeg.subarray(0, JPEG_SOI_LENGTH),
    ...segment,
    ...jpeg.subarray(JPEG_SOI_LENGTH),
  ])
}

function hasExifHeader(bytes: Uint8Array): boolean {
  const isHeaderAt = (index: number): boolean =>
    EXIF_HEADER.every((expected, offset) => bytes[index + offset] === expected)
  return bytes.some((_, index) => isHeaderAt(index))
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
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
        jobInput(file),
        [DEFAULT_TEXT_SPEC],
        { output: { format: 'image/webp', quality: 0.8 }, fitLongestSide: null, ...BULK_EXTRA },
        FIRST,
        new AbortController().signal,
      )
      expect(kept.fileName).toBe('holiday-watermarked.webp')
      expect(kept.blob.type).toBe('image/webp')
      expect(await decodedSize(kept.blob)).toEqual({ width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT })

      const small = await processor.process(
        jobInput(file),
        [DEFAULT_TEXT_SPEC],
        { output: { format: 'image/png', quality: 1 }, fitLongestSide: 800, ...BULK_EXTRA },
        FIRST,
        new AbortController().signal,
      )
      expect(await decodedSize(small.blob)).toEqual({ width: 800, height: 600 })

      const aborted = new AbortController()
      aborted.abort()
      await expect(
        processor.process(
          jobInput(file),
          [DEFAULT_TEXT_SPEC],
          { output: { format: 'image/png', quality: 1 }, fitLongestSide: null, ...BULK_EXTRA },
          FIRST,
          aborted.signal,
        ),
      ).rejects.toBeInstanceOf(CancelledError)

      const notImage = jobInput(new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
      await expect(
        processor.process(
          notImage,
          [DEFAULT_TEXT_SPEC],
          { output: { format: 'image/png', quality: 1 }, fitLongestSide: null, ...BULK_EXTRA },
          FIRST,
          new AbortController().signal,
        ),
      ).rejects.toThrow(/notes\.txt is not an image/)
    } finally {
      pool.terminate()
    }
  })

  it('honours the source orientation and writes no metadata to the output', async () => {
    const pool = new WorkerPool(1)
    const processor = new BulkProcessor(
      pool,
      new MarkResources(() => Promise.reject(new Error('no logos'))),
    )
    try {
      const plain = await bytesOf(await photoFile('phone.jpg', 120))
      const tagged = withExifOrientation(plain, EXIF_ROTATE_90_CLOCKWISE)
      expect(hasExifHeader(plain)).toBe(false)
      expect(hasExifHeader(tagged)).toBe(true)
      const file = new File([tagged], 'phone.jpg', { type: 'image/jpeg' })

      const result = await processor.process(
        jobInput(file),
        [DEFAULT_TEXT_SPEC],
        { output: { format: 'image/jpeg', quality: 0.9 }, fitLongestSide: null, ...BULK_EXTRA },
        FIRST,
        new AbortController().signal,
      )
      // The orientation tag was applied to the pixels, so nothing is lost by dropping it.
      expect(await decodedSize(result.blob)).toEqual({
        width: FIXTURE_HEIGHT,
        height: FIXTURE_WIDTH,
      })
      expect(hasExifHeader(await bytesOf(result.blob))).toBe(false)
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
            jobInput(file),
            [DEFAULT_TEXT_SPEC],
            { output: { format: 'image/jpeg', quality: 0.9 }, fitLongestSide: null, ...BULK_EXTRA },
            FIRST,
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
