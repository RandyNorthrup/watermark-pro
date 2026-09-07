import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderArchive,
  ImagePlus,
  Images,
  Loader2,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, useId, useMemo, useRef, useState } from 'react'

import { useBulkQueue } from './use-bulk-queue'
import {
  type Adjustments,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  type Orientation,
} from '../../../shared/adjustments'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { BulkSettings, BulkResult } from '../../bulk/processor'
import type { JobState } from '../../bulk/queue'
import { zipEntries } from '../../bulk/zip'
import { LONG_EDGE_PRESETS } from '../../editor/constants'
import { type EncodeOptions, OUTPUT_FORMATS, type OutputFormat } from '../../engine/encode'
import type { Border } from '../../engine/pipeline'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { galleryQueryKey, uploadPhoto } from '../../lib/gallery'
import { watermarksQueryOptions } from '../../lib/library'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { AdjustPanel } from '../editor/adjust-panel'
import { FORMAT_OPTIONS } from '../editor/formats'
import { FrameControls } from '../editor/frame-controls'
import { OrientationControls } from '../editor/orientation-controls'
import { PresetGate } from '../presets/preset-gate'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Select, type SelectOption } from '../ui/select'
import { SliderField } from '../ui/slider-field'

interface BulkToolProps {
  organizationId: string
  /** Whether the current member may store photos in the gallery. */
  canSave?: boolean | undefined
}

interface SaveProgress {
  done: number
  total: number
  failed: number
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
export function BulkTool({ organizationId, canSave = false }: BulkToolProps) {
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const { snapshot, workers, add, start, cancel, retry, clear } = useBulkQueue(organizationId)
  const inputRef = useRef<HTMLInputElement>(null)
  const presetsHintId = useId()
  const [files, setFiles] = useState<File[]>([])
  /** Chosen presets in the order they were ticked, which is the order they are drawn. */
  const [presetIds, setPresetIds] = useState<string[]>([])
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [size, setSize] = useState<SizeChoice>('original')
  const [orientation, setOrientation] = useState<Orientation>(IDENTITY_ORIENTATION)
  const [adjust, setAdjust] = useState<Adjustments>(IDENTITY_ADJUSTMENTS)
  const [border, setBorder] = useState<Border | null>(null)
  const [isZipping, setIsZipping] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [saving, setSaving] = useState<SaveProgress | null>(null)
  const queryClient = useQueryClient()
  const [timing, setTiming] = useState<Timing | null>(null)

  const specs: WatermarkSpec[] = presetIds.flatMap((id) => {
    const preset = presets.data?.find((candidate) => candidate.id === id)
    return preset === undefined ? [] : [preset.spec]
  })
  const hasPresets = specs.length > 0
  /** The gallery records one preset per photo: the first one applied. */
  const presetId = presetIds[0] ?? null
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

  const isShareable = canShareFiles(format)

  /** One photo to the platform share sheet; a refusal shows where ZIP errors do. */
  async function shareOutput(output: BulkResult) {
    try {
      await shareFile(output.blob, output.fileName)
    } catch (error) {
      setZipError(describeError(error))
    }
  }

  function settings(): BulkSettings {
    const output: EncodeOptions = { format, quality }
    return {
      output,
      fitLongestSide: size === 'original' ? null : Number(size),
      orientation: { turns: orientation.turns, flipX: orientation.flipX, flipY: orientation.flipY },
      adjust,
      border,
    }
  }

  function addFiles(list: FileList | File[]) {
    setFiles((previous) => dedupe(previous, [...list]))
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  function togglePreset(id: string, isChecked: boolean) {
    setPresetIds((previous) =>
      isChecked
        ? [...previous.filter((other) => other !== id), id]
        : previous.filter((other) => other !== id),
    )
  }

  async function run() {
    if (!hasPresets) {
      return
    }
    clear()
    add(files)
    const startedAt = performance.now()
    setTiming({ startedAt, finishedAt: null })
    setZipError(null)
    setSaving(null)
    await start(specs, settings())
    setTiming({ startedAt, finishedAt: performance.now() })
  }

  async function runRetry() {
    if (!hasPresets) {
      return
    }
    retry()
    await start(specs, settings())
  }

  /** Uploads every finished result one at a time; a failure does not stop the rest. */
  async function saveAll() {
    const outputs = results.flatMap((job) => (job.output === null ? [] : [job.output]))
    const progress: SaveProgress = { done: 0, total: outputs.length, failed: 0 }
    setSaving({ ...progress })
    setZipError(null)
    for (const output of outputs) {
      try {
        await uploadPhoto(organizationId, {
          blob: output.blob,
          name: output.fileName,
          width: output.width,
          height: output.height,
          presetId,
        })
      } catch {
        progress.failed += 1
      }
      progress.done += 1
      setSaving({ ...progress })
    }
    await queryClient.invalidateQueries({ queryKey: galleryQueryKey(organizationId) })
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
                <ul
                  aria-label="Photos in this batch"
                  className="divide-y divide-line rounded-lg border border-line"
                >
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
                          <>
                            {isShareable ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Share ${job.output.fileName}`}
                                onClick={() => {
                                  if (job.output !== null) {
                                    void shareOutput(job.output)
                                  }
                                }}
                              >
                                <Share2 aria-hidden="true" className="size-4" />
                              </Button>
                            ) : null}
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
                          </>
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
            <fieldset className="flex flex-col gap-2" aria-describedby={presetsHintId}>
              <legend className="mb-1.5 text-sm font-medium">Presets</legend>
              <ul className="flex flex-col gap-1">
                {list.map((candidate) => {
                  const order = presetIds.indexOf(candidate.id)
                  return (
                    <li key={candidate.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-brand-50/60 dark:hover:bg-brand-900/20">
                        <input
                          type="checkbox"
                          checked={order !== -1}
                          disabled={snapshot.isRunning}
                          onChange={(event) => {
                            togglePreset(candidate.id, event.currentTarget.checked)
                          }}
                          className="size-4 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                        {order === -1 ? null : (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-100">
                            {String(order + 1)}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p id={presetsHintId} className="text-xs text-ink-muted">
                Tick one or more; they are applied in the order ticked, later ones over earlier
                ones.
              </p>
            </fieldset>
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

            <details className="rounded-lg border border-line" data-testid="bulk-adjustments">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                Photo adjustments
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-3">
                <OrientationControls orientation={orientation} onChange={setOrientation} />
                <AdjustPanel adjust={adjust} onChange={setAdjust} photoFile={files[0] ?? null} />
                <FrameControls border={border} onChange={setBorder} />
              </div>
            </details>

            <div className="flex flex-wrap gap-2">
              {snapshot.isRunning ? (
                <Button type="button" variant="danger" onClick={cancel}>
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={files.length === 0 || !hasPresets}
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
                {canSave ? (
                  <Button
                    type="button"
                    variant="secondary"
                    isPending={saving !== null && saving.done < saving.total}
                    disabled={saving !== null && saving.done === saving.total}
                    onClick={() => {
                      void saveAll()
                    }}
                  >
                    {saving === null ? <Images aria-hidden="true" className="size-4" /> : null}
                    {saving === null
                      ? `Save ${String(results.length)} to gallery`
                      : `Saved ${String(saving.done - saving.failed)} of ${String(saving.total)}`}
                  </Button>
                ) : null}
                {saving !== null && saving.done === saving.total ? (
                  <Alert tone={saving.failed === 0 ? 'success' : 'error'}>
                    {saving.failed === 0
                      ? 'All saved to the '
                      : `${String(saving.failed)} could not be saved (storage quota or limits). The rest are in the `}
                    <Link to="/app/gallery" className="font-medium underline">
                      gallery
                    </Link>
                    .
                  </Alert>
                ) : null}
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
