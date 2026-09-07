import { useCallback, useEffect, useRef, useState } from 'react'

import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkResult, BulkSettings } from '../../bulk/processor'
import { JobQueue, type QueueSnapshot } from '../../bulk/queue'
import { type BulkRuntime, createBulkRuntime } from '../../bulk/runtime'
import { apiRequest } from '../../lib/api'
import { assetFileUrl } from '../../lib/library'
import { readPhotoMetadata } from '../../lib/photo-metadata'

export type BulkSnapshot = QueueSnapshot<File, BulkResult>

const EMPTY: BulkSnapshot = { jobs: [], isRunning: false, isSettled: false }

/**
 * Owns the worker runtime and a job queue for the page's lifetime. The
 * queue's runner reads the spec and settings from refs so a job started
 * after a settings change uses the latest values.
 */
export function useBulkQueue(organizationId: string) {
  const runtimeRef = useRef<BulkRuntime | null>(null)
  const queueRef = useRef<JobQueue<File, BulkResult> | null>(null)
  const specsRef = useRef<readonly WatermarkSpec[] | null>(null)
  const settingsRef = useRef<BulkSettings | null>(null)
  // Submission order of every file added, for the `{index}` / `{count}` tokens.
  const filesRef = useRef<File[]>([])
  const [snapshot, setSnapshot] = useState<BulkSnapshot>(EMPTY)
  const [workers, setWorkers] = useState(1)

  useEffect(() => {
    const runtime = createBulkRuntime(async (assetId) => {
      const response = await apiRequest(assetFileUrl(organizationId, assetId))
      return await response.blob()
    })
    const queue = new JobQueue<File, BulkResult>({
      concurrency: runtime.workers,
      run: async (file, signal) => {
        const specs = specsRef.current
        const settings = settingsRef.current
        if (settings === null || specs === null || specs.length === 0) {
          throw new Error('choose a preset before starting')
        }
        // Reading EXIF here is bounded by the queue's concurrency; the position
        // is the file's place in the whole batch.
        const files = filesRef.current
        const found = files.indexOf(file)
        const index = (found === -1 ? files.length : found) + 1
        const metadata = await readPhotoMetadata(file)
        return await runtime.run(
          file,
          metadata,
          specs,
          settings,
          { index, count: files.length },
          signal,
        )
      },
      onChange: setSnapshot,
    })
    runtimeRef.current = runtime
    queueRef.current = queue
    setWorkers(runtime.workers)
    return () => {
      queue.cancel()
      runtime.dispose()
      runtimeRef.current = null
      queueRef.current = null
    }
  }, [organizationId])

  const add = useCallback((files: readonly File[]) => {
    filesRef.current = [...filesRef.current, ...files]
    queueRef.current?.add(files)
  }, [])

  const start = useCallback((specs: readonly WatermarkSpec[], settings: BulkSettings) => {
    specsRef.current = specs
    settingsRef.current = settings
    return queueRef.current?.start() ?? Promise.resolve(EMPTY)
  }, [])

  const cancel = useCallback(() => {
    queueRef.current?.cancel()
  }, [])

  const retry = useCallback(() => {
    queueRef.current?.retry()
  }, [])

  const clear = useCallback(() => {
    filesRef.current = []
    queueRef.current?.clear()
  }, [])

  return { snapshot, workers, add, start, cancel, retry, clear }
}
