import { Eye, EyeOff, Music2, Volume2, VolumeX } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MAX_VIDEO_SECONDS, VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import {
  clipEnd,
  projectDuration,
  videoProjectSchema,
  type ClipEdit,
  type ProjectClip,
  type VideoProject,
} from '../../../shared/video-project'
import type { ProjectMediaAsset } from '../../video/project-media'
import { videoTimeLabel } from '../../video/time'
import { RangeSlider } from '../ui/slider-field'

type GestureMode = 'move' | 'in' | 'out'
interface ClipGesture {
  clip: ProjectClip
  mode: GestureMode
  x: number
  pixelsPerSecond: number
  duration: number
}

/** Six real lanes share project time; drag/trim gestures each produce one history entry. */
export function ProjectTimeline({
  project,
  assets,
  selectedId,
  time,
  onSelect,
  onEdit,
  onChange,
  onSeek,
  onBegin,
  onEnd,
}: {
  project: VideoProject
  assets: readonly ProjectMediaAsset[]
  selectedId: string | null
  time: number
  onSelect: (id: string) => void
  onEdit: (id: string, edit: ClipEdit) => void
  onChange: (project: VideoProject) => void
  onSeek: (time: number) => void
  onBegin: () => void
  onEnd: () => void
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)
  const [lanes, setLanes] = useState<HTMLDivElement | null>(null)
  const gesture = useRef<ClipGesture | null>(null)
  const duration = Math.max(1, projectDuration(project))
  const tracks = [
    ...Array.from({ length: VIDEO_PROJECT_LIMITS.videoTracks }, (_, index) => ({
      kind: 'video' as const,
      track: VIDEO_PROJECT_LIMITS.videoTracks - index - 1,
    })),
    ...Array.from({ length: VIDEO_PROJECT_LIMITS.audioTracks }, (_, track) => ({
      kind: 'audio' as const,
      track,
    })),
  ]
  function editDelta(clip: ProjectClip, mode: GestureMode, delta: number, sourceDuration: number) {
    const ticksPerSecond = 1 / VIDEO_PROJECT_LIMITS.timeStep
    const snap = (value: number) => Math.round(value * ticksPerSecond) / ticksPerSecond
    if (mode === 'move')
      return {
        start: Math.max(
          0,
          Math.min(MAX_VIDEO_SECONDS - (clip.out - clip.in), snap(clip.start + delta)),
        ),
      }
    if (mode === 'in') {
      const value = Math.max(
        -Math.min(clip.start, clip.in),
        Math.min(clip.out - clip.in - VIDEO_PROJECT_LIMITS.timeStep, snap(delta)),
      )
      return { start: snap(clip.start + value), in: snap(clip.in + value) }
    }
    return {
      out: Math.max(
        clip.in + VIDEO_PROJECT_LIMITS.timeStep,
        Math.min(sourceDuration, MAX_VIDEO_SECONDS - clip.start + clip.in, snap(clip.out + delta)),
      ),
    }
  }
  function begin(
    event: PointerEvent<HTMLButtonElement>,
    clip: ProjectClip,
    mode: GestureMode,
    asset: ProjectMediaAsset,
  ) {
    if (lanes === null || event.button !== 0) return
    onSelect(clip.id)
    onSeek(time)
    onBegin()
    gesture.current = {
      clip,
      mode,
      x: event.clientX,
      pixelsPerSecond:
        (lanes.getBoundingClientRect().width / duration) *
        (getComputedStyle(lanes).direction === 'rtl' ? -1 : 1),
      duration: asset.probe.durationSeconds,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (current === null || current.pixelsPerSecond === 0) return
    onEdit(
      current.clip.id,
      editDelta(
        current.clip,
        current.mode,
        (event.clientX - current.x) / current.pixelsPerSecond,
        current.duration,
      ),
    )
  }
  function end() {
    if (gesture.current === null) return
    gesture.current = null
    onEnd()
  }
  function key(
    event: KeyboardEvent<HTMLButtonElement>,
    clip: ProjectClip,
    mode: GestureMode,
    asset: ProjectMediaAsset,
  ) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) / VIDEO_PROJECT_LIMITS.framesPerSecond
    onEdit(clip.id, editDelta(clip, mode, delta, asset.probe.durationSeconds))
  }
  return (
    <section className="studio-timeline" aria-label={t('video.studio.timeline')}>
      <div className="studio-panel-title flex-wrap">
        <h2>{t('video.studio.timeline')}</h2>
        <output className="ms-auto font-mono text-xs tabular-nums">
          {t('video.studio.timeReadout', {
            current: videoTimeLabel(time),
            total: videoTimeLabel(projectDuration(project)),
          })}
        </output>
        <label className="flex items-center gap-2 text-xs font-normal">
          {t('editor.view.zoom')}
          <RangeSlider
            className="w-24"
            label={t('video.studio.zoom')}
            min={1}
            max={VIDEO_PROJECT_LIMITS.maximumZoom}
            step={1}
            value={zoom}
            onChange={setZoom}
          />
          <output className="w-6 tabular-nums">{`${String(zoom)}×`}</output>
        </label>
      </div>
      <div className="app-scroll-region overflow-x-auto overscroll-x-contain">
        <div className="studio-lanes" style={{ width: `${String(zoom * 100)}%` }}>
          <div className="studio-track-label" aria-hidden="true" />
          <div className="studio-ruler">
            <div
              className="studio-playhead"
              aria-hidden="true"
              style={{ insetInlineStart: `${String((time / duration) * 100)}%` }}
            />
            {Array.from({ length: VIDEO_PROJECT_LIMITS.rulerDivisions + 1 }, (_, index) => {
              const value = (duration * index) / VIDEO_PROJECT_LIMITS.rulerDivisions
              return (
                <button
                  type="button"
                  key={index}
                  className={
                    index === 0 ||
                    index === Math.floor(VIDEO_PROJECT_LIMITS.rulerDivisions / 2) ||
                    index === VIDEO_PROJECT_LIMITS.rulerDivisions
                      ? 'studio-tick'
                      : 'studio-tick studio-tick-detail'
                  }
                  style={{
                    insetInlineStart:
                      index === VIDEO_PROJECT_LIMITS.rulerDivisions
                        ? undefined
                        : `${String((index * 100) / VIDEO_PROJECT_LIMITS.rulerDivisions)}%`,
                    insetInlineEnd: index === VIDEO_PROJECT_LIMITS.rulerDivisions ? 0 : undefined,
                  }}
                  onClick={() => onSeek(Math.min(projectDuration(project), value))}
                >
                  {videoTimeLabel(value)}
                </button>
              )
            })}
          </div>
          {tracks.map(({ kind, track }) => {
            const name = `${kind === 'video' ? 'V' : 'A'}${String(track + 1)}`
            const isDisabled =
              (kind === 'video' ? project.hiddenVideo.at(track) : project.mutedAudio.at(track)) ===
              true
            const trackLabels =
              kind === 'video'
                ? ({
                    enabled: 'video.studio.hideTrack',
                    disabled: 'video.studio.showTrack',
                  } as const)
                : ({
                    enabled: 'video.studio.muteTrack',
                    disabled: 'video.studio.unmuteTrack',
                  } as const)
            const label = t(isDisabled ? trackLabels.disabled : trackLabels.enabled, {
              track: name,
            })
            const icons =
              kind === 'video'
                ? { enabled: Eye, disabled: EyeOff }
                : { enabled: Volume2, disabled: VolumeX }
            const Icon = isDisabled ? icons.disabled : icons.enabled
            return (
              <div key={name} className="contents">
                <div className="studio-track-label">
                  <span>{name}</span>
                  <button
                    type="button"
                    className="studio-track-switch"
                    aria-label={label}
                    aria-pressed={isDisabled}
                    onClick={() =>
                      onChange(
                        videoProjectSchema.parse(
                          kind === 'video'
                            ? {
                                ...project,
                                hiddenVideo: project.hiddenVideo.map((hidden, index) =>
                                  index === track ? !hidden : hidden,
                                ),
                              }
                            : {
                                ...project,
                                mutedAudio: project.mutedAudio.map((muted, index) =>
                                  index === track ? !muted : muted,
                                ),
                              },
                        ),
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div
                  ref={kind === 'video' && track === 0 ? setLanes : undefined}
                  className="studio-lane"
                  data-kind={kind}
                  data-track={name}
                >
                  <div
                    className="studio-playhead"
                    aria-hidden="true"
                    style={{ insetInlineStart: `${String((time / duration) * 100)}%` }}
                  />
                  {project.clips
                    .filter((clip) => clip.kind === kind && clip.track === track)
                    .map((clip) => {
                      const asset = assets.find((item) => item.id === clip.assetId)
                      if (asset === undefined) throw new Error('Timeline source is missing.')
                      return (
                        <div
                          key={clip.id}
                          className="studio-clip"
                          data-kind={kind}
                          data-selected={clip.id === selectedId}
                          style={{
                            insetInlineStart: `${String((clip.start / duration) * 100)}%`,
                            width: `${String(((clip.out - clip.in) / duration) * 100)}%`,
                          }}
                        >
                          {(['in', 'move', 'out'] as const).map((mode) => (
                            <TimelineClipButton
                              key={mode}
                              mode={mode}
                              clip={clip}
                              asset={asset}
                              track={name}
                              isSelected={clip.id === selectedId}
                              onBegin={begin}
                              onMove={move}
                              onEnd={end}
                              onKey={key}
                              onSelect={onSelect}
                            />
                          ))}
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {project.clips.length === 0 ? (
        <p className="border-t border-line p-3 text-center text-sm text-ink-muted">
          {t('video.studio.emptyTimeline')}
        </p>
      ) : null}
    </section>
  )
}

function TimelineClipButton({
  mode,
  clip,
  asset,
  track,
  isSelected,
  onBegin,
  onMove,
  onEnd,
  onKey,
  onSelect,
}: {
  mode: GestureMode
  clip: ProjectClip
  asset: ProjectMediaAsset
  track: string
  isSelected: boolean
  onBegin: (
    event: PointerEvent<HTMLButtonElement>,
    clip: ProjectClip,
    mode: GestureMode,
    asset: ProjectMediaAsset,
  ) => void
  onMove: (event: PointerEvent<HTMLButtonElement>) => void
  onEnd: () => void
  onKey: (
    event: KeyboardEvent<HTMLButtonElement>,
    clip: ProjectClip,
    mode: GestureMode,
    asset: ProjectMediaAsset,
  ) => void
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const label =
    mode === 'move'
      ? `${track}: ${asset.file.name}, ${videoTimeLabel(clip.start)} – ${videoTimeLabel(clipEnd(clip))}`
      : t(mode === 'in' ? 'video.studio.trimIn' : 'video.studio.trimOut', {
          name: asset.file.name,
          track,
        })
  return (
    <button
      type="button"
      className={mode === 'move' ? 'studio-clip-body' : 'studio-trim'}
      aria-label={label}
      aria-pressed={mode === 'move' ? isSelected : undefined}
      onPointerDown={(event) => onBegin(event, clip, mode, asset)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onLostPointerCapture={onEnd}
      onKeyDown={(event) => onKey(event, clip, mode, asset)}
      onClick={() => onSelect(clip.id)}
    >
      {mode === 'move' ? (
        <>
          {asset.kind === 'video' ? (
            <img className="studio-clip-poster" src={asset.poster} alt="" draggable={false} />
          ) : (
            <Music2 className="size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{asset.file.name}</span>
          <span className="shrink-0 truncate opacity-80">
            {videoTimeLabel(clip.out - clip.in)}
            {clip.kind === 'audio' ? ` · ${String(Math.round(clip.gain * 100))}%` : ''}
          </span>
        </>
      ) : null}
    </button>
  )
}
