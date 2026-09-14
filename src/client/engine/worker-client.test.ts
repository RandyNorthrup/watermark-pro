import { describe, expect, it, vi } from 'vitest'

import type { WorkerRequest, WorkerResponse } from './protocol'
import { WatermarkWorker, WatermarkWorkerError } from './worker-client'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

/** Stand-in for a Worker: records posted messages and lets tests answer. */
class FakeWorker extends EventTarget {
  readonly posted: WorkerRequest[] = []
  readonly transfers: Transferable[][] = []
  isTerminated = false
  terminationCount = 0
  postFailure: Error | null = null

  postMessage(message: WorkerRequest, transfer: Transferable[]): void {
    if (this.postFailure !== null) throw this.postFailure
    this.posted.push(message)
    this.transfers.push(transfer)
  }

  terminate(): void {
    this.isTerminated = true
    this.terminationCount += 1
  }

  respond(response: WorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: response }))
  }

  crash(message: string): void {
    this.dispatchEvent(new ErrorEvent('error', { message }))
  }
}

function noop(): void {
  // Nothing to release on a fake bitmap.
}

const fakeBitmap = { width: 1, height: 1, close: noop } as unknown as ImageBitmap

function input() {
  return {
    source: fakeBitmap,
    marks: [{ spec: DEFAULT_TEXT_SPEC }],
    fonts: [],
    output: { format: 'image/png' as const, quality: 1 },
  }
}

function ownedInput() {
  const closeSource = vi.fn()
  const closeImage = vi.fn()
  const source = { width: 1, height: 1, close: closeSource } as unknown as ImageBitmap
  const image = { width: 1, height: 1, close: closeImage } as unknown as ImageBitmap
  return {
    value: {
      ...input(),
      source,
      marks: [{ spec: DEFAULT_TEXT_SPEC }, { spec: DEFAULT_TEXT_SPEC, image }],
    },
    closeSource,
    closeImage,
    source,
    image,
  }
}

describe('WatermarkWorker', () => {
  it.each(['crash', 'terminate'] as const)(
    'refuses later work immediately after an early %s and releases untransferred bitmaps',
    async (event) => {
      const fake = new FakeWorker()
      const client = new WatermarkWorker(fake as unknown as Worker)
      if (event === 'crash') fake.crash('early crash')
      else client.terminate()
      const incoming = ownedInput()
      const rejected = vi.fn()
      void client.apply(incoming.value).catch(rejected)
      await Promise.resolve()
      expect(rejected).toHaveBeenCalledOnce()
      expect(rejected.mock.calls[0]?.[0]).toBeInstanceOf(WatermarkWorkerError)
      expect(fake.posted).toHaveLength(0)
      expect(client.busy).toBe(0)
      expect(incoming.closeSource).toHaveBeenCalledOnce()
      expect(incoming.closeImage).toHaveBeenCalledOnce()
      client.terminate()
      fake.crash('later crash')
      expect(fake.terminationCount).toBe(1)
    },
  )

  it('rejects all transferred work on a crash without closing detached sender bitmaps or accepting stale results', async () => {
    const fake = new FakeWorker()
    const client = new WatermarkWorker(fake as unknown as Worker)
    const firstInput = ownedInput()
    const secondInput = ownedInput()
    const first = client.apply(firstInput.value)
    const second = client.apply(secondInput.value)
    expect(fake.transfers).toEqual([
      [firstInput.source, firstInput.image],
      [secondInput.source, secondInput.image],
    ])
    fake.crash('')
    await expect(first).rejects.toThrow('watermark worker crashed')
    await expect(second).rejects.toThrow('watermark worker crashed')
    fake.respond({ type: 'failed', id: 1, message: 'stale reply' })
    expect(client.busy).toBe(0)
    expect(fake.isTerminated).toBe(true)
    for (const bitmapInput of [firstInput, secondInput]) {
      expect(bitmapInput.closeSource).not.toHaveBeenCalled()
      expect(bitmapInput.closeImage).not.toHaveBeenCalled()
    }
  })

  it('removes a synchronously refused post and closes its inputs while other requests and later posts remain usable', async () => {
    const fake = new FakeWorker()
    const client = new WatermarkWorker(fake as unknown as Worker)
    const inFlightInput = ownedInput()
    const inFlight = client.apply(inFlightInput.value)
    const refused = ownedInput()
    fake.postFailure = new DOMException('fixture cannot be cloned', 'DataCloneError')
    await expect(client.apply(refused.value)).rejects.toMatchObject({
      name: 'WatermarkWorkerError',
      cause: fake.postFailure,
    })
    expect(client.busy).toBe(1)
    expect(refused.closeSource).toHaveBeenCalledOnce()
    expect(refused.closeImage).toHaveBeenCalledOnce()
    expect(inFlightInput.closeSource).not.toHaveBeenCalled()
    expect(inFlightInput.closeImage).not.toHaveBeenCalled()
    fake.postFailure = null
    const later = client.apply(input())
    expect(fake.posted.map((message) => message.id)).toEqual([1, 3])
    fake.respond({ type: 'done', id: 3, blob: new Blob(['later']), width: 1, height: 2, marks: [] })
    await expect(later).resolves.toMatchObject({ width: 1, height: 2 })
    fake.respond({ type: 'done', id: 1, blob: new Blob(['first']), width: 3, height: 4, marks: [] })
    await expect(inFlight).resolves.toMatchObject({ width: 3, height: 4 })
    expect(client.busy).toBe(0)
    expect(fake.isTerminated).toBe(false)
  })

  it('correlates responses by id and ignores unknown ids', async () => {
    const fake = new FakeWorker()
    const client = new WatermarkWorker(fake as unknown as Worker)
    const first = client.apply(input())
    const second = client.apply(input())
    expect(client.busy).toBe(2)
    fake.respond({
      type: 'done',
      id: 999,
      blob: new Blob(),
      width: 1,
      height: 1,
      marks: [
        {
          placement: { centreX: 0, centreY: 0, anchor: null, width: 1, height: 1, rotation: 0 },
          contrast: { variant: 'dark', fill: '#0f172a', outline: 0, isAuto: true },
        },
      ],
    })
    expect(client.busy).toBe(2)
    fake.respond({ type: 'failed', id: 2, message: 'boom' })
    await expect(second).rejects.toThrow(WatermarkWorkerError)
    fake.respond({
      type: 'done',
      id: 1,
      blob: new Blob(),
      width: 3,
      height: 4,
      marks: [
        {
          placement: { centreX: 1, centreY: 2, anchor: 'center', width: 1, height: 1, rotation: 0 },
          contrast: { variant: 'light', fill: '#f8fafc', outline: 0.5, isAuto: false },
        },
      ],
    })
    await expect(first).resolves.toMatchObject({
      width: 3,
      height: 4,
      marks: [{ placement: { anchor: 'center' } }],
    })
    expect(client.busy).toBe(0)
  })

  it('rejects everything in flight when the worker crashes', async () => {
    const fake = new FakeWorker()
    const client = new WatermarkWorker(fake as unknown as Worker)
    const pending = client.apply(input())
    fake.crash('out of memory')
    await expect(pending).rejects.toThrow('out of memory')
    expect(client.busy).toBe(0)
  })

  it('terminates the underlying worker', () => {
    const fake = new FakeWorker()
    const client = new WatermarkWorker(fake as unknown as Worker)
    client.terminate()
    expect(fake.isTerminated).toBe(true)
  })
})
