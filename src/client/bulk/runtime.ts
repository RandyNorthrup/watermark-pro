/**
 * Everything the bulk page needs at runtime, behind one factory so page
 * tests can swap in a fake: the worker pool, resource resolution, and the
 * per-file processor.
 */
import {
  type BatchPosition,
  type BulkJobInput,
  BulkProcessor,
  type BulkResult,
  type BulkSettings,
} from './processor'
import { CancelledError } from './queue'
import { defaultPoolSize, WorkerPool } from './worker-pool'
import type { WatermarkSpec } from '../../shared/watermark'
import { hasOffscreenCanvas } from '../lib/canvas-backend'
import { type LogoLoader, MarkResources } from '../lib/mark-resources'

export interface BulkRuntime {
  /** Number of engine workers; the queue runs this many jobs at once. */
  workers: number
  run(
    input: BulkJobInput,
    specs: readonly WatermarkSpec[],
    settings: BulkSettings,
    position: BatchPosition,
    signal: AbortSignal,
  ): Promise<BulkResult>
  dispose(): void
}

/** Parallel workers where workers can draw; one main-thread engine otherwise. */
export function runtimePoolSize(): number {
  return hasOffscreenCanvas() ? defaultPoolSize() : 1
}

export function createBulkRuntime(loadLogo: LogoLoader, workers = runtimePoolSize()): BulkRuntime {
  if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new RangeError('pool size must be a positive integer')
  }
  let pool: WorkerPool | null = null
  const resources = new MarkResources(loadLogo)
  let processor: BulkProcessor | null = null
  let isDisposed = false
  return {
    workers,
    run: async (input, specs, settings, position, signal) => {
      if (isDisposed) throw new Error('bulk runtime disposed')
      if (signal.aborted) throw new CancelledError()
      // Browsing the empty tool needs its queue, but no rendering engines.
      // The first job creates the shared pool synchronously before yielding.
      if (processor === null) {
        pool = new WorkerPool(workers)
        processor = new BulkProcessor(pool, resources)
      }
      return await processor.process(input, specs, settings, position, signal)
    },
    dispose: () => {
      isDisposed = true
      pool?.terminate()
      pool = null
      processor = null
      resources.clear()
    },
  }
}
