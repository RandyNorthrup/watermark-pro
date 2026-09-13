import type { WatermarkSpec } from '../../shared/watermark'
import { bulkMediaKind } from '../bulk/media-kind'
import { resolveNamePattern } from '../bulk/names'
import {
  extensionFor,
  type BulkJobInput,
  type BulkResult,
  type BulkSettings,
} from '../bulk/processor'
import { CancelledError } from '../bulk/queue'
import type { BulkRuntime } from '../bulk/runtime'
import { baseName } from '../lib/spec-tokens'

interface RunRecord {
  name: string
  relativePath: string
  specs: readonly WatermarkSpec[]
  settings: BulkSettings
  override: BulkJobInput['override']
  index: number
  count: number
}

/**
 * Replacement for `bulk/runtime` in jsdom. Jobs resolve on the next macrotask
 * unless the file name says otherwise: `fail-*` rejects, `slow-*` waits for
 * the abort signal or `releaseSlow()`.
 */
export const runs: RunRecord[] = []
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
const FAKE_WIDTH = 100
const FAKE_HEIGHT = 50

export function createBulkRuntime(): BulkRuntime {
  return {
    workers: FAKE_WORKERS,
    run(input, specs, settings, position, signal) {
      runs.push({
        name: input.file.name,
        relativePath: input.relativePath,
        specs,
        settings,
        override: input.override,
        index: position.index,
        count: position.count,
      })
      const name = resolveNamePattern(settings.namePattern, {
        name: baseName(input.file.name),
        index: position.index,
        count: position.count,
        date: new Date(input.file.lastModified),
        preset: settings.presetName,
        width: FAKE_WIDTH,
        height: FAKE_HEIGHT,
      })
      const media = bulkMediaKind(input.file)
      let format: string = settings.output.format
      let extension = extensionFor(settings.output.format)
      if (media === 'document') {
        format = 'application/pdf'
        extension = 'pdf'
      } else if (media === 'video') {
        format = 'video/mp4'
        extension = 'mp4'
      }
      const fileName = `${name}.${extension}`
      const hasDimensions = media !== 'document' && !input.file.name.startsWith('dimensionless-')
      return new Promise<BulkResult>((resolve, reject) => {
        const finish = () => {
          resolve({
            blob: new Blob([`out:${input.file.name}`], { type: format }),
            fileName,
            relativePath: input.relativePath,
            width: hasDimensions ? FAKE_WIDTH : null,
            height: hasDimensions ? FAKE_HEIGHT : null,
          })
        }
        if (input.file.name.startsWith('fail-')) {
          setTimeout(() => {
            reject(new Error(`cannot decode ${input.file.name}`))
          }, 0)
        } else if (input.file.name.startsWith('slow-')) {
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
