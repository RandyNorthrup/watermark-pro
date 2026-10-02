import {
  type Ref,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import {
  clipEnd,
  projectDuration,
  type ProjectClip,
  type VideoProject,
} from '../../../shared/video-project'
import type { ProjectMediaAsset } from '../../video/project-media'

export interface ProjectPlaybackHandle {
  toggle: () => Promise<void>
  seek: (time: number) => void
}
interface SoundNode {
  source: MediaElementAudioSourceNode
  gain: GainNode
}

/** Native local media follows project time; Web Audio supplies real per-clip gain and track mute. */
export function ProjectPreview({
  project,
  assets,
  time,
  onTime,
  onFrame,
  onPlaying,
  onError,
  playbackRef,
}: {
  project: VideoProject
  assets: readonly ProjectMediaAsset[]
  time: number
  onTime: (time: number) => void
  onFrame: (time: number) => void
  onPlaying: (isPlaying: boolean) => void
  onError: (error: unknown) => void
  playbackRef: Ref<ProjectPlaybackHandle>
}) {
  const [isPlaying, setPlaying] = useState(false)
  const elements = useRef(new Map<string, HTMLMediaElement>())
  const context = useRef<AudioContext | null>(null)
  const sounds = useRef(new WeakMap<HTMLMediaElement, SoundNode>())
  const clock = useRef(time)
  const playbackIntent = useRef(false)
  const playbackEpoch = useRef(0)
  const latest = useRef({ project, time, onTime, onFrame, onPlaying, onError })
  useLayoutEffect(() => {
    latest.current = { project, time, onTime, onFrame, onPlaying, onError }
  }, [project, time, onTime, onFrame, onPlaying, onError])
  const duration = projectDuration(project)
  const shownTime =
    time === duration && duration > 0
      ? Math.max(0, duration - 1 / VIDEO_PROJECT_LIMITS.framesPerSecond)
      : time
  const active = project.clips.filter(
    (clip) =>
      shownTime >= clip.start &&
      shownTime < clipEnd(clip) &&
      (clip.kind === 'audio' || project.hiddenVideo.at(clip.track) !== true),
  )

  const report = useCallback((error: unknown) => {
    playbackIntent.current = false
    playbackEpoch.current += 1
    setPlaying(false)
    for (const element of elements.current.values()) element.pause()
    latest.current.onPlaying(false)
    latest.current.onError(error)
  }, [])
  const synchronize = useCallback(
    (element: HTMLMediaElement, clip: ProjectClip, timestamp: number) => {
      const local = clip.in + Math.max(0, timestamp - clip.start)
      if (
        element.readyState > 0 &&
        (element.paused ||
          Math.abs(element.currentTime - local) > (1 / VIDEO_PROJECT_LIMITS.framesPerSecond) * 2)
      )
        element.currentTime = Math.min(clip.out, local)
      if (clip.kind === 'audio' && context.current !== null) {
        let sound = sounds.current.get(element)
        if (sound === undefined) {
          sound = {
            source: context.current.createMediaElementSource(element),
            gain: context.current.createGain(),
          }
          sound.source.connect(sound.gain)
          sound.gain.connect(context.current.destination)
          sounds.current.set(element, sound)
        }
        sound.gain.gain.value =
          latest.current.project.mutedAudio.at(clip.track) === true ? 0 : clip.gain
      }
    },
    [],
  )
  const register = useCallback((id: string, element: HTMLMediaElement | null) => {
    if (element === null) {
      elements.current.get(id)?.pause()
      elements.current.delete(id)
    } else elements.current.set(id, element)
  }, [])

  useImperativeHandle(
    playbackRef,
    () => ({
      seek(value) {
        playbackIntent.current = false
        playbackEpoch.current += 1
        setPlaying(false)
        for (const element of elements.current.values()) element.pause()
        clock.current = Math.max(0, Math.min(duration, value))
        onPlaying(false)
        onTime(clock.current)
        onFrame(clock.current)
      },
      async toggle() {
        if (playbackIntent.current) {
          playbackIntent.current = false
          playbackEpoch.current += 1
          setPlaying(false)
          for (const element of elements.current.values()) element.pause()
          onPlaying(false)
          onTime(clock.current)
          return
        }
        playbackEpoch.current += 1
        const epoch = playbackEpoch.current
        playbackIntent.current = true
        try {
          clock.current = time >= duration ? 0 : time
          onTime(clock.current)
          onPlaying(true)
          setPlaying(true)
          if (project.clips.some((clip) => clip.kind === 'audio')) {
            context.current ??= new AudioContext()
            await context.current.resume()
          }
          if (epoch !== playbackEpoch.current) return
          const starting = project.clips.filter(
            (clip) => clock.current >= clip.start && clock.current < clipEnd(clip),
          )
          const plays: Promise<void>[] = []
          for (const clip of starting) {
            const element = elements.current.get(clip.id)
            if (element !== undefined) {
              synchronize(element, clip, clock.current)
              plays.push(element.play())
            }
          }
          await Promise.all(plays)
        } catch (error) {
          if (epoch === playbackEpoch.current) report(error)
        }
      },
    }),
    [duration, onFrame, onPlaying, onTime, project.clips, report, synchronize, time],
  )

  useEffect(() => {
    for (const clip of active) {
      const element = elements.current.get(clip.id)
      if (element === undefined) continue
      synchronize(element, clip, shownTime)
      // A play request can precede the state commit. An older paused render must
      // not interrupt its native promise while React flushes pending effects.
      if (playbackIntent.current && element.paused) {
        const epoch = playbackEpoch.current
        void element.play().catch((error: unknown) => {
          if (epoch === playbackEpoch.current && elements.current.get(clip.id) === element)
            report(error)
        })
      } else if (!playbackIntent.current) element.pause()
    }
  }, [active, isPlaying, report, shownTime, synchronize])

  useEffect(() => {
    if (!isPlaying) return
    let request = 0
    let lastUpdate = 0
    let previous = performance.now()
    const epoch = playbackEpoch.current
    const tick = (now: number) => {
      if (epoch !== playbackEpoch.current) return
      clock.current = Math.min(
        duration,
        clock.current + Math.max(0, now - previous) / VIDEO_PROJECT_LIMITS.millisecondsPerSecond,
      )
      previous = now
      latest.current.onFrame(clock.current)
      if (
        now - lastUpdate >= VIDEO_PROJECT_LIMITS.previewUpdateMilliseconds ||
        clock.current >= duration
      ) {
        latest.current.onTime(clock.current)
        lastUpdate = now
      }
      if (clock.current >= duration) {
        playbackIntent.current = false
        playbackEpoch.current += 1
        setPlaying(false)
        for (const element of elements.current.values()) element.pause()
        latest.current.onPlaying(false)
      } else request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [duration, isPlaying])
  useEffect(
    () => () => {
      playbackIntent.current = false
      playbackEpoch.current += 1
      for (const element of elements.current.values()) element.pause()
      void context.current?.close().catch(report)
    },
    [report],
  )

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {active
        .toSorted((a, b) => a.track - b.track)
        .map((clip) => {
          const asset = assets.find((entry) => entry.id === clip.assetId)
          if (asset === undefined) throw new Error('Preview source is missing.')
          return (
            <ProjectMediaElement
              key={clip.id}
              asset={asset}
              clip={clip}
              register={register}
              onLoaded={(element) => synchronize(element, clip, shownTime)}
              onError={report}
            />
          )
        })}
    </div>
  )
}

function ProjectMediaElement({
  asset,
  clip,
  register,
  onLoaded,
  onError,
}: {
  asset: ProjectMediaAsset
  clip: ProjectClip
  register: (id: string, element: HTMLMediaElement | null) => void
  onLoaded: (element: HTMLMediaElement) => void
  onError: (error: unknown) => void
}) {
  const attach = useCallback(
    (element: HTMLMediaElement | null) => register(clip.id, element),
    [clip.id, register],
  )
  const props = {
    ref: attach,
    src: asset.url,
    preload: 'auto',
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => onLoaded(event.currentTarget),
    onError: () => onError(new Error('This browser cannot play the selected media.')),
  }
  if (clip.kind === 'audio') return <audio {...props} aria-label={asset.file.name} />
  return (
    <video
      {...props}
      muted
      playsInline
      aria-label={asset.file.name}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      className="absolute h-full w-full object-contain"
      style={{
        left: `${String((clip.x - 1 / 2) * 100)}%`,
        top: `${String((clip.y - 1 / 2) * 100)}%`,
        transform: `scale(${String(clip.scale)})`,
        opacity: clip.opacity,
      }}
    />
  )
}
