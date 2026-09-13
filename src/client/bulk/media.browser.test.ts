import { PDFDocument } from 'pdf-lib'
import { expect, it } from 'vitest'

import { collectMedia } from './folders'
import type { BulkJobInput, BulkResult, BulkSettings } from './processor'
import { JobQueue } from './queue'
import { createBulkRuntime } from './runtime'
import { IDENTITY_ADJUSTMENTS } from '../../shared/adjustments'
import { EMPTY_PHOTO_METADATA } from '../../shared/metadata'
import { DEFAULT_SHAPE_SPEC } from '../../shared/watermark'
import { probeVideo } from '../video/probe'
import { encodeTestClip } from '../video/test-support/clip'

it('processes a mixed folder through real exporters and reports an invalid PDF without losing other results', async () => {
  const canvas = new OffscreenCanvas(128, 96)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Missing fixture canvas')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const image = new File([await canvas.convertToBlob({ type: 'image/png' })], 'photo.png', {
    type: 'image/png',
  })
  const pdf = await PDFDocument.create()
  pdf.addPage([300, 400])
  const document = new File([Uint8Array.from(await pdf.save())], 'report.pdf', {
    type: 'application/pdf',
  })
  const clip = await encodeTestClip()
  const video = new File([clip.blob], 'clip.mp4', { type: 'video/mp4' })
  const invalid = new File(['broken'], 'bad.pdf', { type: 'application/pdf' })
  const scan = collectMedia([
    image,
    document,
    video,
    invalid,
    new File(['notes'], 'notes.txt', { type: 'text/plain' }),
  ])
  expect(scan.files).toHaveLength(4)
  expect(scan.skipped).toBe(1)
  const runtime = createBulkRuntime(() => Promise.reject(new Error('Unexpected logo')), 2)
  const settings: BulkSettings = {
    output: { format: 'image/png', quality: 1 },
    orientation: { turns: 0, flipX: false, flipY: false },
    adjust: IDENTITY_ADJUSTMENTS,
    border: null,
    fitLongestSide: null,
    namePattern: '{name}-marked',
    presetName: 'Shape',
  }
  const queue = new JobQueue<BulkJobInput, BulkResult>({
    concurrency: 2,
    run: async (input, signal) =>
      await runtime.run(input, [DEFAULT_SHAPE_SPEC], settings, { index: 1, count: 4 }, signal),
  })
  try {
    queue.add(
      scan.files.map((entry) => ({ ...entry, metadata: EMPTY_PHOTO_METADATA, override: null })),
    )
    const result = await queue.start(1)
    expect(result.jobs.map((job) => job.status)).toEqual(['done', 'done', 'done', 'failed'])
    const photoResult = result.jobs[0]?.output
    const documentResult = result.jobs[1]?.output
    const videoResult = result.jobs[2]?.output
    if (
      photoResult === undefined ||
      photoResult === null ||
      documentResult === undefined ||
      documentResult === null ||
      videoResult === undefined ||
      videoResult === null
    )
      throw new Error('Missing completed media output')
    expect(photoResult.blob.type).toBe('image/png')
    expect(photoResult.width).toBe(128)
    expect(photoResult.height).toBe(96)
    expect(documentResult.blob.type).toBe('application/pdf')
    expect(documentResult.width).toBeNull()
    const exportedDocument = await PDFDocument.load(await documentResult.blob.arrayBuffer())
    const exportedVideo = await probeVideo(new File([videoResult.blob], videoResult.fileName))
    expect(exportedDocument.getPageCount()).toBe(1)
    expect(exportedVideo.durationSeconds).toBeCloseTo(1, 1)
    expect(result.jobs[3]?.error).not.toBeNull()
  } finally {
    queue.cancel()
    runtime.dispose()
  }
}, 30_000)
