/**
 * A fixed set of engine workers handed out round-robin. Each worker caches
 * fonts independently, so the pool warms up over the first few images and
 * then runs fully parallel.
 */
import { type ApplyInput, type ApplyOutput, WatermarkWorker } from '../engine/worker-client'

/** Leave one core for the page; never more than eight workers. */
export const MAX_POOL_SIZE = 8

export function defaultPoolSize(hardwareConcurrency = navigator.hardwareConcurrency): number {
  const cores =
    Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : 2
  return Math.max(1, Math.min(MAX_POOL_SIZE, cores - 1))
}

export class WorkerPool {
  readonly #workers: WatermarkWorker[]
  #next = 0

  constructor(size: number, create: () => WatermarkWorker = () => new WatermarkWorker()) {
    if (!Number.isSafeInteger(size) || size < 1) {
      throw new RangeError('pool size must be a positive integer')
    }
    this.#workers = Array.from({ length: size }, () => create())
  }

  /** The least-loaded worker, ties broken round-robin. */
  #pick(): WatermarkWorker {
    let chosen = this.#workers[this.#next % this.#workers.length]
    for (const worker of this.#workers) {
      if (chosen === undefined || worker.busy < chosen.busy) {
        chosen = worker
      }
    }
    this.#next += 1
    if (chosen === undefined) {
      throw new Error('worker pool is empty')
    }
    return chosen
  }

  get size(): number {
    return this.#workers.length
  }

  apply(input: ApplyInput): Promise<ApplyOutput> {
    return this.#pick().apply(input)
  }

  terminate(): void {
    for (const worker of this.#workers) {
      worker.terminate()
    }
  }
}
