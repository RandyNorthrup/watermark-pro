import { afterEach, describe, expect, it, vi } from 'vitest'

import { CancelledError } from './errors'
import type { VideoWorkerRequest, VideoWorkerResponse } from './protocol'
import { VideoTranscoder, VideoTranscodeError, type VideoTranscodeInput } from './worker-client'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

class WorkerBoundary extends EventTarget {
  readonly messages: { message: VideoWorkerRequest; transfer: Transferable[] }[] = []
  isTerminated = false

  postMessage(message: VideoWorkerRequest, transfer: Transferable[] = []): void {
    this.messages.push({ message, transfer })
  }

  terminate(): void {
    this.isTerminated = true
  }

  respond(response: VideoWorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: response }))
  }

  crash(message: string): void {
    this.dispatchEvent(new ErrorEvent('error', { message }))
  }
}

function input(): VideoTranscodeInput {
  return {
    source: new Blob(['source video']),
    marks: [{ spec: DEFAULT_TEXT_SPEC }],
    fonts: [],
    plan: {
      videoCodec: 'avc',
      container: 'mp4',
      bitrate: 100_000,
      output: { width: 320, height: 240 },
      audio: { mode: 'none' },
    },
  }
}

function fixture() {
  const worker = new WorkerBoundary()
  return { worker, client: new VideoTranscoder(worker as unknown as Worker) }
}

afterEach(() => vi.unstubAllGlobals())

describe('video worker client lifecycle', () => {
  it('constructs the module worker and terminates its actual handle', () => {
    const created: { url: URL; options: WorkerOptions | undefined; worker: WorkerBoundary }[] = []
    class ConstructorBoundary extends WorkerBoundary {
      constructor(url: URL, options?: WorkerOptions) {
        super()
        created.push({ url, options, worker: this })
      }
    }
    vi.stubGlobal('Worker', ConstructorBoundary)
    const client = new VideoTranscoder()
    expect(created).toHaveLength(1)
    expect(created[0]?.url.pathname).toMatch(/\/video\/worker\.ts$/)
    expect(created[0]?.options).toEqual({ type: 'module' })
    client.terminate()
    expect(created[0]?.worker.isTerminated).toBe(true)
  })

  it('transfers image marks, streams matching progress, and ignores stale results', async () => {
    const { worker, client } = fixture()
    const image = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap
    const request = input()
    request.marks.push({ spec: DEFAULT_TEXT_SPEC, image })
    const onProgress = vi.fn()
    const pending = client.transcode(request, { onProgress })
    expect(client.busy).toBe(true)
    expect(worker.messages).toEqual([
      { message: { type: 'transcode', id: 1, ...request }, transfer: [image] },
    ])
    worker.respond({ type: 'progress', id: 99, frames: 90, timestamp: 3 })
    worker.respond({ type: 'done', id: 99, blob: new Blob(['stale']) })
    expect(onProgress).not.toHaveBeenCalled()
    expect(client.busy).toBe(true)
    worker.respond({ type: 'progress', id: 1, frames: 30, timestamp: 1 })
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(30, 1)
    const output = new Blob(['encoded result'])
    worker.respond({ type: 'done', id: 1, blob: output })
    await expect(pending).resolves.toBe(output)
    expect(client.busy).toBe(false)
    worker.respond({ type: 'failed', id: 1, message: 'late failure' })
    expect(client.busy).toBe(false)
  })

  it('refuses overlapping work without posting it and accepts a later job with a new id', async () => {
    const { worker, client } = fixture()
    const first = client.transcode(input())
    await expect(client.transcode(input())).rejects.toThrow('already running')
    expect(worker.messages).toHaveLength(1)
    worker.respond({ type: 'done', id: 1, blob: new Blob(['first']) })
    await first
    const second = client.transcode(input())
    expect(worker.messages[1]?.message.id).toBe(2)
    worker.respond({ type: 'progress', id: 2, frames: 10, timestamp: 0.5 })
    worker.respond({ type: 'failed', id: 1, message: 'old request failure' })
    expect(client.busy).toBe(true)
    worker.respond({ type: 'failed', id: 2, message: 'unsupported source' })
    await expect(second).rejects.toThrow(new VideoTranscodeError('unsupported source'))
    expect(client.busy).toBe(false)
  })

  it('cancels only active work and waits for the worker cancellation acknowledgement', async () => {
    const { worker, client } = fixture()
    client.cancel()
    expect(worker.messages).toHaveLength(0)
    const pending = client.transcode(input())
    client.cancel()
    expect(worker.messages[1]?.message).toEqual({ type: 'cancel', id: 1 })
    expect(client.busy).toBe(true)
    worker.respond({ type: 'cancelled', id: 1 })
    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(client.busy).toBe(false)
    client.cancel()
    expect(worker.messages).toHaveLength(2)
  })

  it.each([
    ['decoder crashed', 'decoder crashed'],
    ['', 'video worker crashed'],
  ])('rejects pending work after worker crash %j', async (message, expected) => {
    const { worker, client } = fixture()
    worker.crash(message)
    const pending = client.transcode(input())
    worker.crash(message)
    await expect(pending).rejects.toThrow(new VideoTranscodeError(expected))
    expect(client.busy).toBe(false)
  })

  it('rejects pending work and terminates the worker during disposal', async () => {
    const { worker, client } = fixture()
    const pending = client.transcode(input())
    client.terminate()
    await expect(pending).rejects.toThrow(new VideoTranscodeError('video transcoder terminated'))
    expect(client.busy).toBe(false)
    expect(worker.isTerminated).toBe(true)
  })

  it('releases a job after a message transfer fails so the next request can run', async () => {
    const { worker, client } = fixture()
    const cause = new DOMException('Image bitmap was already transferred', 'DataCloneError')
    vi.spyOn(worker, 'postMessage').mockImplementationOnce(() => {
      throw cause
    })
    let failure: unknown
    try {
      await client.transcode(input())
    } catch (error) {
      failure = error
    }
    expect(client.busy).toBe(false)
    expect(failure).toMatchObject({
      name: 'VideoTranscodeError',
      cause,
    })
    const next = client.transcode(input())
    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]?.message.id).toBe(2)
    worker.respond({ type: 'done', id: 2, blob: new Blob(['retry result']) })
    await expect(next).resolves.toBeInstanceOf(Blob)
    expect(client.busy).toBe(false)
  })

  it('rejects starts after disposal before posting to the terminated worker', async () => {
    const { worker, client } = fixture()
    client.terminate()
    const pending = client.transcode(input())
    expect(worker.messages).toHaveLength(0)
    expect(client.busy).toBe(false)
    await expect(pending).rejects.toThrow(new VideoTranscodeError('video transcoder terminated'))
  })
})
