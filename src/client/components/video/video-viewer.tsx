import { Pause, Play } from 'lucide-react'
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { ProjectPreview, type ProjectPlaybackHandle } from './project-preview'
import { VIDEO_PREVIEW_MAX_SIDE, VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import type { VideoProject } from '../../../shared/video-project'
import type { LuminanceMap } from '../../engine/analysis'
import { contextOf } from '../../engine/canvas'
import type { Size } from '../../engine/layout'
import { composeMark, type MarkOutcome } from '../../engine/pipeline'
import { describeError } from '../../lib/errors'
import { specForPhoto } from '../../lib/spec-tokens'
import { videoSpecAt } from '../../video/motion'
import type { VideoProbe } from '../../video/probe'
import type { ProjectMediaAsset } from '../../video/project-media'
import { videoTimeLabel } from '../../video/time'
import { MarkOverlay, type MarkGesture } from '../editor/mark-overlay'
import { MediaViewport } from '../editor/media-viewport'
import { useMediaMarks } from '../editor/use-media-marks'
import type { MediaScene } from '../editor/use-media-scene'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { RangeSlider } from '../ui/slider-field'

interface VideoViewerProps {
  organizationId: string
  project: VideoProject
  mediaAssets: readonly ProjectMediaAsset[]
  playbackRef?: Ref<ProjectPlaybackHandle>
  file: File
  outputSize: Size
  probe: VideoProbe
  map: LuminanceMap
  scene: MediaScene
  time: number
  onTime: (time: number) => void
  onPlacements: (placements: MarkOutcome[]) => void
  onGesture: (id: string, gesture: MarkGesture) => void
  onSelectMark?: () => void
}

/** Native playback beneath a transparent mark canvas; no video decode/PNG round trip during interaction. */
export function VideoViewer({
  organizationId,
  project,
  mediaAssets,
  playbackRef,
  file,
  outputSize,
  probe,
  map,
  scene,
  time,
  onTime,
  onPlacements,
  onGesture,
  onSelectMark,
}: VideoViewerProps) {
  const { t } = useTranslation()
  const playback = useRef<ProjectPlaybackHandle | null>(null)
  useImperativeHandle(
    playbackRef,
    () => ({
      async toggle() {
        if (playback.current === null) throw new Error('Video preview is not ready.')
        await playback.current.toggle()
      },
      seek(value) {
        if (playback.current === null) throw new Error('Video preview is not ready.')
        playback.current.seek(value)
      },
    }),
    [],
  )
  const rasterSize = useMemo(() => {
    const factor = Math.min(1, VIDEO_PREVIEW_MAX_SIDE / Math.max(probe.width, probe.height))
    return { width: Math.round(probe.width * factor), height: Math.round(probe.height * factor) }
  }, [probe])
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<MarkOutcome[]>([])
  const resources = useMediaMarks(
    organizationId,
    scene.renderLayers.map((layer) => specForPhoto(layer.spec, file, { output: outputSize })),
  )
  const draw = useRef<((time: number) => void) | null>(null)
  useLayoutEffect(() => {
    draw.current = (timestamp) => {
      if (canvas === null) return
      const context = contextOf(canvas)
      context.clearRect(0, 0, rasterSize.width, rasterSize.height)
      const next = resources.marks.map((mark, index) => {
        const layer = scene.renderLayers[index]
        const motion = layer === undefined ? undefined : scene.value.animations[layer.id]
        return composeMark(context, rasterSize, map, {
          ...mark,
          spec: videoSpecAt(mark.spec, motion, timestamp),
        })
      })
      onPlacements(
        next.map((outcome) => ({
          ...outcome,
          placement: {
            ...outcome.placement,
            centreX: (outcome.placement.centreX * probe.width) / rasterSize.width,
            centreY: (outcome.placement.centreY * probe.height) / rasterSize.height,
            width: (outcome.placement.width * probe.width) / rasterSize.width,
            height: (outcome.placement.height * probe.height) / rasterSize.height,
          },
        })),
      )
      if (!isPlaying)
        setOutcomes((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        )
    }
  }, [
    canvas,
    map,
    onPlacements,
    probe,
    rasterSize,
    resources.marks,
    scene.renderLayers,
    scene.value.animations,
    isPlaying,
  ])

  useEffect(() => {
    if (isPlaying) return
    const frame = requestAnimationFrame(() => draw.current?.(time))
    return () => cancelAnimationFrame(frame)
  }, [canvas, isPlaying, map, probe, resources.marks, scene.value.animations, time])

  const onFrame = useCallback((timestamp: number) => draw.current?.(timestamp), [])
  const onPlaybackError = useCallback((error: unknown) => setError(describeError(error)), [])

  async function togglePlayback() {
    try {
      setError(null)
      if (playback.current === null) throw new Error('Video preview is not ready.')
      await playback.current.toggle()
    } catch (error) {
      setError(describeError(error))
    }
  }

  return (
    <div className="studio-player">
      <MediaViewport size={probe} compactControls>
        {({ displaySize, gridSpacing }) => (
          <>
            <ProjectPreview
              project={project}
              assets={mediaAssets}
              time={time}
              onTime={onTime}
              onFrame={onFrame}
              onPlaying={setIsPlaying}
              onError={onPlaybackError}
              playbackRef={playback}
            />
            <canvas
              ref={setCanvas}
              width={rasterSize.width}
              height={rasterSize.height}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {isPlaying
              ? null
              : scene.renderLayers.map((layer, index) => {
                  const outcome = outcomes[index]
                  if (outcome === undefined || layer.spec.style.tiling.enabled) return null
                  const spec = videoSpecAt(layer.spec, scene.value.animations[layer.id], time)
                  return (
                    <MarkOverlay
                      key={layer.id}
                      placement={outcome.placement}
                      position={spec.placement}
                      previewSize={rasterSize}
                      displaySize={displaySize}
                      scale={spec.style.scale}
                      rotation={spec.style.rotation}
                      margin={spec.style.margin}
                      gridSpacing={gridSpacing}
                      active={layer.id === scene.value.activeId}
                      onSelect={() => {
                        scene.select(layer.id)
                        onSelectMark?.()
                      }}
                      onGesture={(gesture) => onGesture(layer.id, gesture)}
                    />
                  )
                })}
          </>
        )}
      </MediaViewport>
      <div className="studio-transport">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(isPlaying ? 'video.timeline.pause' : 'video.timeline.play')}
          onClick={() => {
            void togglePlayback()
          }}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </Button>
        <RangeSlider
          label={t('video.timeline.playhead')}
          value={time}
          min={0}
          max={probe.durationSeconds}
          step={VIDEO_PROJECT_LIMITS.timeStep}
          onChange={(value) => {
            playback.current?.seek(value)
          }}
        />
        <output className="studio-timecode" dir="ltr">
          {t('video.studio.timeReadout', {
            current: videoTimeLabel(time),
            total: videoTimeLabel(probe.durationSeconds),
          })}
        </output>
      </div>
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {resources.error === null ? null : <Alert tone="error">{resources.error}</Alert>}
    </div>
  )
}
