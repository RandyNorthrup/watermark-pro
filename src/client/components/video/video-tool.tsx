import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Download, Film, Loader2, Share2, X } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MILLISECONDS_PER_SECOND } from '../../../shared/constants'
import type { Anchor, WatermarkSpec } from '../../../shared/watermark'
import { seedFor } from '../../engine/random'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { assetFileUrl, watermarksQueryOptions } from '../../lib/library'
import { MarkResources } from '../../lib/mark-resources'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { withPlacement } from '../../lib/spec-edit'
import { baseName, specForPhoto } from '../../lib/spec-tokens'
import { type VideoCapabilitySupported, useVideoCapability } from '../../video/capabilities'
import { CancelledError } from '../../video/errors'
import {
  describeAudio,
  estimateRemainingMs,
  fitVideoSize,
  planAudio,
  progressFraction,
  scaleVideoBitrate,
  type TranscodePlan,
  type VideoQuality,
  type VideoResolution,
} from '../../video/plan'
import { probeVideo, sampleFrame, type VideoProbe } from '../../video/probe'
import { VideoTranscoder } from '../../video/worker-client'
import { useRenderer } from '../editor/use-renderer'
import { PresetGate } from '../presets/preset-gate'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Select, type SelectOption } from '../ui/select'
import { Spinner } from '../ui/spinner'

interface VideoToolProps {
  organizationId: string
  organizationName: string
  canSave?: boolean | undefined
}

const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime'

/** Smart placement plus the corners and centre; "Custom" drag placement is deferred. */
type PlacementChoice =
  'smart' | Extract<Anchor, 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'>

const PLACEMENT_OPTIONS = [
  { value: 'smart', labelKey: 'video.placementOptions.smart' },
  { value: 'bottom-right', labelKey: 'video.placementOptions.bottomRight' },
  { value: 'bottom-left', labelKey: 'video.placementOptions.bottomLeft' },
  { value: 'top-right', labelKey: 'video.placementOptions.topRight' },
  { value: 'top-left', labelKey: 'video.placementOptions.topLeft' },
  { value: 'center', labelKey: 'video.placementOptions.center' },
] as const satisfies readonly { value: PlacementChoice; labelKey: string }[]

const QUALITY_OPTIONS = [
  { value: 'low', labelKey: 'video.qualityOptions.low' },
  { value: 'standard', labelKey: 'video.qualityOptions.standard' },
  { value: 'high', labelKey: 'video.qualityOptions.high' },
] as const satisfies readonly { value: VideoQuality; labelKey: string }[]

const RESOLUTION_OPTIONS = [
  { value: 'original', labelKey: 'video.resolutionOptions.original' },
  { value: '1080p', labelKey: 'video.resolutionOptions.fit1080p' },
  { value: '720p', labelKey: 'video.resolutionOptions.fit720p' },
] as const satisfies readonly { value: VideoResolution; labelKey: string }[]

const PERCENT = 100
/** Preview and transcode both take the placement map from the first frame (see transcode.ts). */
const PREVIEW_TIMESTAMP_SECONDS = 0

function isPlacementChoice(value: string): value is PlacementChoice {
  return PLACEMENT_OPTIONS.some((option) => option.value === value)
}

function isQuality(value: string): value is VideoQuality {
  return QUALITY_OPTIONS.some((option) => option.value === value)
}

function isResolution(value: string): value is VideoResolution {
  return RESOLUTION_OPTIONS.some((option) => option.value === value)
}

/** Lets a file drop land on the drop zone. */
function allowDrop(event: DragEvent<HTMLDivElement>) {
  event.preventDefault()
}

/** Applies the chosen placement to a spec: smart, or a fixed anchor. */
function placedSpec(spec: WatermarkSpec, choice: PlacementChoice): WatermarkSpec {
  return withPlacement(
    spec,
    choice === 'smart' ? { mode: 'smart' } : { mode: 'anchor', anchor: choice },
  )
}

interface LoadedVideo {
  file: File
  probe: VideoProbe
}

interface Progress {
  frames: number
  timestamp: number
  startedAt: number
  durationSeconds: number
}

interface Outcome {
  blob: Blob
  fileName: string
}

/**
 * The video tool. Detects what the browser can produce, then, once video is
 * detectable, hands off to the workbench. Browsers without `VideoEncoder` get
 * the unsupported message.
 */
export function VideoTool({ organizationId, organizationName, canSave = false }: VideoToolProps) {
  const { t } = useTranslation()
  const capability = useVideoCapability()
  if (capability === null) {
    return <Spinner className="size-6" label={t('video.checkingSupport')} />
  }
  if (!capability.supported) {
    return (
      <Alert tone="info" title={t('video.unsupportedTitle')}>
        {t('video.unsupportedBody')}
      </Alert>
    )
  }
  return (
    <VideoWorkbench
      organizationId={organizationId}
      organizationName={organizationName}
      canSave={canSave}
      capability={capability}
    />
  )
}

interface WorkbenchProps extends VideoToolProps {
  capability: VideoCapabilitySupported
}

function VideoWorkbench({ organizationId, capability }: WorkbenchProps) {
  const { t } = useTranslation()
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const inputRef = useRef<HTMLInputElement>(null)
  const transcoderRef = useRef<VideoTranscoder | null>(null)
  const resourcesRef = useRef<MarkResources | null>(null)
  const runRef = useRef<AbortController | null>(null)

  const [video, setVideo] = useState<LoadedVideo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [presetIds, setPresetIds] = useState<string[]>([])
  const [placement, setPlacement] = useState<PlacementChoice>('smart')
  const [quality, setQuality] = useState<VideoQuality>('standard')
  const [resolution, setResolution] = useState<VideoResolution>('original')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [wasCancelled, setWasCancelled] = useState(false)

  useEffect(
    () => () => {
      runRef.current?.abort()
      transcoderRef.current?.terminate()
      resourcesRef.current?.clear()
    },
    [],
  )

  const specs: WatermarkSpec[] = presetIds.flatMap((id) => {
    const preset = presets.data?.find((candidate) => candidate.id === id)
    return preset === undefined ? [] : [preset.spec]
  })
  const outputSize = video === null ? null : fitVideoSize(video.probe, resolution)
  const resolvedSpecs =
    video === null || outputSize === null
      ? []
      : specs.map((spec) =>
          specForPhoto(placedSpec(spec, placement), video.file, { output: outputSize }),
        )
  const isRunning = progress !== null

  async function loadFile(file: File) {
    setLoadError(null)
    setOutcome(null)
    setRunError(null)
    setWasCancelled(false)
    try {
      const probe = await probeVideo(file)
      setVideo({ file, probe })
    } catch (error) {
      setVideo(null)
      setLoadError(describeError(error))
    }
  }

  function resources(): MarkResources {
    resourcesRef.current ??= new MarkResources(async (assetId) => {
      return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
    })
    return resourcesRef.current
  }

  function outputFileName(): string {
    const extension = capability.container === 'mp4' ? 'mp4' : 'webm'
    const name = video === null ? 'video' : baseName(video.file.name)
    return `${name}-watermarked.${extension}`
  }

  async function start() {
    if (video === null || outputSize === null || resolvedSpecs.length === 0) {
      return
    }
    setOutcome(null)
    setRunError(null)
    setWasCancelled(false)
    const controller = new AbortController()
    runRef.current = controller
    const plan: TranscodePlan = {
      videoCodec: capability.videoCodec,
      container: capability.container,
      bitrate: scaleVideoBitrate(quality, outputSize.width * outputSize.height),
      output: outputSize,
      audio: planAudio(video.probe.audioCodec, capability.container, capability.canEncodeAudio),
    }
    const startedAt = performance.now()
    setProgress({
      frames: 0,
      timestamp: 0,
      startedAt,
      durationSeconds: video.probe.durationSeconds,
    })
    try {
      const marks = await resources().resolve(resolvedSpecs, seedFor(video.file))
      if (controller.signal.aborted) {
        // Preparation created these bitmaps, but no worker owns them yet.
        for (const mark of marks.marks) mark.image?.close()
        throw new CancelledError()
      }
      transcoderRef.current ??= new VideoTranscoder()
      const blob = await transcoderRef.current.transcode(
        { source: video.file, marks: marks.marks, fonts: marks.fonts, plan },
        {
          onProgress: (frames, timestamp) => {
            setProgress((current) => (current === null ? null : { ...current, frames, timestamp }))
          },
        },
      )
      controller.signal.throwIfAborted()
      setOutcome({ blob, fileName: outputFileName() })
    } catch (error) {
      if (controller.signal.aborted || error instanceof CancelledError) {
        setWasCancelled(true)
      } else {
        setRunError(describeError(error))
      }
    } finally {
      runRef.current = null
      setProgress(null)
    }
  }

  function togglePreset(id: string, isChecked: boolean) {
    setPresetIds((previous) =>
      isChecked
        ? [...previous.filter((other) => other !== id), id]
        : previous.filter((other) => other !== id),
    )
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const [file] = event.dataTransfer.files
    if (file !== undefined) {
      void loadFile(file)
    }
  }

  const mime = capability.container === 'mp4' ? 'video/mp4' : 'video/webm'
  const canShare = canShareFiles(mime)

  const placementOptions: readonly SelectOption<PlacementChoice>[] = PLACEMENT_OPTIONS.map(
    (option) => ({ value: option.value, label: t(option.labelKey) }),
  )
  const qualityOptions: readonly SelectOption<VideoQuality>[] = QUALITY_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }))
  const resolutionOptions: readonly SelectOption<VideoResolution>[] = RESOLUTION_OPTIONS.map(
    (option) => ({ value: option.value, label: t(option.labelKey) }),
  )

  return (
    <PresetGate query={presets} emptyHint={t('video.emptyHint')}>
      {(list) => (
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="flex min-w-0 flex-col gap-4 p-4">
            <div
              onDragOver={allowDrop}
              onDrop={onDrop}
              className="flex min-h-72 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand-300/70 bg-white/35 px-6 py-10 text-center transition-colors hover:border-brand-400 dark:border-brand-700/70 dark:bg-black/10"
            >
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                aria-label={t('video.addVideo')}
                accept={ACCEPTED_VIDEO_TYPES}
                onChange={(event) => {
                  const picked = event.currentTarget.files?.[0]
                  if (picked !== undefined) {
                    void loadFile(picked)
                  }
                  event.currentTarget.value = ''
                }}
              />
              <span className="glass-control mb-5 inline-flex size-16 items-center justify-center rounded-2xl border text-brand-700 shadow-card dark:text-brand-200">
                <Film aria-hidden="true" className="size-8" />
              </span>
              <p className="text-xl font-semibold tracking-tight text-ink">{t('video.dropHint')}</p>
              <div className="mt-5">
                <Button
                  type="button"
                  size="lg"
                  disabled={isRunning}
                  onClick={() => {
                    inputRef.current?.click()
                  }}
                >
                  {t('video.addVideo')}
                </Button>
              </div>
              <p className="mt-5 text-sm font-medium text-ink">{capability.label}</p>
              <p className="mt-1 text-xs text-ink-muted">{t('video.formatsHint')}</p>
            </div>

            {loadError === null ? null : <Alert tone="error">{loadError}</Alert>}

            {video === null || outputSize === null ? null : (
              <section aria-labelledby="video-file-heading" className="flex flex-col gap-3">
                <h2 id="video-file-heading" className="text-sm font-semibold">
                  {video.file.name}
                </h2>
                <p className="text-xs text-ink-muted">
                  {t('video.fileMeta', {
                    width: video.probe.width,
                    height: video.probe.height,
                    duration: video.probe.durationSeconds.toFixed(1),
                    size: formatBytes(video.file.size),
                    audio: describeAudio(
                      planAudio(
                        video.probe.audioCodec,
                        capability.container,
                        capability.canEncodeAudio,
                      ),
                    ),
                  })}
                </p>
                <div className="overflow-hidden rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                  {resolvedSpecs.length === 0 ? (
                    <p className="p-6 text-center text-sm text-ink-muted">
                      {t('video.choosePresetPreview')}
                    </p>
                  ) : (
                    <VideoPreview
                      organizationId={organizationId}
                      file={video.file}
                      specs={resolvedSpecs}
                      size={outputSize}
                    />
                  )}
                </div>
                <p className="text-xs text-ink-muted">
                  {t('video.outputSize', { width: outputSize.width, height: outputSize.height })}
                </p>
              </section>
            )}

            {progress === null ? null : (
              <div className="flex flex-col gap-2">
                <progress
                  aria-label={t('video.transcodingProgress')}
                  max={1}
                  value={progressFraction(progress.timestamp, progress.durationSeconds)}
                  className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
                />
                <p className="text-xs text-ink-muted" aria-live="polite">
                  {progressLabel(progress, t)}
                </p>
                <Button
                  type="button"
                  variant="danger"
                  className="self-start"
                  onClick={() => {
                    runRef.current?.abort()
                    transcoderRef.current?.cancel()
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                  {t('video.cancel')}
                </Button>
              </div>
            )}

            {wasCancelled ? <Alert tone="info">{t('video.cancelled')}</Alert> : null}
            {runError === null ? null : (
              <Alert tone="error" title={t('video.runErrorTitle')}>
                {runError}
              </Alert>
            )}

            {outcome === null ? null : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    downloadBlob(outcome.blob, outcome.fileName)
                  }}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {t('video.download', { fileName: outcome.fileName })}
                </Button>
                {canShare ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void shareOutcome(outcome, setRunError)
                    }}
                  >
                    <Share2 aria-hidden="true" className="size-4" />
                    {t('video.share')}
                  </Button>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="flex min-w-0 flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t('video.presets')}</legend>
              <ul className="flex flex-col gap-1">
                {list.map((candidate) => {
                  const order = presetIds.indexOf(candidate.id)
                  return (
                    <li key={candidate.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-brand-50/60 dark:hover:bg-brand-900/20">
                        <input
                          type="checkbox"
                          checked={order !== -1}
                          disabled={isRunning}
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
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('video.placement')}</span>
              <Select
                aria-label={t('video.placement')}
                value={placement}
                options={placementOptions}
                disabled={isRunning}
                onChange={(next) => {
                  if (isPlacementChoice(next)) {
                    setPlacement(next)
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('video.quality')}</span>
              <Select
                aria-label={t('video.quality')}
                value={quality}
                options={qualityOptions}
                disabled={isRunning}
                onChange={(next) => {
                  if (isQuality(next)) {
                    setQuality(next)
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('video.resolution')}</span>
              <Select
                aria-label={t('video.resolution')}
                value={resolution}
                options={resolutionOptions}
                disabled={isRunning}
                onChange={(next) => {
                  if (isResolution(next)) {
                    setResolution(next)
                  }
                }}
              />
            </div>
            <Button
              type="button"
              disabled={video === null || resolvedSpecs.length === 0 || isRunning}
              onClick={() => {
                void start()
              }}
            >
              {isRunning ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Film aria-hidden="true" className="size-4" />
              )}
              {t(isRunning ? 'video.watermarking' : 'video.watermarkVideo')}
            </Button>
            <p className="text-xs text-ink-muted">{t('video.fixedPlacementNote')}</p>
          </Card>
        </div>
      )}
    </PresetGate>
  )
}

/** One video to the share sheet; a refusal surfaces where run errors do. */
async function shareOutcome(outcome: Outcome, onError: (message: string) => void): Promise<void> {
  try {
    await shareFile(outcome.blob, outcome.fileName)
  } catch (error) {
    onError(describeError(error))
  }
}

function progressLabel(progress: Progress, t: TFunction): string {
  const elapsed = performance.now() - progress.startedAt
  const remaining = estimateRemainingMs(progress.timestamp, progress.durationSeconds, elapsed)
  const percent = Math.round(
    progressFraction(progress.timestamp, progress.durationSeconds) * PERCENT,
  )
  if (remaining === null) {
    return t('video.progress.noEta', { frame: progress.frames, percent })
  }
  return t('video.progress.withEta', {
    frame: progress.frames,
    percent,
    seconds: Math.ceil(remaining / MILLISECONDS_PER_SECOND),
  })
}

interface PreviewProps {
  organizationId: string
  file: File
  specs: readonly WatermarkSpec[]
  size: { width: number; height: number }
}

/** Renders the chosen layers on the video's first frame through the editor preview path. */
function VideoPreview({ organizationId, file, specs, size }: PreviewProps) {
  const { t } = useTranslation()
  const { result, setSubject } = useRenderer(organizationId, specs, undefined, size)
  const [frameError, setFrameError] = useState<string | null>(null)

  useEffect(() => {
    // Read through a property so a stale async result is dropped without
    // TypeScript narrowing the flag to a constant across the await.
    const live = { current: true }
    void (async () => {
      try {
        const png = await sampleFrame(file, PREVIEW_TIMESTAMP_SECONDS)
        if (live.current) {
          await setSubject(new File([png], 'frame.png', { type: 'image/png' }))
        }
      } catch (error) {
        if (live.current) {
          setFrameError(describeError(error))
        }
      }
    })()
    return () => {
      live.current = false
    }
  }, [file, setSubject])

  if (frameError !== null) {
    return (
      <Alert tone="error" className="m-3">
        {frameError}
      </Alert>
    )
  }
  if (result === null) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner className="size-6" label={t('video.renderingPreview')} />
      </div>
    )
  }
  return (
    <img
      src={result.url}
      alt={t('video.previewAlt')}
      width={result.width}
      height={result.height}
      className="mx-auto block max-h-[42svh] max-w-full lg:max-h-[60vh]"
    />
  )
}
