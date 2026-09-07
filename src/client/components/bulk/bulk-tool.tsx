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
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, useEffect, useId, useMemo, useRef, useState } from 'react'

import { OverrideDialog } from './override-dialog'
import { useBulkQueue } from './use-bulk-queue'
import { WatchFolder } from './watch-folder'
import {
  type Adjustments,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  type Orientation,
} from '../../../shared/adjustments'
import { MAX_INVISIBLE_MESSAGE_LENGTH } from '../../../shared/constants'
import type { WatermarkSpec } from '../../../shared/watermark'
import {
  type BulkFile,
  canPickDirectory,
  collectImages,
  MAX_BULK_FILES,
  readEntries,
  zipPath,
} from '../../bulk/folders'
import { DEFAULT_NAME_PATTERN, resolveNamePattern } from '../../bulk/names'
import type { BulkJobInput, BulkSettings, BulkResult } from '../../bulk/processor'
import { extensionFor } from '../../bulk/processor'
import type { JobState } from '../../bulk/queue'
import { buildReportCsv, type ReportRow } from '../../bulk/report'
import { zipEntries } from '../../bulk/zip'
import { LONG_EDGE_PRESETS } from '../../editor/constants'
import { createLayer, EMPTY_DOCUMENT, type EditorDocument } from '../../editor/state'
import {
  DEFAULT_METADATA_POLICY,
  effectivePolicy,
  type EncodeOptions,
  type MetadataPolicy,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '../../engine/encode'
import type { Border } from '../../engine/pipeline'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { galleryQueryKey, uploadPhoto } from '../../lib/gallery'
import { watermarksQueryOptions } from '../../lib/library'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { baseName } from '../../lib/spec-tokens'
import { AdjustPanel } from '../editor/adjust-panel'
import { FORMAT_OPTIONS } from '../editor/formats'
import { FrameControls } from '../editor/frame-controls'
import { MetadataPolicyField } from '../editor/metadata-policy'
import { OrientationControls } from '../editor/orientation-controls'
import { PresetGate } from '../presets/preset-gate'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Select, type SelectOption } from '../ui/select'
import { SliderField } from '../ui/slider-field'

interface BulkToolProps {
  organizationId: string
  /** The workspace name; seeds the default invisible-mark message. */
  organizationName: string
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
/** Rows rendered before the list is collapsed behind "Show all" (keeps 500-photo batches fast). */
const VISIBLE_ROW_LIMIT = 60
/** Placeholder output size for the file-name preview. */
const PREVIEW_WIDTH = 1200
const PREVIEW_HEIGHT = 900

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

function keyOf(entry: BulkFile): string {
  return `${entry.relativePath}:${String(entry.file.size)}`
}

function dedupe(existing: readonly BulkFile[], incoming: readonly BulkFile[]): BulkFile[] {
  const seen = new Set(existing.map((entry) => keyOf(entry)))
  const merged = [...existing]
  for (const entry of incoming) {
    if (seen.has(keyOf(entry))) {
      continue
    }

    seen.add(keyOf(entry))
    merged.push(entry)
  }
  return merged.slice(0, MAX_BULK_FILES)
}

function StatusIcon({ job }: { job: JobState<BulkJobInput, BulkResult> }) {
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

const STATUS_LABELS: Record<JobState<BulkJobInput, BulkResult>['status'], string> = {
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
export function BulkTool({ organizationId, organizationName, canSave = false }: BulkToolProps) {
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const { snapshot, workers, add, start, setOverride, pause, resume, cancel, retry, clear } =
    useBulkQueue(organizationId)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const presetsHintId = useId()
  const [files, setFiles] = useState<BulkFile[]>([])
  const [namePattern, setNamePattern] = useState(DEFAULT_NAME_PATTERN)
  const [showAll, setShowAll] = useState(false)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)
  // The job whose photo is open in the override dialog, or null.
  const [adjusting, setAdjusting] = useState<{ id: string; input: BulkJobInput } | null>(null)
  const canPickFolder = canPickDirectory()
  // `webkitdirectory` is not a typed React attribute; set it on the element.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
  }, [])
  /** Chosen presets in the order they were ticked, which is the order they are drawn. */
  const [presetIds, setPresetIds] = useState<string[]>([])
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [policy, setPolicy] = useState<MetadataPolicy>(DEFAULT_METADATA_POLICY)
  const [wantsInvisible, setWantsInvisible] = useState(false)
  const [invisibleMessage, setInvisibleMessage] = useState(organizationName)
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

  // One uniform row shape before and after the batch starts; the list is
  // capped at `VISIBLE_ROW_LIMIT` until the user asks to see all, so a
  // 500-photo batch never renders 500 rows at once.
  const rows: {
    file: File
    relativePath: string
    job: JobState<BulkJobInput, BulkResult> | null
  }[] = hasStarted
    ? snapshot.jobs.map((job) => ({
        file: job.input.file,
        relativePath: job.input.relativePath,
        job,
      }))
    : files.map((entry) => ({ file: entry.file, relativePath: entry.relativePath, job: null }))
  const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_ROW_LIMIT)

  const isShareable = canShareFiles(format)

  /** One photo to the platform share sheet; a refusal shows where ZIP errors do. */
  async function shareOutput(output: BulkResult) {
    try {
      await shareFile(output.blob, output.fileName)
    } catch (error) {
      setZipError(describeError(error))
    }
  }

  const presetName = presets.data?.find((candidate) => candidate.id === presetId)?.name ?? ''
  const namePatternId = useId()
  const namePreview = ((): string => {
    try {
      const first = files[0]
      const example = resolveNamePattern(namePattern, {
        name: first === undefined ? 'photo' : baseName(first.file.name),
        index: 1,
        count: Math.max(files.length, 1),
        date: new Date(),
        preset: presetName === '' ? 'preset' : presetName,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
      })
      return `Example: ${example}.${extensionFor(format)}`
    } catch {
      return 'The pattern must produce a name.'
    }
  })()

  function settings(): BulkSettings {
    const message = invisibleMessage.trim()
    const willEmbedMark = format === 'image/png' && wantsInvisible && message.length > 0
    const output: EncodeOptions = {
      format,
      quality,
      metadata: effectivePolicy(policy, format),
      ...(willEmbedMark && { invisible: { message } }),
    }
    return {
      output,
      fitLongestSide: size === 'original' ? null : Number(size),
      orientation: { turns: orientation.turns, flipX: orientation.flipX, flipY: orientation.flipY },
      adjust,
      border,
      namePattern,
      presetName,
    }
  }

  /** The editor document the override dialog starts from: the batch settings as layers. */
  function batchDocument(): EditorDocument {
    const layers = presetIds.flatMap((id) => {
      const preset = presets.data?.find((candidate) => candidate.id === id)
      return preset === undefined ? [] : [createLayer(id, preset.spec)]
    })
    return {
      ...EMPTY_DOCUMENT,
      layers,
      orientation: { ...orientation, straighten: 0 },
      adjust,
      border,
    }
  }

  function applyOverride(document: EditorDocument): void {
    if (adjusting !== null) {
      void setOverride(adjusting.id, document)
    }
    setAdjusting(null)
  }

  /** Copies the dialog's layers and adjustments into the batch and clears every override. */
  function applyOverrideToAll(document: EditorDocument): void {
    setPresetIds(document.layers.map((layer) => layer.presetId))
    setAdjust(document.adjust)
    setBorder(document.border)
    setOrientation(document.orientation)
    for (const job of snapshot.jobs) {
      void setOverride(job.id, null)
    }
    setAdjusting(null)
  }

  function removeOverride(): void {
    if (adjusting !== null) {
      void setOverride(adjusting.id, null)
    }
    setAdjusting(null)
  }

  function addScan(scan: { files: BulkFile[]; skipped: number }) {
    setFiles((previous) => dedupe(previous, scan.files))
    setSkippedNote(
      scan.skipped === 0
        ? null
        : `${String(scan.skipped)} file${scan.skipped === 1 ? '' : 's'} skipped: not images`,
    )
  }

  function addFiles(list: FileList | File[]) {
    addScan(collectImages([...list]))
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    // `items` and `webkitGetAsEntry` power folder drops; both are absent in
    // jsdom and on some browsers, so fall back to the plain file list.
    const list = event.dataTransfer.items as DataTransferItemList | undefined
    const entries: FileSystemEntry[] = []
    for (let index = 0; list !== undefined && index < list.length; index += 1) {
      const entry = list[index]?.webkitGetAsEntry()
      if (entry !== null && entry !== undefined) {
        entries.push(entry)
      }
    }
    if (entries.some((entry) => entry.isDirectory)) {
      addScan(await readEntries(entries))
    } else {
      addFiles(event.dataTransfer.files)
    }
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
    await add(files)
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
        job.output === null
          ? []
          : [
              {
                name: zipPath(job.output.relativePath, job.output.fileName),
                blob: job.output.blob,
              },
            ],
      )
      const blob = await zipEntries(entries)
      downloadBlob(blob, `watermarked-${String(entries.length)}-photos.zip`)
    } catch (error_) {
      setZipError(describeError(error_))
    } finally {
      setIsZipping(false)
    }
  }

  /** A CSV report of every job in the batch. */
  function downloadReport() {
    const presetNames = presetIds
      .map((id) => presets.data?.find((candidate) => candidate.id === id)?.name ?? id)
      .join('; ')
    const reportRows: ReportRow[] = snapshot.jobs.map((job) => ({
      source: job.input.file.name,
      relativePath: job.input.relativePath,
      output: job.output?.fileName ?? '',
      status: job.status,
      width: job.output?.width ?? null,
      height: job.output?.height ?? null,
      durationMs: job.durationMs,
      error: job.error,
      presets: presetNames,
      override: false,
    }))
    downloadBlob(new Blob([buildReportCsv(reportRows)], { type: 'text/csv' }), 'report.csv')
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
              onDrop={(event) => {
                void onDrop(event)
              }}
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
              <input
                ref={folderInputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                multiple
                aria-label="Add a folder"
                className="sr-only"
                onChange={(event) => {
                  if (event.currentTarget.files !== null) {
                    addFiles(event.currentTarget.files)
                  }
                  event.currentTarget.value = ''
                }}
              />
              <ImagePlus aria-hidden="true" className="size-8 text-ink-muted" />
              <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-ink-muted">
                Drop photos or a folder here, or
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
                {canPickFolder ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={snapshot.isRunning}
                    onClick={() => {
                      folderInputRef.current?.click()
                    }}
                  >
                    Add a folder
                  </Button>
                ) : null}
              </p>
              <p className="text-xs text-ink-muted">
                Up to {String(MAX_BULK_FILES)} photos per batch. Processing happens in your browser
                using {String(workers)} worker{workers === 1 ? '' : 's'}.
              </p>
            </div>

            {skippedNote === null ? null : (
              <p className="text-xs text-amber-600" role="status">
                {skippedNote}
              </p>
            )}

            <WatchFolder organizationId={organizationId} specs={specs} settings={settings()} />

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
                  {visibleRows.map((row) => {
                    const { job, file, relativePath } = row
                    return (
                      <li
                        key={`${relativePath}:${String(file.size)}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        {job === null ? (
                          <span
                            aria-hidden="true"
                            className="inline-block size-4 rounded-full border border-line"
                          />
                        ) : (
                          <StatusIcon job={job} />
                        )}
                        <span className="min-w-0 flex-1 truncate" title={relativePath}>
                          {relativePath}
                        </span>
                        <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
                        {job !== null && job.input.override !== null ? (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-100">
                            Custom
                          </span>
                        ) : null}
                        {job === null ? (
                          <span className="sr-only">Selected</span>
                        ) : (
                          <span className="w-20 text-right text-xs text-ink-muted">
                            {STATUS_LABELS[job.status]}
                          </span>
                        )}
                        {job === null ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Adjust ${relativePath}`}
                            onClick={() => {
                              setAdjusting({ id: job.id, input: job.input })
                            }}
                          >
                            <SlidersHorizontal aria-hidden="true" className="size-4" />
                          </Button>
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
                            aria-label={`Remove ${relativePath}`}
                            onClick={() => {
                              setFiles((previous) =>
                                previous.filter((candidate) => candidate.file !== file),
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
                {rows.length > visibleRows.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setShowAll(true)
                    }}
                  >
                    Show all {String(rows.length)} photos
                  </Button>
                ) : null}
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
            <MetadataPolicyField policy={policy} format={format} onChange={setPolicy} />
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-600"
                  checked={wantsInvisible}
                  disabled={format !== 'image/png' || snapshot.isRunning}
                  onChange={(event) => {
                    setWantsInvisible(event.currentTarget.checked)
                  }}
                />
                Invisible mark
              </label>
              {format === 'image/png' ? (
                wantsInvisible ? (
                  <Input
                    aria-label="Invisible message"
                    value={invisibleMessage}
                    maxLength={MAX_INVISIBLE_MESSAGE_LENGTH}
                    disabled={snapshot.isRunning}
                    onChange={(event) => {
                      setInvisibleMessage(event.currentTarget.value)
                    }}
                  />
                ) : null
              ) : (
                <p className="text-xs text-ink-muted">
                  Choose PNG to hide a message in every photo.
                </p>
              )}
            </div>
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor={namePatternId} className="text-sm font-medium">
                File names
              </label>
              <Input
                id={namePatternId}
                value={namePattern}
                disabled={snapshot.isRunning}
                onChange={(event) => {
                  setNamePattern(event.currentTarget.value)
                }}
              />
              <p className="text-xs text-ink-muted">
                Tokens: {'{name} {index} {count} {date} {preset} {width} {height}'}. {namePreview}
              </p>
            </div>

            <details className="rounded-lg border border-line" data-testid="bulk-adjustments">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                Photo adjustments
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-3">
                <OrientationControls orientation={orientation} onChange={setOrientation} />
                <AdjustPanel
                  adjust={adjust}
                  onChange={setAdjust}
                  photoFile={files[0]?.file ?? null}
                />
                <FrameControls border={border} onChange={setBorder} />
              </div>
            </details>

            <div className="flex flex-wrap gap-2">
              {snapshot.isRunning || snapshot.isPaused ? (
                <>
                  {snapshot.isPaused ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void resume()
                      }}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" onClick={pause}>
                      Pause
                    </Button>
                  )}
                  <Button type="button" variant="danger" onClick={cancel}>
                    Cancel
                  </Button>
                </>
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
                <Button type="button" variant="ghost" size="sm" onClick={downloadReport}>
                  Download report (CSV)
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
          {adjusting === null ? null : (
            <OverrideDialog
              organizationId={organizationId}
              organizationName={organizationName}
              file={adjusting.input.file}
              fileName={adjusting.input.relativePath}
              document={adjusting.input.override ?? batchDocument()}
              hasOverride={adjusting.input.override !== null}
              onApply={applyOverride}
              onApplyToAll={applyOverrideToAll}
              onRemove={removeOverride}
              onClose={() => {
                setAdjusting(null)
              }}
            />
          )}
        </div>
      )}
    </PresetGate>
  )
}
