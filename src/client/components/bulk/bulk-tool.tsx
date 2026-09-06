import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderArchive,
  ImagePlus,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, useId, useMemo, useRef, useState } from 'react'

import { useBulkQueue } from './use-bulk-queue'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkSettings, BulkResult } from '../../bulk/processor'
import type { JobState } from '../../bulk/queue'
import { zipEntries } from '../../bulk/zip'
import { LONG_EDGE_PRESETS } from '../../editor/constants'
import { type EncodeOptions, OUTPUT_FORMATS, type OutputFormat } from '../../engine/encode'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { watermarksQueryOptions } from '../../lib/library'
import { FORMAT_OPTIONS } from '../editor/formats'
import { PresetGate } from '../presets/preset-gate'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Select, type SelectOption } from '../ui/select'
import { SliderField } from '../ui/slider-field'

interface BulkToolProps {
  organizationId: string
}

const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif'
const DEFAULT_QUALITY = 0.9
const MIN_QUALITY = 0.3
const QUALITY_STEP = 0.01
const PERCENT = 100
const MILLISECONDS = 1000
/** Enough for a full shoot while keeping the page responsive. */
export const MAX_BULK_FILES = 500

type SizeChoice = 'original' | `${(typeof LONG_EDGE_PRESETS)[number]}`

const SIZE_OPTIONS: readonly SelectOption<SizeChoice>[] = [
  { value: 'original', label: 'Original size' },
  ...LONG_EDGE_PRESETS.map((side) => ({
    value: String(side) as SizeChoice,
    label: `Fit ${String(side)} px`,
  })),
]

const selectClassName =
  'h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value)
}

function isSizeChoice(value: string): value is SizeChoice {
  return SIZE_OPTIONS.some((option) => option.value === value)
}

interface Timing {
  startedAt: number
  finishedAt: number | null
}

/** Seconds a finished batch took, or null while it is still running. */
function elapsedOf(timing: Timing | null): number | null {
  const finishedAt = timing?.finishedAt ?? null
  if (timing === null || finishedAt === null) {
    return null
  }
  return (finishedAt - timing.startedAt) / MILLISECONDS
}

function formatBytes(bytes: number): string {
  const kilobyte = 1024
  if (bytes < kilobyte * kilobyte) {
    return `${String(Math.round(bytes / kilobyte))} kB`
  }
  return `${(bytes / (kilobyte * kilobyte)).toFixed(1)} MB`
}

function dedupe(existing: readonly File[], incoming: readonly File[]): File[] {
  const seen = new Set(existing.map((file) => `${file.name}:${String(file.size)}`))
  const merged = [...existing]
  for (const file of incoming) {
    const key = `${file.name}:${String(file.size)}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(file)
    }
  }
  return merged.slice(0, MAX_BULK_FILES)
}

function StatusIcon({ job }: { job: JobState<File, BulkResult> }) {
  switch (job.status) {
    case 'done': {
      return <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
    }
    case 'failed': {
      return <AlertTriangle aria-hidden="true" className="size-4 text-rose-600" />
    }
    case 'running': {
      return <Loader2 aria-hidden="true" className="size-4 animate-spin text-brand-600" />
    }
    case 'cancelled': {
      return <X aria-hidden="true" className="size-4 text-ink-muted" />
    }
    case 'queued': {
      return (
        <span aria-hidden="true" className="inline-block size-4 rounded-full border border-line" />
      )
    }
  }
}

const STATUS_LABELS: Record<JobState<File, BulkResult>['status'], string> = {
  queued: 'Queued',
  running: 'Processing',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/**
 * Bulk watermarking: pick photos, a preset and output settings, run them
 * through the worker pool with progress, cancel and retry, then download
 * everything as one ZIP or file by file.
 */
export function BulkTool({ organizationId }: BulkToolProps) {
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const { snapshot, workers, add, start, cancel, retry, clear } = useBulkQueue(organizationId)
  const inputRef = useRef<HTMLInputElement>(null)
  const presetSelectId = useId()
  const [files, setFiles] = useState<File[]>([])
  const [presetId, setPresetId] = useState('')
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [size, setSize] = useState<SizeChoice>('original')
  const [isZipping, setIsZipping] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [timing, setTiming] = useState<Timing | null>(null)

  const spec: WatermarkSpec | null =
    presets.data?.find((candidate) => candidate.id === presetId)?.spec ?? null
  const hasStarted = snapshot.jobs.length > 0
  const counts = useMemo(() => {
    const tally = { done: 0, failed: 0, cancelled: 0, running: 0, queued: 0 }
    for (const job of snapshot.jobs) {
      tally[job.status] += 1
    }
    return tally
  }, [snapshot.jobs])
  const finished = counts.done + counts.failed + counts.cancelled
  const results = snapshot.jobs.filter((job) => job.output !== null)
  const elapsedSeconds = elapsedOf(timing)

  function settings(): BulkSettings {
    const output: EncodeOptions = { format, quality }
    return { output, fitLongestSide: size === 'original' ? null : Number(size) }
  }

  function addFiles(list: FileList | File[]) {
    setFiles((previous) => dedupe(previous, [...list]))
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  async function run() {
    if (spec === null) {
      return
    }
    clear()
    add(files)
    const startedAt = performance.now()
    setTiming({ startedAt, finishedAt: null })
    setZipError(null)
    await start(spec, settings())
    setTiming({ startedAt, finishedAt: performance.now() })
  }

  async function runRetry() {
    if (spec === null) {
      return
    }
    retry()
    await start(spec, settings())
  }

  async function downloadZip() {
    setIsZipping(true)
    setZipError(null)
    try {
      const entries = results.flatMap((job) =>
        job.output === null ? [] : [{ name: job.output.fileName, blob: job.output.blob }],
      )
      const blob = await zipEntries(entries)
      downloadBlob(blob, `watermarked-${String(entries.length)}-photos.zip`)
    } catch (error_) {
      setZipError(describeError(error_))
    } finally {
      setIsZipping(false)
    }
  }

  return (
    <PresetGate query={presets} emptyHint="to apply it to a batch.">
      {(list) => (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card className="flex flex-col gap-4 p-4">
            <div
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line px-4 py-8 text-center"
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                multiple
                aria-label="Add photos"
                className="sr-only"
                onChange={(event) => {
                  if (event.currentTarget.files !== null) {
                    addFiles(event.currentTarget.files)
                  }
                  event.currentTarget.value = ''
                }}
              />
              <ImagePlus aria-hidden="true" className="size-8 text-ink-muted" />
              <p className="text-sm text-ink-muted">
                Drop photos here, or{' '}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={snapshot.isRunning}
                  onClick={() => {
                    inputRef.current?.click()
                  }}
                >
                  Add photos
                </Button>
              </p>
              <p className="text-xs text-ink-muted">
                Up to {String(MAX_BULK_FILES)} photos per batch. Processing happens in your browser
                using {String(workers)} worker{workers === 1 ? '' : 's'}.
              </p>
            </div>

            {files.length === 0 ? null : (
              <section aria-labelledby="bulk-files-heading" className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 id="bulk-files-heading" className="text-sm font-semibold">
                    {String(files.length)} photo{files.length === 1 ? '' : 's'}
                  </h2>
                  {snapshot.isRunning ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFiles([])
                        clear()
                        setTiming(null)
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Clear list
                    </Button>
                  )}
                </div>
                {hasStarted ? (
                  <>
                    <progress
                      aria-label="Batch progress"
                      max={snapshot.jobs.length}
                      value={finished}
                      className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
                    />
                    <p className="text-xs text-ink-muted" aria-live="polite">
                      {String(finished)} of {String(snapshot.jobs.length)} finished
                      {counts.failed > 0 ? `, ${String(counts.failed)} failed` : ''}
                      {counts.cancelled > 0 ? `, ${String(counts.cancelled)} cancelled` : ''}
                      {elapsedSeconds === null || elapsedSeconds === 0
                        ? ''
                        : ` in ${elapsedSeconds.toFixed(1)} s (${(counts.done / elapsedSeconds).toFixed(1)} photos/s)`}
                      .
                    </p>
                  </>
                ) : null}
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {(hasStarted ? snapshot.jobs : files.map((file) => ({ file }))).map((row) => {
                    const job = 'status' in row ? row : null
                    const file = 'status' in row ? row.input : row.file
                    return (
                      <li
                        key={`${file.name}:${String(file.size)}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        {job === null ? (
                          <span
                            aria-hidden="true"
                            className="inline-block size-4 rounded-full border border-line"
                          />
                        ) : (
                          <StatusIcon job={job} />
                        )}
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
                        {job === null ? (
                          <span className="sr-only">Selected</span>
                        ) : (
                          <span className="w-20 text-right text-xs text-ink-muted">
                            {STATUS_LABELS[job.status]}
                          </span>
                        )}
                        {job?.error === undefined || job.error === null ? null : (
                          <span className="text-xs text-rose-600" role="alert">
                            {job.error}
                          </span>
                        )}
                        {job?.output === undefined || job.output === null ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${job.output.fileName}`}
                            onClick={() => {
                              if (job.output !== null) {
                                downloadBlob(job.output.blob, job.output.fileName)
                              }
                            }}
                          >
                            <Download aria-hidden="true" className="size-4" />
                          </Button>
                        )}
                        {job === null && !snapshot.isRunning ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => {
                              setFiles((previous) =>
                                previous.filter((candidate) => candidate !== file),
                              )
                            }}
                          >
                            <X aria-hidden="true" className="size-4" />
                          </Button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </Card>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={presetSelectId} className="text-sm font-medium">
                Preset
              </label>
              <select
                id={presetSelectId}
                value={presetId}
                disabled={snapshot.isRunning}
                onChange={(event) => {
                  setPresetId(event.currentTarget.value)
                }}
                className={selectClassName}
              >
                <option value="" disabled>
                  Choose a preset
                </option>
                {list.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Format</span>
              <Select
                aria-label="Format"
                value={format}
                options={FORMAT_OPTIONS}
                disabled={snapshot.isRunning}
                onChange={(next) => {
                  if (isOutputFormat(next)) {
                    setFormat(next)
                  }
                }}
              />
            </div>
            <SliderField
              label="Quality"
              value={quality}
              min={MIN_QUALITY}
              max={1}
              step={QUALITY_STEP}
              format={(value) => `${String(Math.round(value * PERCENT))}%`}
              disabled={format === 'image/png' || snapshot.isRunning}
              onChange={setQuality}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Size</span>
              <Select
                aria-label="Size"
                value={size}
                options={SIZE_OPTIONS}
                disabled={snapshot.isRunning}
                onChange={(next) => {
                  if (isSizeChoice(next)) {
                    setSize(next)
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {snapshot.isRunning ? (
                <Button type="button" variant="danger" onClick={cancel}>
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={files.length === 0 || spec === null}
                  onClick={() => {
                    void run()
                  }}
                >
                  Start
                </Button>
              )}
              {!snapshot.isRunning && counts.failed + counts.cancelled > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void runRetry()
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Retry {String(counts.failed + counts.cancelled)}
                </Button>
              ) : null}
            </div>
            {results.length > 0 && !snapshot.isRunning ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  isPending={isZipping}
                  onClick={() => {
                    void downloadZip()
                  }}
                >
                  {isZipping ? null : <FolderArchive aria-hidden="true" className="size-4" />}
                  Download {String(results.length)} as ZIP
                </Button>
                {zipError === null ? null : <Alert tone="error">{zipError}</Alert>}
              </div>
            ) : null}
            <p className="text-xs text-ink-muted">
              Smart placement and auto contrast are worked out for every photo separately. Nothing
              is uploaded.
            </p>
          </Card>
        </div>
      )}
    </PresetGate>
  )
}
