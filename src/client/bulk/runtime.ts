/**
 * Everything the bulk page needs at runtime, behind one factory so page
 * tests can swap in a fake: the worker pool, resource resolution, and the
 * per-file processor.
 */
import { BulkProcessor, type BulkResult, type BulkSettings } from './processor'
import { defaultPoolSize, WorkerPool } from './worker-pool'
import type { WatermarkSpec } from '../../shared/watermark'
import { type LogoLoader, MarkResources } from '../lib/mark-resources'

export interface BulkRuntime {
  /** Number of engine workers; the queue runs this many jobs at once. */
  workers: number
  run(
    file: File,
    spec: WatermarkSpec,
    settings: BulkSettings,
    signal: AbortSignal,
  ): Promise<BulkResult>
  dispose(): void
}

export function createBulkRuntime(loadLogo: LogoLoader, workers = defaultPoolSize()): BulkRuntime {
  const pool = new WorkerPool(workers)
  const resources = new MarkResources(loadLogo)
  const processor = new BulkProcessor(pool, resources)
  return {
    workers,
    run: (file, spec, settings, signal) => processor.process(file, spec, settings, signal),
    dispose: () => {
      pool.terminate()
      resources.clear()
    },
  }
}
