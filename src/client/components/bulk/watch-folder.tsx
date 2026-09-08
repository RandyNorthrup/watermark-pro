import { FolderSync } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkSettings } from '../../bulk/processor'
import { type BulkRuntime, createBulkRuntime } from '../../bulk/runtime'
import {
  canWatchFolder,
  type DirectoryHandleLike,
  type ScanEntry,
  sweepFolder,
  WATCH_INTERVAL_MS,
} from '../../bulk/watch'
import { apiRequest } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { readPhotoMetadata } from '../../lib/photo-metadata'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'

interface WatchFolderProps {
  organizationId: string
  /** The ticked presets and current output settings, applied to each new file. */
  specs: readonly WatermarkSpec[]
  settings: BulkSettings
}

/** The File System Access picker, not typed by lib.dom. */
interface DirectoryPicker {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>
}

const LOG_LIMIT = 20
/** A mobile browser never offers the watch folder (no directory picker, and no place to keep the page open). */
const MOBILE = /Mobi|Android/i

export function WatchFolder({ organizationId, specs, settings }: WatchFolderProps) {
  const { t } = useTranslation()
  const [isWatching, setIsWatching] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<DirectoryHandleLike | null>(null)
  const outputRef = useRef<DirectoryHandleLike | null>(null)
  const seenRef = useRef<ScanEntry[]>([])
  const runtimeRef = useRef<BulkRuntime | null>(null)
  const specsRef = useRef(specs)
  const settingsRef = useRef(settings)
  const tRef = useRef(t)
  // Keep the refs the polling loop reads in step with the latest props each render.
  useEffect(() => {
    specsRef.current = specs
    settingsRef.current = settings
    tRef.current = t
  })

  const isSupported = canWatchFolder(MOBILE.test(navigator.userAgent))

  async function tick(): Promise<void> {
    const input = inputRef.current
    const output = outputRef.current
    const runtime = runtimeRef.current
    if (input === null || output === null || runtime === null) {
      return
    }
    try {
      seenRef.current = await sweepFolder(
        input,
        output,
        seenRef.current,
        async (file) => {
          const metadata = await readPhotoMetadata(file)
          return await runtime.run(
            { file, relativePath: file.name, metadata, override: null },
            specsRef.current,
            settingsRef.current,
            { index: 1, count: 1 },
            new AbortController().signal,
          )
        },
        {
          wrote: (name) =>
            setLog((previous) =>
              [tRef.current('bulk.watch.wrote', { name }), ...previous].slice(0, LOG_LIMIT),
            ),
          failed: (name, error) =>
            setLog((previous) =>
              [
                tRef.current('bulk.watch.failed', { name, error: describeError(error) }),
                ...previous,
              ].slice(0, LOG_LIMIT),
            ),
        },
      )
    } catch (scanError) {
      setError(describeError(scanError))
    }
  }

  useEffect(() => {
    if (!isWatching) {
      return
    }
    // The first sweep runs on the next macrotask, then every interval; both are
    // timer callbacks (an external subscription), not synchronous effect work.
    const first = window.setTimeout(() => {
      void tick()
    }, 0)
    const id = window.setInterval(() => {
      void tick()
    }, WATCH_INTERVAL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
    // tick reads the latest specs/settings/handles from refs, so it need not be a dep.
  }, [isWatching])

  async function begin(): Promise<void> {
    setError(null)
    const picker = globalThis as unknown as DirectoryPicker
    if (picker.showDirectoryPicker === undefined) {
      return
    }
    try {
      const input = await picker.showDirectoryPicker({ mode: 'read' })
      const output = await picker.showDirectoryPicker({ mode: 'readwrite' })
      inputRef.current = input
      outputRef.current = output
      seenRef.current = []
      runtimeRef.current = createBulkRuntime(async (assetId) => {
        const response = await apiRequest(assetFileUrl(organizationId, assetId))
        return await response.blob()
      })
      setLog([])
      setIsWatching(true)
    } catch {
      // A cancelled picker throws; that is not an error worth showing.
    }
  }

  function stop(): void {
    setIsWatching(false)
    runtimeRef.current?.dispose()
    runtimeRef.current = null
    inputRef.current = null
    outputRef.current = null
  }

  useEffect(() => () => runtimeRef.current?.dispose(), [])

  if (!isSupported) {
    return null
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-line p-3"
      aria-label={t('bulk.watch.label')}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FolderSync aria-hidden="true" className="size-4" />
          {t('bulk.watch.label')}
        </span>
        {isWatching ? (
          <Button type="button" variant="secondary" size="sm" onClick={stop}>
            {t('bulk.watch.stop')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={specs.length === 0}
            onClick={() => {
              void begin()
            }}
          >
            {t('bulk.watch.choose')}
          </Button>
        )}
      </div>
      <p className="text-xs text-ink-muted">{t('bulk.watch.hint')}</p>
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {log.length === 0 ? null : (
        <ul className="max-h-32 overflow-y-auto text-xs text-ink-muted" aria-live="polite">
          {log.map((line, index) => (
            <li key={`${String(index)}:${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
