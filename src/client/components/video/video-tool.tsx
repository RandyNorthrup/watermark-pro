import { useQuery } from '@tanstack/react-query'
import { Download, Film, Share2, X } from 'lucide-react'
import { type DragEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { VideoOutputSettings } from './video-output-settings'
import { VideoTimeline } from './video-timeline'
import { VideoViewer } from './video-viewer'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { LuminanceMap } from '../../engine/analysis'
import { markSize, resolvePlacement } from '../../engine/layout'
import { analyseSource, type MarkOutcome } from '../../engine/pipeline'
import { seedFor } from '../../engine/random'
import { mainThreadBackend } from '../../lib/canvas-backend'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { MarkResources } from '../../lib/mark-resources'
import { captureOfflineGeneration, captureOfflineOwner } from '../../lib/offline-context'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { publicConfigQueryOptions } from '../../lib/queries'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { baseName, specForPhoto } from '../../lib/spec-tokens'
import { type VideoCapabilitySupported, useVideoCapability } from '../../video/capabilities'
import { CancelledError } from '../../video/errors'
import {
  createVideoMotion,
  putVideoKeyframe,
  videoMotionSchema,
  videoEditingSpecAt,
  videoPoseAt,
  type VideoMotion,
  type VideoPose,
} from '../../video/motion'
import {
  describeAudio,
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
import type { MarkGesture } from '../editor/mark-overlay'
import { MediaEditorLayout, MediaHistory, MediaTools } from '../editor/media-tools'
import { useMediaScene } from '../editor/use-media-scene'
import { CloudImportButtons } from '../import/cloud-import-buttons'
import { CloudSaveButtons } from '../import/cloud-save-buttons'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Spinner } from '../ui/spinner'

interface VideoToolProps {
  organizationId: string
  canCreatePresets?: boolean | undefined
}
interface LoadedVideo {
  id: string
  file: File
  url: string
  probe: VideoProbe
  map: LuminanceMap
}
/** Capability-gated inline video editing, with the same timestamp poses in playback and export. */
export function VideoTool(props: VideoToolProps) {
  const { t } = useTranslation()
  const capability = useVideoCapability()
  if (capability === null) return <Spinner label={t('video.checkingSupport')} />
  if (!capability.supported)
    return (
      <Alert tone="info" title={t('video.unsupportedTitle')}>
        {t('video.unsupportedBody')}
      </Alert>
    )
  return <VideoWorkbench key={props.organizationId} {...props} capability={capability} />
}

function VideoWorkbench({
  organizationId,
  canCreatePresets = false,
  capability,
}: VideoToolProps & { capability: VideoCapabilitySupported }) {
  const { t } = useTranslation()
  const scene = useMediaScene(canCreatePresets)
  const config = useQuery(publicConfigQueryOptions)
  const [identity] = useState(captureOfflineGeneration)
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const run = useRef<AbortController | null>(null)
  const transcoder = useRef<VideoTranscoder | null>(null)
  const placements = useRef<MarkOutcome[]>([])
  const [canKeyframe, setCanKeyframe] = useState(false)
  const [video, setVideo] = useState<LoadedVideo | null>(null)
  const [time, setTime] = useState(0)
  const [quality, setQuality] = useState<VideoQuality>('high')
  const [resolution, setResolution] = useState<VideoResolution>('original')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [output, setOutput] = useState<{ key: string; blob: Blob } | null>(null)
  const size = video === null ? null : fitVideoSize(video.probe, resolution)
  const specs =
    video === null || size === null
      ? []
      : scene.outputSpecs.map((spec) => specForPhoto(spec, video.file, { output: size }))
  const motions = scene.renderLayers.map((layer) => scene.value.animations[layer.id] ?? null)
  const exportKey = JSON.stringify([video?.id, specs, motions, quality, resolution])
  const latest = useRef(exportKey)
  useLayoutEffect(() => {
    latest.current = exportKey
  }, [exportKey])
  useEffect(
    () => () => {
      generation.current += 1
      run.current?.abort()
      transcoder.current?.terminate()
    },
    [],
  )
  useEffect(
    () => () => {
      if (video !== null) URL.revokeObjectURL(video.url)
    },
    [video],
  )
  const onPlacements = useCallback((value: MarkOutcome[]) => {
    placements.current = value
    setCanKeyframe(value.length > 0)
  }, [])

  async function open(file: File) {
    generation.current += 1
    const request = generation.current
    run.current?.abort()
    transcoder.current?.cancel()
    scene.replaceSource()
    placements.current = []
    setVideo(null)
    setOutput(null)
    setError(null)
    setNotice(null)
    setCanKeyframe(false)
    try {
      const probe = await probeVideo(file)
      const bitmap = await createImageBitmap(await sampleFrame(file, 0))
      let map: LuminanceMap
      try {
        map = analyseSource(bitmap, undefined, mainThreadBackend())
      } finally {
        bitmap.close()
      }
      identity.assertCurrent()
      if (request !== generation.current) return
      setVideo({ id: crypto.randomUUID(), file, probe, map, url: URL.createObjectURL(file) })
      setTime(0)
    } catch (error) {
      if (request === generation.current) setError(describeError(error))
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file !== undefined) void open(file)
  }

  function motionFor(id: string): VideoMotion {
    if (video === null) throw new Error(t('video.timeline.chooseVideo'))
    return scene.value.animations[id] ?? createVideoMotion(video.probe.durationSeconds)
  }
  function changeMotion(id: string, motion: VideoMotion) {
    scene.change({
      ...scene.value,
      animations: { ...scene.value.animations, [id]: videoMotionSchema.parse(motion) },
    })
  }
  function currentPose(id: string): VideoPose {
    const index = scene.renderLayers.findIndex((layer) => layer.id === id)
    const layer = scene.renderLayers[index]
    const mark = placements.current[index]
    if (video === null || layer === undefined || mark === undefined)
      throw new Error(t('video.timeline.waitPreview'))
    const motion = motionFor(id)
    const keyed = videoPoseAt(motion.keyframes, time)
    return {
      x: mark.placement.centreX / video.probe.width,
      y: mark.placement.centreY / video.probe.height,
      scale: keyed?.scale ?? layer.spec.style.scale,
      rotation: keyed?.rotation ?? layer.spec.style.rotation,
      opacity: keyed?.opacity ?? layer.spec.style.opacity,
    }
  }
  function addKeyframe(id: string) {
    try {
      changeMotion(id, putVideoKeyframe(motionFor(id), { ...currentPose(id), time }))
    } catch (error) {
      setError(describeError(error))
    }
  }
  function gesture(id: string, event: MarkGesture) {
    const motion = scene.value.animations[id]
    if (motion === undefined || motion.keyframes.length === 0) {
      scene.gesture(id, event)
      return
    }
    if (event.phase === 'start') {
      scene.begin()
      return
    }
    if (event.phase === 'end') {
      scene.end()
      return
    }
    try {
      changeMotion(id, putVideoKeyframe(motion, { ...currentPose(id), ...event.patch, time }))
    } catch (error) {
      scene.end()
      setError(describeError(error))
    }
  }

  const fileName = `${baseName(video?.file.name ?? 'video')}-watermarked.${capability.container}`
  async function exportVideo(): Promise<Blob> {
    identity.assertCurrent()
    if (output?.key === exportKey) return output.blob
    if (video === null || size === null || specs.length === 0)
      throw new Error(t('video.timeline.chooseVideo'))
    const owner = captureOfflineOwner()
    run.current?.abort()
    transcoder.current?.cancel()
    const controller = new AbortController()
    run.current = controller
    setProgress(0)
    setError(null)
    const resources = new MarkResources(async (id) => {
      owner.assertCurrent()
      return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, id))
    })
    const plan: TranscodePlan = {
      videoCodec: capability.videoCodec,
      container: capability.container,
      bitrate: scaleVideoBitrate(quality, size.width * size.height),
      output: size,
      audio: planAudio(video.probe.audioCodec, capability.container, capability.canEncodeAudio),
    }
    try {
      const resolved = await resources.resolve(specs, seedFor(video.file))
      if (controller.signal.aborted) {
        for (const mark of resolved.marks) mark.image?.close()
        throw new CancelledError()
      }
      transcoder.current ??= new VideoTranscoder()
      const blob = await transcoder.current.transcode(
        { source: video.file, marks: resolved.marks, fonts: resolved.fonts, plan, motions },
        {
          onProgress: (_frames, timestamp) => {
            if (!controller.signal.aborted)
              setProgress(progressFraction(timestamp, video.probe.durationSeconds))
          },
        },
      )
      controller.signal.throwIfAborted()
      owner.assertCurrent()
      identity.assertCurrent()
      if (latest.current !== exportKey) throw new Error(t('video.timeline.changed'))
      setOutput({ key: exportKey, blob })
      return blob
    } finally {
      resources.clear()
      if (run.current === controller) {
        run.current = null
        setProgress(null)
      }
    }
  }
  async function download() {
    try {
      downloadBlob(await exportVideo(), fileName)
    } catch (error) {
      setError(describeError(error))
    }
  }
  async function share() {
    try {
      await shareFile(await exportVideo(), fileName)
    } catch (error) {
      setError(describeError(error))
    }
  }
  const active = scene.renderLayers.find((layer) => layer.id === scene.value.activeId)
  const activeSpec =
    active === undefined
      ? undefined
      : videoEditingSpecAt(active.spec, scene.value.animations[active.id], time)
  function editSpec(spec: WatermarkSpec) {
    if (active === undefined || activeSpec === undefined || video === null) {
      scene.changeSpec(spec)
      return
    }
    const value =
      active.id === 'draft'
        ? { ...scene.value, draft: spec }
        : {
            ...scene.value,
            layers: scene.value.layers.map((layer) =>
              layer.id === active.id ? { ...layer, spec } : layer,
            ),
          }
    const motion = scene.value.animations[active.id]
    const hasPoseChange =
      spec.style.scale !== activeSpec.style.scale ||
      spec.style.rotation !== activeSpec.style.rotation ||
      spec.style.opacity !== activeSpec.style.opacity ||
      JSON.stringify(spec.placement) !== JSON.stringify(activeSpec.placement)
    if (!hasPoseChange || motion === undefined || motion.keyframes.length === 0) {
      scene.change(value)
      return
    }
    const index = scene.renderLayers.findIndex((layer) => layer.id === active.id)
    const mark = placements.current[index]
    if (mark === undefined) {
      setError(t('video.timeline.waitPreview'))
      return
    }
    const dimensions = markSize(spec, video.probe, mark.placement.width / mark.placement.height)
    const placed = resolvePlacement(spec, video.probe, dimensions, video.map)
    const frame = {
      time,
      x: placed.centreX / video.probe.width,
      y: placed.centreY / video.probe.height,
      scale: spec.style.scale,
      rotation: spec.style.rotation,
      opacity: spec.style.opacity,
    }
    scene.change({
      ...value,
      animations: { ...value.animations, [active.id]: putVideoKeyframe(motion, frame) },
    })
  }
  const isRunning = progress !== null
  return (
    <MediaEditorLayout scene={scene}>
      <Card
        className="flex min-w-0 flex-col gap-3 p-3 lg:p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            aria-label={t('video.addVideo')}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file !== undefined) void open(file)
              event.currentTarget.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => input.current?.click()}
          >
            <Film aria-hidden="true" className="size-4" />
            {t('video.addVideo')}
          </Button>
          {config.data === undefined ? null : (
            <CloudImportButtons
              config={config.data}
              mediaKinds={['video']}
              onImport={(files) => {
                const file = files[0]
                if (file !== undefined) void open(file)
              }}
              onError={setError}
            />
          )}
          <MediaHistory scene={scene} />
        </div>
        {video === null ? (
          <div className="flex min-h-[54svh] items-center justify-center rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">
            {t('video.dropHint')}
          </div>
        ) : (
          <VideoViewer
            key={video.id}
            organizationId={organizationId}
            url={video.url}
            file={video.file}
            outputSize={size ?? video.probe}
            probe={video.probe}
            map={video.map}
            scene={scene}
            time={time}
            onTime={setTime}
            onPlacements={onPlacements}
            onGesture={gesture}
          />
        )}
        <div className="flex min-w-0 gap-3 overflow-hidden text-xs whitespace-nowrap text-ink-muted">
          <p className="min-w-0 flex-1 truncate" title={t('editor.mark.position')}>
            {t('editor.mark.position')}
          </p>
          {video === null ? null : (
            <p className="ms-auto max-w-[45%] truncate text-end" title={video.file.name}>
              {t('editor.photoMeta', {
                name: video.file.name,
                width: video.probe.width,
                height: video.probe.height,
              })}
            </p>
          )}
        </div>
        {progress === null ? null : (
          <div className="flex items-center gap-3">
            <progress
              aria-label={t('video.transcodingProgress')}
              value={progress}
              max={1}
              className="h-2 min-w-0 flex-1 accent-brand-600"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                run.current?.abort()
                transcoder.current?.cancel()
              }}
            >
              <X aria-hidden="true" className="size-4" />
              {t('video.cancel')}
            </Button>
          </div>
        )}
        {error === null ? null : <Alert tone="error">{error}</Alert>}
        {notice === null ? null : <Alert tone="success">{notice}</Alert>}
      </Card>
      <MediaTools
        organizationId={organizationId}
        canCreate={canCreatePresets}
        scene={scene}
        activeSpec={activeSpec}
        onSpecChange={editSpec}
      >
        {video === null || active === undefined || !canKeyframe ? null : (
          <VideoTimeline
            motion={motionFor(active.id)}
            duration={video.probe.durationSeconds}
            time={time}
            onChange={(motion) => changeMotion(active.id, motion)}
            onKeyframe={() => addKeyframe(active.id)}
            onSeek={setTime}
          />
        )}
        <VideoOutputSettings
          value={{ quality, resolution }}
          onChange={(choice) => {
            setQuality(choice.quality)
            setResolution(choice.resolution)
          }}
        />
        <p className="text-xs text-ink-muted">{capability.label}</p>
        <div className="tool-section flex flex-col gap-2">
          <Button
            type="button"
            disabled={video === null || specs.length === 0 || isRunning}
            isPending={isRunning}
            onClick={() => {
              void download()
            }}
          >
            <Download aria-hidden="true" className="size-4" />
            {t('video.timeline.download')}
          </Button>
          {canShareFiles(`video/${capability.container}`) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={video === null || specs.length === 0 || isRunning}
              onClick={() => {
                void share()
              }}
            >
              <Share2 aria-hidden="true" className="size-4" />
              {t('video.share')}
            </Button>
          ) : null}
          {config.data === undefined ? null : (
            <CloudSaveButtons
              config={config.data}
              disabled={video === null || specs.length === 0 || isRunning}
              buttonClassName="w-full"
              buttonSize="md"
              getUploads={async () => [{ name: fileName, blob: await exportVideo() }]}
              onSaved={() => setNotice(t('video.timeline.cloudSaved'))}
              onError={setError}
            />
          )}
        </div>
        {video === null ? null : (
          <p className="text-xs text-ink-muted">
            {describeAudio(
              planAudio(video.probe.audioCodec, capability.container, capability.canEncodeAudio),
            )}
          </p>
        )}
      </MediaTools>
    </MediaEditorLayout>
  )
}
