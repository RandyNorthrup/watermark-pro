import { afterEach, expect, it, vi } from 'vitest'

import { BulkProcessor, type BulkSettings } from './processor'
import { CancelledError } from './queue'
import { createBulkRuntime } from './runtime'
import { IDENTITY_ADJUSTMENTS } from '../../shared/adjustments'
import { EMPTY_PHOTO_METADATA } from '../../shared/metadata'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import * as backend from '../lib/canvas-backend'

const settings: BulkSettings = {
  output: { format: 'image/png', quality: 1 },
  fitLongestSide: null,
  orientation: { turns: 0, flipX: false, flipY: false },
  adjust: IDENTITY_ADJUSTMENTS,
  border: null,
  namePattern: '{name}',
  presetName: 'Selected preset',
}
const input = {
  file: new File(['photo'], 'photo.png', { type: 'image/png' }),
  relativePath: 'photo.png',
  metadata: EMPTY_PHOTO_METADATA,
  override: null,
}
const position = { index: 1, count: 1 }
const loadLogo = () => Promise.reject(new Error('unexpected logo'))

afterEach(() => vi.restoreAllMocks())

it('allocates one pool on the first real job, reuses it, and disposes its engines', async () => {
  const terminate = vi.fn()
  const create = vi.spyOn(backend, 'createEngine').mockImplementation(() => ({
    busy: 0,
    apply: () => Promise.reject(new Error('processor boundary is controlled')),
    terminate,
  }))
  const result = {
    blob: new Blob(['output']),
    fileName: 'photo.png',
    relativePath: 'photo.png',
    width: 1,
    height: 1,
  }
  const process = vi.spyOn(BulkProcessor.prototype, 'process').mockResolvedValue(result)
  const runtime = createBulkRuntime(loadLogo, 2)
  expect(runtime.workers).toBe(2)
  expect(create).not.toHaveBeenCalled()
  const signal = new AbortController().signal
  expect(await runtime.run(input, [DEFAULT_TEXT_SPEC], settings, position, signal)).toBe(result)
  expect(create).toHaveBeenCalledTimes(2)
  expect(process).toHaveBeenCalledWith(input, [DEFAULT_TEXT_SPEC], settings, position, signal)
  await runtime.run(input, [DEFAULT_TEXT_SPEC], settings, position, signal)
  expect(create).toHaveBeenCalledTimes(2)
  runtime.dispose()
  expect(terminate).toHaveBeenCalledTimes(2)
  await expect(runtime.run(input, [DEFAULT_TEXT_SPEC], settings, position, signal)).rejects.toThrow(
    'bulk runtime disposed',
  )
  expect(create).toHaveBeenCalledTimes(2)
})

it('never starts engines for an aborted job or a disposed empty page', async () => {
  const create = vi.spyOn(backend, 'createEngine')
  const runtime = createBulkRuntime(loadLogo, 2)
  const controller = new AbortController()
  controller.abort()
  await expect(
    runtime.run(input, [DEFAULT_TEXT_SPEC], settings, position, controller.signal),
  ).rejects.toBeInstanceOf(CancelledError)
  runtime.dispose()
  await expect(
    runtime.run(input, [DEFAULT_TEXT_SPEC], settings, position, new AbortController().signal),
  ).rejects.toThrow('bulk runtime disposed')
  expect(create).not.toHaveBeenCalled()
  expect(() => createBulkRuntime(loadLogo, 0)).toThrow(RangeError)
})
