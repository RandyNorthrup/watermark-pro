/**
 * Main-thread handle on one watermark worker. Requests are correlated by id;
 * bitmaps are transferred, not copied.
 */
import {
  type ApplyInput,
  type ApplyOutput,
  closeInputBitmaps,
  type WatermarkEngine,
} from './engine'
import type { ApplyMessage, WorkerResponse } from './protocol'

export class WatermarkWorkerError extends Error {
  override readonly name = 'WatermarkWorkerError'
}

interface Pending {
  resolve: (value: ApplyOutput) => void
  reject: (reason: Error) => void
}

export class WatermarkWorker implements WatermarkEngine {
  readonly #worker: Worker
  readonly #pending = new Map<number, Pending>()
  #nextId = 1
  #failure: WatermarkWorkerError | null = null

  constructor(worker: Worker = createEngineWorker()) {
    this.#worker = worker
    this.#worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.#settle(event.data)
    })
    this.#worker.addEventListener('error', (event) => {
      this.#stop(new WatermarkWorkerError(event.message || 'watermark worker crashed'))
    })
  }

  #settle(response: WorkerResponse): void {
    const pending = this.#pending.get(response.id)
    if (pending === undefined) {
      return
    }
    this.#pending.delete(response.id)
    if (response.type === 'done') {
      const { type: _type, id: _id, ...output } = response
      pending.resolve(output)
    } else {
      pending.reject(new WatermarkWorkerError(response.message))
    }
  }

  #stop(failure: WatermarkWorkerError): void {
    if (this.#failure !== null) return
    this.#failure = failure
    this.#worker.terminate()
    for (const pending of this.#pending.values()) {
      pending.reject(failure)
    }
    this.#pending.clear()
  }

  get busy(): number {
    return this.#pending.size
  }

  apply(input: ApplyInput): Promise<ApplyOutput> {
    if (this.#failure !== null) {
      closeInputBitmaps(input)
      return Promise.reject(this.#failure)
    }
    const id = this.#nextId
    this.#nextId += 1
    const message: ApplyMessage = { type: 'apply', id, ...input }
    const transfer: Transferable[] = [
      input.source,
      ...input.marks.flatMap((mark) => (mark.image === undefined ? [] : [mark.image])),
    ]
    return new Promise<ApplyOutput>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      try {
        this.#worker.postMessage(message, transfer)
      } catch (error) {
        this.#pending.delete(id)
        // A refused transfer leaves the inputs owned by this engine, while
        // successfully posted inputs must only be released inside the worker.
        closeInputBitmaps(input)
        reject(
          new WatermarkWorkerError('watermark worker could not receive the request', {
            cause: error,
          }),
        )
      }
    })
  }

  terminate(): void {
    this.#stop(new WatermarkWorkerError('watermark worker terminated'))
  }
}

export function createEngineWorker(): Worker {
  return new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
}
