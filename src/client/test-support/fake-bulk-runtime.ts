import type { WatermarkSpec } from '../../shared/watermark'
import { type BulkResult, type BulkSettings, outputFileName } from '../bulk/processor'
import { CancelledError } from '../bulk/queue'
import type { BulkRuntime } from '../bulk/runtime'

/**
 * Replacement for `bulk/runtime` in jsdom. Jobs resolve on the next macrotask
 * unless the file name says otherwise: `fail-*` rejects, `slow-*` waits for
 * the abort signal or `releaseSlow()`.
 */
export const runs: { name: string; specs: readonly WatermarkSpec[]; settings: BulkSettings }[] = []
export const disposed = { count: 0 }
const slowReleases: (() => void)[] = []

export function releaseSlow(): void {
  for (const release of slowReleases.splice(0)) {
    release()
  }
}

export function resetFakeBulkRuntime(): void {
  runs.length = 0
  disposed.count = 0
  slowReleases.length = 0
}

const FAKE_WORKERS = 2

export function createBulkRuntime(): BulkRuntime {
  return {
    workers: FAKE_WORKERS,
    run(file, specs, settings, signal) {
      runs.push({ name: file.name, specs, settings })
      return new Promise<BulkResult>((resolve, reject) => {
        const finish = () => {
          resolve({
            blob: new Blob([`out:${file.name}`], { type: settings.output.format }),
            fileName: outputFileName(file.name, settings.output.format),
            width: 100,
            height: 50,
          })
        }
        if (file.name.startsWith('fail-')) {
          setTimeout(() => {
            reject(new Error(`cannot decode ${file.name}`))
          }, 0)
        } else if (file.name.startsWith('slow-')) {
          slowReleases.push(finish)
          signal.addEventListener('abort', () => {
            reject(new CancelledError())
          })
        } else {
          setTimeout(finish, 0)
        }
      })
    },
    dispose() {
      disposed.count += 1
    },
  }
}
