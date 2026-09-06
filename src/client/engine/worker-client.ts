/**
 * Main-thread handle on one watermark worker. Requests are correlated by id;
 * bitmaps are transferred, not copied.
 */
import type { ApplyDoneMessage, ApplyMessage, WorkerResponse } from './protocol'

export type ApplyInput = Omit<ApplyMessage, 'type' | 'id'>
export type ApplyOutput = Omit<ApplyDoneMessage, 'type' | 'id'>

export class WatermarkWorkerError extends Error {
  override readonly name = 'WatermarkWorkerError'
}

interface Pending {
  resolve: (value: ApplyOutput) => void
  reject: (reason: Error) => void
}

export class WatermarkWorker {
  readonly #worker: Worker
  readonly #pending = new Map<number, Pending>()
  #nextId = 1

  constructor(worker: Worker = createEngineWorker()) {
    this.#worker = worker
    this.#worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.#settle(event.data)
    })
    this.#worker.addEventListener('error', (event) => {
      const failure = new WatermarkWorkerError(event.message || 'watermark worker crashed')
      for (const pending of this.#pending.values()) {
        pending.reject(failure)
      }
      this.#pending.clear()
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

  /** Number of requests in flight. */
  get busy(): number {
    return this.#pending.size
  }

  apply(input: ApplyInput): Promise<ApplyOutput> {
    const id = this.#nextId
    this.#nextId += 1
    const message: ApplyMessage = { type: 'apply', id, ...input }
    const transfer: Transferable[] = [input.source]
    if (input.image !== undefined) {
      transfer.push(input.image)
    }
    return new Promise<ApplyOutput>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#worker.postMessage(message, transfer)
    })
  }

  terminate(): void {
    this.#worker.terminate()
    const failure = new WatermarkWorkerError('watermark worker terminated')
    for (const pending of this.#pending.values()) {
      pending.reject(failure)
    }
    this.#pending.clear()
  }
}

export function createEngineWorker(): Worker {
  return new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
}
