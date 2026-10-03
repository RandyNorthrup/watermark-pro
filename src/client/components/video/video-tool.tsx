import { useQuery } from '@tanstack/react-query'
import { Download, Film, PanelsTopLeft, Share2, SlidersHorizontal, X } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { type DragEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ZodError } from 'zod'

import { ProjectInspector } from './project-inspector'
import { ProjectMediaPool } from './project-media-pool'
import type { ProjectPlaybackHandle } from './project-preview'
import { ProjectTimeline } from './project-timeline'
import { VideoOutputSettings } from './video-output-settings'
import { VideoTimeline } from './video-timeline'
import { VideoViewer } from './video-viewer'
import { MAX_VIDEO_BYTES, VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import {
  appendProjectClip,
  editProjectClip,
  emptyVideoProject,
  projectDuration,
  removeProjectClip,
  splitProjectClip,
  unlinkProjectAudio,
  videoProjectSchema,
  type ClipEdit,
  type VideoProject,
} from '../../../shared/video-project'
import type { WatermarkSpec } from '../../../shared/watermark'
import { markSize, resolvePlacement } from '../../engine/layout'
import type { MarkOutcome } from '../../engine/pipeline'
import { seedFor } from '../../engine/random'
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
import {
  createProjectMedia,
  disposeProjectMedia,
  probeProjectMedia,
  type ProjectMediaAsset,
  type VideoProjectAsset,
} from '../../video/project-media'
import { originalProjectSource, projectAudioPlan } from '../../video/project-plan'
import { VideoTranscoder } from '../../video/worker-client'
import type { MarkGesture } from '../editor/mark-overlay'
import { MediaEditorLayout, MediaHistory, MediaTools } from '../editor/media-tools'
import { useMediaScene } from '../editor/use-media-scene'
import { CloudImportButtons } from '../import/cloud-import-buttons'
import { CloudSaveButtons } from '../import/cloud-save-buttons'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'

interface VideoToolProps {
  organizationId: string
  canCreatePresets?: boolean | undefined
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
  const [assets, setAssets] = useState<ProjectMediaAsset[]>([])
  const assetRegistry = useRef(assets)
  const sceneSnapshot = useRef(scene.value)
  const playback = useRef<ProjectPlaybackHandle | null>(null)
  const [isImporting, setImporting] = useState(false)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState('clip')
  const [showMedia, setShowMedia] = useState(true)
  const [showInspector, setShowInspector] = useState(true)
  const project = scene.value.project ?? emptyVideoProject(t('video.studio.untitled'))
  const sourceClip = project.clips.find((clip) => clip.kind === 'video')
  const sourceAsset = assets.find((asset) => asset.id === sourceClip?.assetId)
  const video: VideoProjectAsset | null =
    sourceAsset?.kind === 'video'
      ? {
          ...sourceAsset,
          probe: {
            ...sourceAsset.probe,
            width: project.width,
            height: project.height,
            durationSeconds: projectDuration(project),
          },
        }
      : null
  const originalSource = originalProjectSource(project, assets)
  const originalAudio =
    originalSource === null
      ? null
      : planAudio(originalSource.probe.audioCodec, capability.container, capability.canEncodeAudio)
  const requiresAudioEncoder =
    originalSource !== null &&
    originalSource.probe.audioCodec !== null &&
    originalAudio?.mode === 'none'
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId)
  const selectedAsset = assets.find((asset) => asset.id === selectedClip?.assetId)
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
  const exportKey = JSON.stringify([project, specs, motions, quality, resolution])
  const latest = useRef(exportKey)
  useLayoutEffect(() => {
    latest.current = exportKey
    sceneSnapshot.current = scene.value
    assetRegistry.current = assets
  }, [exportKey, scene.value, assets])
  useEffect(
    () => () => {
      generation.current += 1
      run.current?.abort()
      transcoder.current?.terminate()
      for (const asset of assetRegistry.current) disposeProjectMedia(asset)
    },
    [],
  )
  const onPlacements = useCallback((value: MarkOutcome[]) => {
    placements.current = value
    setCanKeyframe(value.length > 0)
  }, [])

  function seek(value: number) {
    playback.current?.seek(value)
    const duration = projectDuration(project)
    setTime(Math.max(0, Math.min(duration, value)))
  }
  function changeProject(value: VideoProject) {
    const duration = projectDuration(value)
    seek(Math.min(time, duration))
    scene.change({ ...scene.value, project: videoProjectSchema.parse(value) })
    setOutput(null)
    setError(null)
  }
  function editClip(id: string, edit: ClipEdit) {
    try {
      const clip = project.clips.find((item) => item.id === id)
      const asset = assets.find((item) => item.id === clip?.assetId)
      if (asset === undefined || (edit.out !== undefined && edit.out > asset.probe.durationSeconds))
        throw new RangeError(t('video.studio.sourceBounds'))
      changeProject(editProjectClip(project, id, edit))
    } catch (error) {
      setError(error instanceof ZodError ? t('video.studio.invalidEdit') : describeError(error))
    }
  }
  function clipOperation(operation: () => VideoProject) {
    try {
      changeProject(operation())
    } catch (error) {
      setError(error instanceof ZodError ? t('video.studio.invalidEdit') : describeError(error))
    }
  }
  function addAsset(asset: ProjectMediaAsset, track: number) {
    clipOperation(() =>
      appendProjectClip(
        project,
        {
          id: asset.id,
          kind: asset.kind,
          duration: asset.probe.durationSeconds,
          hasAudio: asset.probe.audioCodec !== null,
        },
        track,
      ),
    )
  }
  function newProject() {
    generation.current += 1
    run.current?.abort()
    transcoder.current?.cancel()
    seek(0)
    scene.newScene()
    for (const asset of assetRegistry.current) disposeProjectMedia(asset)
    assetRegistry.current = []
    setAssets([])
    setOutput(null)
    setSelectedClipId(null)
    setError(null)
    setNotice(null)
    setImporting(false)
  }
  async function openFiles(files: readonly File[]) {
    if (files.length === 0) return
    generation.current += 1
    const request = generation.current
    run.current?.abort()
    transcoder.current?.cancel()
    setOutput(null)
    setError(null)
    setNotice(null)
    setImporting(true)
    playback.current?.seek(time)
    const created: ProjectMediaAsset[] = []
    try {
      if (
        assetRegistry.current.length + files.length > VIDEO_PROJECT_LIMITS.assets ||
        [...assetRegistry.current.map((asset) => asset.file), ...files].reduce(
          (total, file) => total + file.size,
          0,
        ) > MAX_VIDEO_BYTES
      )
        throw new RangeError(t('video.studio.sourceBounds'))
      const probed = []
      for (const file of files) probed.push({ file, media: await probeProjectMedia(file) })
      identity.assertCurrent()
      if (request !== generation.current) return
      let next = sceneSnapshot.current.project ?? emptyVideoProject(t('video.studio.untitled'))
      for (const { file, media } of probed) {
        const asset = createProjectMedia(file, media)
        created.push(asset)
        if (asset.kind === 'video' && next.clips.every((clip) => clip.kind !== 'video'))
          next = { ...next, width: asset.probe.width, height: asset.probe.height }
        next = appendProjectClip(next, {
          id: asset.id,
          kind: asset.kind,
          duration: asset.probe.durationSeconds,
          hasAudio: asset.probe.audioCodec !== null,
        })
      }
      scene.change({ ...sceneSnapshot.current, project: next })
      setAssets([...assetRegistry.current, ...created])
      const imported = next.clips.find(
        (clip) => clip.assetId === created[0]?.id && clip.kind === created[0].kind,
      )
      setSelectedClipId(imported?.id ?? null)
      setInspectorTab('clip')
      setTime(0)
    } catch (error) {
      for (const asset of created) disposeProjectMedia(asset)
      if (request === generation.current) setError(describeError(error))
    } finally {
      if (request === generation.current) setImporting(false)
    }
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void openFiles([...event.dataTransfer.files])
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

  const fileName = `${originalSource === null ? project.name : baseName(originalSource.file.name)}-watermarked.${capability.container}`
  async function exportVideo(): Promise<Blob> {
    identity.assertCurrent()
    if (output?.key === exportKey) return output.blob
    if (video === null || size === null) throw new Error(t('video.timeline.chooseVideo'))
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
    try {
      const plan: TranscodePlan = {
        videoCodec: capability.videoCodec,
        container: capability.container,
        bitrate: scaleVideoBitrate(quality, size.width * size.height),
        output: size,
        audio: projectAudioPlan(
          project,
          capability.container,
          capability.canEncodeAudio,
          originalSource,
        ),
      }
      const resolved = await resources.resolve(specs, seedFor(video.file))
      if (controller.signal.aborted) {
        for (const mark of resolved.marks) mark.image?.close()
        throw new CancelledError()
      }
      transcoder.current ??= new VideoTranscoder()
      const blob = await transcoder.current.transcode(
        {
          source: video.file,
          marks: resolved.marks,
          fonts: resolved.fonts,
          plan,
          motions,
          composition:
            originalSource === null
              ? {
                  project,
                  referenceMap: video.map,
                  sources: assets
                    .filter((asset) => project.clips.some((clip) => clip.assetId === asset.id))
                    .map((asset) => ({ id: asset.id, source: asset.file })),
                }
              : undefined,
        },
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
    <MediaEditorLayout scene={scene} className="video-studio">
      <div className="studio-toolbar" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <input
          ref={input}
          type="file"
          multiple
          accept="video/*,audio/*"
          aria-label={t('video.addVideo')}
          className="sr-only"
          onChange={(event) => {
            void openFiles([...(event.currentTarget.files ?? [])])
            event.currentTarget.value = ''
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isImporting}
          isPending={isImporting}
          onClick={() => input.current?.click()}
        >
          <Film aria-hidden="true" className="size-4" />
          {t('video.studio.importMedia')}
        </Button>
        {config.data === undefined ? null : (
          <CloudImportButtons
            config={config.data}
            mediaKinds={['video']}
            onImport={(files) => {
              void openFiles(files)
            }}
            onError={setError}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showMedia}
          onClick={() => setShowMedia(!showMedia)}
        >
          <PanelsTopLeft aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('video.studio.mediaPool')}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showInspector}
          onClick={() => setShowInspector(!showInspector)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('video.studio.inspector')}</span>
        </Button>
        <MediaHistory
          scene={scene}
          onNew={newProject}
          exportAction={
            <Button
              type="button"
              size="sm"
              disabled={video === null || isRunning || isImporting}
              isPending={isRunning}
              onClick={() => {
                void download()
              }}
              data-guidance-topic="export"
            >
              <Download aria-hidden="true" className="size-4" />
              {t('video.timeline.download')}
            </Button>
          }
        />
      </div>
      <div className="studio-workspace" data-media={showMedia} data-inspector={showInspector}>
        {showMedia ? <ProjectMediaPool assets={assets} onAdd={addAsset} /> : null}
        <section
          className="studio-viewer"
          aria-label={t('video.heading')}
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          <div className="studio-panel-title">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              <span className="shrink-0">{t('video.studio.projectName')}</span>
              <Input
                aria-label={t('video.studio.projectName')}
                className="h-8 border-0 bg-transparent text-sm"
                key={project.name}
                defaultValue={project.name}
                maxLength={VIDEO_PROJECT_LIMITS.nameCharacters}
                onBlur={(event) => {
                  const name = event.currentTarget.value
                  clipOperation(() => ({ ...project, name }))
                }}
              />
            </label>
          </div>
          <div className="studio-viewer-body">
            {video === null ? (
              <div className="studio-empty-viewer">
                <Film className="mb-3 size-10" aria-hidden="true" />
                <p>{t('video.studio.emptyTimeline')}</p>
              </div>
            ) : (
              <VideoViewer
                key={video.id}
                organizationId={organizationId}
                project={project}
                mediaAssets={assets}
                playbackRef={playback}
                file={video.file}
                outputSize={size ?? video.probe}
                probe={video.probe}
                map={video.map}
                scene={scene}
                time={time}
                onTime={setTime}
                onPlacements={onPlacements}
                onGesture={gesture}
                onSelectMark={() => {
                  setInspectorTab('watermark')
                  setShowInspector(true)
                }}
              />
            )}
            <div className="studio-viewer-meta">
              <p>{capability.label}</p>
              {video === null ? null : (
                <p>
                  {t('video.studio.pictureMeta', {
                    width: project.width,
                    height: project.height,
                    format:
                      originalSource === null
                        ? t('video.studio.frameRate', { fps: VIDEO_PROJECT_LIMITS.framesPerSecond })
                        : video.probe.videoCodec,
                  })}
                </p>
              )}
            </div>
          </div>
        </section>
        {showInspector ? (
          <section className="studio-inspector" aria-label={t('video.studio.inspector')}>
            <h2 className="studio-panel-title">{t('video.studio.inspector')}</h2>
            <Tabs.Root
              value={inspectorTab}
              onValueChange={setInspectorTab}
              className="studio-inspector-root"
            >
              <Tabs.List className="studio-inspector-tabs" aria-label={t('video.studio.inspector')}>
                <Tabs.Trigger value="clip">{t('video.studio.clip')}</Tabs.Trigger>
                <Tabs.Trigger value="watermark">{t('editor.tabs.watermark')}</Tabs.Trigger>
                <Tabs.Trigger value="output">{t('video.studio.output')}</Tabs.Trigger>
              </Tabs.List>
              <div className="studio-inspector-scroll app-scroll-region p-3">
                <Tabs.Content value="clip">
                  <ProjectInspector
                    clip={selectedClip}
                    asset={selectedAsset}
                    time={time}
                    onEdit={(edit) => {
                      if (selectedClip !== undefined) editClip(selectedClip.id, edit)
                    }}
                    onSplit={() =>
                      clipOperation(() => splitProjectClip(project, selectedClipId ?? '', time))
                    }
                    onRemove={() =>
                      clipOperation(() => removeProjectClip(project, selectedClipId ?? ''))
                    }
                    onUnlink={() =>
                      clipOperation(() => unlinkProjectAudio(project, selectedClipId ?? ''))
                    }
                  />
                </Tabs.Content>
                <Tabs.Content value="watermark">
                  <MediaTools
                    embedded
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
                        onSeek={seek}
                      />
                    )}
                  </MediaTools>
                </Tabs.Content>
                <Tabs.Content value="output" className="flex flex-col gap-4">
                  <VideoOutputSettings
                    value={{ quality, resolution }}
                    onChange={(choice) => {
                      setQuality(choice.quality)
                      setResolution(choice.resolution)
                    }}
                  />
                  {originalAudio === null ? (
                    <p className="text-xs text-ink-muted">
                      {t('video.studio.frameRate', { fps: VIDEO_PROJECT_LIMITS.framesPerSecond })}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-muted">
                      {requiresAudioEncoder
                        ? t('video.studio.audioRequired')
                        : describeAudio(originalAudio)}
                    </p>
                  )}
                  {canShareFiles(`video/${capability.container}`) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={video === null || isRunning}
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
                      disabled={video === null || isRunning}
                      buttonClassName="w-full"
                      buttonSize="md"
                      getUploads={async () => [{ name: fileName, blob: await exportVideo() }]}
                      onSaved={() => setNotice(t('video.timeline.cloudSaved'))}
                      onError={setError}
                    />
                  )}
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </section>
        ) : null}
      </div>
      <ProjectTimeline
        project={project}
        assets={assets}
        selectedId={selectedClipId}
        time={time}
        onSelect={(id) => {
          setSelectedClipId(id)
          setInspectorTab('clip')
          setShowInspector(true)
        }}
        onEdit={editClip}
        onChange={changeProject}
        onSeek={seek}
        onBegin={scene.begin}
        onEnd={scene.end}
      />
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
    </MediaEditorLayout>
  )
}
