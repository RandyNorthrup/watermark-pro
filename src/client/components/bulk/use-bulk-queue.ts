import { useCallback, useEffect, useRef, useState } from 'react'

import {
  EMPTY_PHOTO_METADATA as EMPTY_METADATA,
  type PhotoMetadata,
} from '../../../shared/metadata'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkFile } from '../../bulk/folders'
import type { BulkJobInput, BulkResult, BulkSettings } from '../../bulk/processor'
import { JobQueue, type QueueSnapshot } from '../../bulk/queue'
import { type BulkRuntime, createBulkRuntime } from '../../bulk/runtime'
import type { EditorDocument } from '../../editor/state'
import { assetFileUrl } from '../../lib/library'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { readPhotoMetadata } from '../../lib/photo-metadata'

export type BulkSnapshot = QueueSnapshot<BulkJobInput, BulkResult>

const EMPTY: BulkSnapshot = { jobs: [], isRunning: false, isPaused: false, isSettled: false }
/** How many photos' EXIF are read at once when files are added. */
const METADATA_CONCURRENCY = 4

/** Reads metadata for many files in a small concurrent pool, preserving order. */
async function readMetadata(files: readonly File[]): Promise<PhotoMetadata[]> {
  const results = Array.from<PhotoMetadata | undefined>({ length: files.length })
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const index = next
      next += 1
      const file = files[index]
      if (file === undefined) {
        return
      }
      results[index] = await readPhotoMetadata(file)
    }
  }
  const workers = Math.min(METADATA_CONCURRENCY, files.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results.map((metadata) => metadata ?? EMPTY_METADATA)
}

/**
 * Owns the worker runtime and a job queue for the page's lifetime. Each job's
 * input carries its file, folder path and EXIF; the runner reads the shared
 * presets and settings from refs so a job started after a change uses the
 * latest values.
 */
export function useBulkQueue(organizationId: string) {
  const runtimeRef = useRef<BulkRuntime | null>(null)
  const queueRef = useRef<JobQueue<BulkJobInput, BulkResult> | null>(null)
  const specsRef = useRef<readonly WatermarkSpec[] | null>(null)
  const settingsRef = useRef<BulkSettings | null>(null)
  // Submission order (for the `{index}` / `{count}` tokens) and id → input.
  const inputsRef = useRef<BulkJobInput[]>([])
  const byIdRef = useRef(new Map<string, BulkJobInput>())
  const [snapshot, setSnapshot] = useState<BulkSnapshot>(EMPTY)
  const [workers, setWorkers] = useState(1)

  useEffect(() => {
    const runtime = createBulkRuntime(async (assetId) => {
      return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
    })
    const queue = new JobQueue<BulkJobInput, BulkResult>({
      concurrency: runtime.workers,
      run: async (input, signal) => {
        const specs = specsRef.current
        const settings = settingsRef.current
        if (settings === null || specs === null || specs.length === 0) {
          throw new Error('choose a preset before starting')
        }
        const inputs = inputsRef.current
        const found = inputs.indexOf(input)
        const index = (found === -1 ? inputs.length : found) + 1
        return await runtime.run(input, specs, settings, { index, count: inputs.length }, signal)
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

  const add = useCallback(async (files: readonly BulkFile[]) => {
    const metadata = await readMetadata(files.map((entry) => entry.file))
    const inputs: BulkJobInput[] = files.map((entry, index) => ({
      file: entry.file,
      relativePath: entry.relativePath,
      metadata: metadata[index] ?? EMPTY_METADATA,
      override: null,
    }))
    inputsRef.current = [...inputsRef.current, ...inputs]
    const ids = queueRef.current?.add(inputs) ?? []
    for (const [index, id] of ids.entries()) {
      const input = inputs[index]
      if (input !== undefined) {
        byIdRef.current.set(id, input)
      }
    }
  }, [])

  const start = useCallback((specs: readonly WatermarkSpec[], settings: BulkSettings) => {
    specsRef.current = specs
    settingsRef.current = settings
    return queueRef.current?.start() ?? Promise.resolve(EMPTY)
  }, [])

  /** Sets or clears one photo's override document and re-runs just that job. */
  const setOverride = useCallback((id: string, override: EditorDocument | null) => {
    const input = byIdRef.current.get(id)
    if (input === undefined) {
      return Promise.resolve(EMPTY)
    }
    input.override = override
    return queueRef.current?.rerun(id) ?? Promise.resolve(EMPTY)
  }, [])

  const pause = useCallback(() => {
    queueRef.current?.pause()
  }, [])

  const resume = useCallback(() => queueRef.current?.resume() ?? Promise.resolve(EMPTY), [])

  const cancel = useCallback(() => {
    queueRef.current?.cancel()
  }, [])

  const retry = useCallback(() => {
    queueRef.current?.retry()
  }, [])

  const clear = useCallback(() => {
    inputsRef.current = []
    byIdRef.current.clear()
    queueRef.current?.clear()
  }, [])

  return { snapshot, workers, add, start, setOverride, pause, resume, cancel, retry, clear }
}
