import { useCallback, useEffect, useRef, useState } from 'react'

import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkResult, BulkSettings } from '../../bulk/processor'
import { JobQueue, type QueueSnapshot } from '../../bulk/queue'
import { type BulkRuntime, createBulkRuntime } from '../../bulk/runtime'
import { apiRequest } from '../../lib/api'
import { assetFileUrl } from '../../lib/library'

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
  const specRef = useRef<WatermarkSpec | null>(null)
  const settingsRef = useRef<BulkSettings | null>(null)
  const [snapshot, setSnapshot] = useState<BulkSnapshot>(EMPTY)
  const [workers, setWorkers] = useState(1)

  useEffect(() => {
    const runtime = createBulkRuntime(async (assetId) => {
      const response = await apiRequest(assetFileUrl(organizationId, assetId))
      return await response.blob()
    })
    const queue = new JobQueue<File, BulkResult>({
      concurrency: runtime.workers,
      run: (file, signal) => {
        const spec = specRef.current
        const settings = settingsRef.current
        if (spec === null || settings === null) {
          return Promise.reject(new Error('choose a preset before starting'))
        }
        return runtime.run(file, spec, settings, signal)
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
    queueRef.current?.add(files)
  }, [])

  const start = useCallback((spec: WatermarkSpec, settings: BulkSettings) => {
    specRef.current = spec
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
    queueRef.current?.clear()
  }, [])

  return { snapshot, workers, add, start, cancel, retry, clear }
}
