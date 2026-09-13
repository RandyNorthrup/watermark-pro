import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { VIDEO_PREVIEW_MAX_SIDE } from '../../../shared/constants'
import type { LuminanceMap } from '../../engine/analysis'
import { contextOf } from '../../engine/canvas'
import type { Size } from '../../engine/layout'
import { composeMark, type MarkOutcome } from '../../engine/pipeline'
import { describeError } from '../../lib/errors'
import { specForPhoto } from '../../lib/spec-tokens'
import { VIDEO_MOTION_LIMITS, videoSpecAt } from '../../video/motion'
import type { VideoProbe } from '../../video/probe'
import { videoTimeLabel } from '../../video/time'
import { MarkOverlay, type MarkGesture } from '../editor/mark-overlay'
import { MediaViewport } from '../editor/media-viewport'
import { useMediaMarks } from '../editor/use-media-marks'
import type { MediaScene } from '../editor/use-media-scene'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'

interface VideoViewerProps {
  organizationId: string
  url: string
  file: File
  outputSize: Size
  probe: VideoProbe
  map: LuminanceMap
  scene: MediaScene
  time: number
  onTime: (time: number) => void
  onPlacements: (placements: MarkOutcome[]) => void
  onGesture: (id: string, gesture: MarkGesture) => void
}

/** Native playback beneath a transparent mark canvas; no video decode/PNG round trip during interaction. */
export function VideoViewer({
  organizationId,
  url,
  file,
  outputSize,
  probe,
  map,
  scene,
  time,
  onTime,
  onPlacements,
  onGesture,
}: VideoViewerProps) {
  const { t } = useTranslation()
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setVideo(element)
  }, [])
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
      if (video?.paused !== false)
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
    video,
  ])

  useEffect(() => {
    if (video === null || !isPlaying) return
    let isActive = true
    let frame = 0
    let previousTime = -1
    const paint = () => {
      if (!isActive) return
      if (video.currentTime !== previousTime) {
        draw.current?.(video.currentTime)
        previousTime = video.currentTime
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => {
      isActive = false
      cancelAnimationFrame(frame)
    }
  }, [video, isPlaying])

  useEffect(() => {
    const element = videoRef.current
    if (
      element === null ||
      !element.paused ||
      Math.abs(element.currentTime - time) < 1 / VIDEO_MOTION_LIMITS.timePrecision
    )
      return
    element.currentTime = time
  }, [video, time])

  useEffect(() => {
    const frame = requestAnimationFrame(() => draw.current?.(video?.currentTime ?? time))
    return () => cancelAnimationFrame(frame)
  }, [canvas, map, probe, resources.marks, scene.value.animations, time, video])

  async function togglePlayback() {
    if (video === null) return
    try {
      if (video.paused) await video.play()
      else video.pause()
      setError(null)
    } catch (error) {
      setError(describeError(error))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <MediaViewport size={probe}>
        {({ displaySize, gridSpacing }) => (
          <>
            <video
              ref={attachVideo}
              src={url}
              playsInline
              preload="metadata"
              aria-label={t('video.previewAlt')}
              width={probe.width}
              height={probe.height}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onPlay={() => setIsPlaying(true)}
              onPause={() => {
                setIsPlaying(false)
                if (video !== null) onTime(video.currentTime)
              }}
              onTimeUpdate={() => {
                if (video !== null) onTime(video.currentTime)
              }}
              onEnded={() => setIsPlaying(false)}
              onError={() => setError(t('video.timeline.playbackFailed'))}
              className="block h-full w-full max-w-none"
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
                      onSelect={() => scene.select(layer.id)}
                      onGesture={(gesture) => onGesture(layer.id, gesture)}
                    />
                  )
                })}
          </>
        )}
      </MediaViewport>
      <div className="flex items-end gap-3">
        <Button
          type="button"
          variant="secondary"
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
        <SliderField
          label={t('video.timeline.playhead')}
          className="flex-1"
          value={time}
          min={0}
          max={probe.durationSeconds}
          step={0.01}
          format={videoTimeLabel}
          onChange={(value) => {
            video?.pause()
            onTime(value)
          }}
        />
      </div>
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {resources.error === null ? null : <Alert tone="error">{resources.error}</Alert>}
    </div>
  )
}
