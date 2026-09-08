/**
 * Main-thread handle on the video transcode worker. One transcode runs at a
 * time; progress is streamed back and a cancel is a message the worker answers
 * with a `CancelledError`. Models `engine/worker-client.ts`.
 */
import { CancelledError } from './errors'
import type { TranscodePlan } from './plan'
import type { CancelRequestMessage, TranscodeStartMessage, VideoWorkerResponse } from './protocol'
import type { FontResource, MarkInput } from '../engine/protocol'

export class VideoTranscodeError extends Error {
  override readonly name = 'VideoTranscodeError'
}

export interface VideoTranscodeInput {
  source: Blob
  /** Resolved marks; each `image` bitmap is transferred to the worker. */
  marks: MarkInput[]
  fonts: FontResource[]
  plan: TranscodePlan
}

export interface VideoTranscodeCallbacks {
  onProgress?: (frames: number, timestampSeconds: number) => void
}

interface Pending {
  id: number
  resolve: (blob: Blob) => void
  reject: (reason: Error) => void
  onProgress: VideoTranscodeCallbacks['onProgress']
}

export class VideoTranscoder {
  readonly #worker: Worker
  #pending: Pending | null = null
  #nextId = 1

  constructor(worker: Worker = createVideoWorker()) {
    this.#worker = worker
    this.#worker.addEventListener('message', (event: MessageEvent<VideoWorkerResponse>) => {
      this.#settle(event.data)
    })
    this.#worker.addEventListener('error', (event) => {
      this.#fail(new VideoTranscodeError(event.message || 'video worker crashed'))
    })
  }

  #settle(response: VideoWorkerResponse): void {
    const pending = this.#pending
    if (pending === null) {
      return
    }
    if (pending.id !== response.id) {
      return
    }
    switch (response.type) {
      case 'progress': {
        pending.onProgress?.(response.frames, response.timestamp)
        break
      }
      case 'done': {
        this.#pending = null
        pending.resolve(response.blob)
        break
      }
      case 'cancelled': {
        this.#pending = null
        pending.reject(new CancelledError())
        break
      }
      case 'failed': {
        this.#pending = null
        pending.reject(new VideoTranscodeError(response.message))
        break
      }
    }
  }

  #fail(error: Error): void {
    const pending = this.#pending
    if (pending === null) {
      return
    }
    this.#pending = null
    pending.reject(error)
  }

  get busy(): boolean {
    return this.#pending !== null
  }

  /** Starts one transcode; rejects if another is already running. */
  transcode(input: VideoTranscodeInput, callbacks: VideoTranscodeCallbacks = {}): Promise<Blob> {
    if (this.#pending !== null) {
      return Promise.reject(new VideoTranscodeError('a transcode is already running'))
    }
    const id = this.#nextId
    this.#nextId += 1
    const message: TranscodeStartMessage = { type: 'transcode', id, ...input }
    const transfer: Transferable[] = input.marks.flatMap((mark) =>
      mark.image === undefined ? [] : [mark.image],
    )
    return new Promise<Blob>((resolve, reject) => {
      this.#pending = { id, resolve, reject, onProgress: callbacks.onProgress }
      this.#worker.postMessage(message, transfer)
    })
  }

  /** Asks the worker to stop; the running transcode rejects with a `CancelledError`. */
  cancel(): void {
    const pending = this.#pending
    if (pending === null) {
      return
    }
    const message: CancelRequestMessage = { type: 'cancel', id: pending.id }
    this.#worker.postMessage(message)
  }

  terminate(): void {
    this.#worker.terminate()
    this.#fail(new VideoTranscodeError('video transcoder terminated'))
  }
}

export function createVideoWorker(): Worker {
  return new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
}
