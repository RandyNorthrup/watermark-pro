/**
 * Everything the bulk page needs at runtime, behind one factory so page
 * tests can swap in a fake: the worker pool, resource resolution, and the
 * per-file processor.
 */
import { BulkProcessor, type BulkResult, type BulkSettings } from './processor'
import { defaultPoolSize, WorkerPool } from './worker-pool'
import type { WatermarkSpec } from '../../shared/watermark'
import { hasOffscreenCanvas } from '../lib/canvas-backend'
import { type LogoLoader, MarkResources } from '../lib/mark-resources'

export interface BulkRuntime {
  /** Number of engine workers; the queue runs this many jobs at once. */
  workers: number
  run(
    file: File,
    specs: readonly WatermarkSpec[],
    settings: BulkSettings,
    signal: AbortSignal,
  ): Promise<BulkResult>
  dispose(): void
}

/** Parallel workers where workers can draw; one main-thread engine otherwise. */
export function runtimePoolSize(): number {
  return hasOffscreenCanvas() ? defaultPoolSize() : 1
}

export function createBulkRuntime(loadLogo: LogoLoader, workers = runtimePoolSize()): BulkRuntime {
  const pool = new WorkerPool(workers)
  const resources = new MarkResources(loadLogo)
  const processor = new BulkProcessor(pool, resources)
  return {
    workers,
    run: (file, specs, settings, signal) => processor.process(file, specs, settings, signal),
    dispose: () => {
      pool.terminate()
      resources.clear()
    },
  }
}
