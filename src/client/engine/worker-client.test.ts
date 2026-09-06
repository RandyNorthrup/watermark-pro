import { describe, expect, it } from 'vitest'

import type { WorkerRequest, WorkerResponse } from './protocol'
import { WatermarkWorker, WatermarkWorkerError } from './worker-client'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

/** Stand-in for a Worker: records posted messages and lets tests answer. */
class FakeWorker extends EventTarget {
  readonly posted: WorkerRequest[] = []
  isTerminated = false

  postMessage(message: WorkerRequest): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.isTerminated = true
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
    spec: DEFAULT_TEXT_SPEC,
    fonts: [],
    output: { format: 'image/png' as const, quality: 1 },
  }
}

describe('WatermarkWorker', () => {
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
      placement: { centreX: 0, centreY: 0, anchor: null, width: 1, height: 1, rotation: 0 },
      contrast: { variant: 'dark', outline: 0, isAuto: true },
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
      placement: { centreX: 1, centreY: 2, anchor: 'center', width: 1, height: 1, rotation: 0 },
      contrast: { variant: 'light', outline: 0.5, isAuto: false },
    })
    await expect(first).resolves.toMatchObject({
      width: 3,
      height: 4,
      placement: { anchor: 'center' },
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
