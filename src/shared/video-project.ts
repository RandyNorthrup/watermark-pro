import { z } from 'zod'

import { MAX_VIDEO_SECONDS, MAX_VIDEO_SIDE, VIDEO_PROJECT_LIMITS } from './constants'

const identity = z.string().min(1).max(VIDEO_PROJECT_LIMITS.identityCharacters)
const seconds = z.number().min(0).max(MAX_VIDEO_SECONDS)
const unit = z.number().min(0).max(1)
const common = {
  id: identity,
  assetId: identity,
  start: seconds,
  in: seconds,
  out: seconds,
}
const videoClipSchema = z.object({
  ...common,
  kind: z.literal('video'),
  track: z
    .number()
    .int()
    .min(0)
    .max(VIDEO_PROJECT_LIMITS.videoTracks - 1),
  x: unit,
  y: unit,
  scale: z.number().min(VIDEO_PROJECT_LIMITS.minimumScale).max(VIDEO_PROJECT_LIMITS.maximumScale),
  opacity: unit,
})
const audioClipSchema = z.object({
  ...common,
  kind: z.literal('audio'),
  track: z
    .number()
    .int()
    .min(0)
    .max(VIDEO_PROJECT_LIMITS.audioTracks - 1),
  gain: unit,
  linkedVideoId: identity.nullable(),
})
export const videoProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(VIDEO_PROJECT_LIMITS.nameCharacters),
    width: z.number().int().min(1).max(MAX_VIDEO_SIDE),
    height: z.number().int().min(1).max(MAX_VIDEO_SIDE),
    clips: z
      .array(z.discriminatedUnion('kind', [videoClipSchema, audioClipSchema]))
      .max(VIDEO_PROJECT_LIMITS.clips),
    hiddenVideo: z.tuple([z.boolean(), z.boolean()]),
    mutedAudio: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
  })
  .superRefine((project, context) => {
    const ids = new Set<string>()
    const linked = new Set<string>()
    for (const clip of project.clips) {
      if (
        ids.has(clip.id) ||
        clip.out <= clip.in ||
        clipEnd(clip) > MAX_VIDEO_SECONDS + VIDEO_PROJECT_LIMITS.timeEpsilon
      )
        context.addIssue({
          code: 'custom',
          message: 'Clip identities and intervals must be valid.',
          path: ['clips'],
        })
      ids.add(clip.id)
      if (
        clip.kind === 'video' &&
        project.clips.some(
          (other) =>
            other.kind === 'video' &&
            other.id !== clip.id &&
            other.track === clip.track &&
            other.start < clipEnd(clip) - VIDEO_PROJECT_LIMITS.timeEpsilon &&
            clip.start < clipEnd(other) - VIDEO_PROJECT_LIMITS.timeEpsilon,
        )
      )
        context.addIssue({
          code: 'custom',
          message: 'Video clips cannot overlap on the same track.',
          path: ['clips'],
        })
      if (clip.kind === 'audio' && clip.linkedVideoId !== null) {
        const video = project.clips.find(
          (other) => other.id === clip.linkedVideoId && other.kind === 'video',
        )
        if (
          video === undefined ||
          linked.has(clip.linkedVideoId) ||
          video.assetId !== clip.assetId ||
          video.start !== clip.start ||
          video.in !== clip.in ||
          video.out !== clip.out
        )
          context.addIssue({
            code: 'custom',
            message: 'Linked audio must match its video clip.',
            path: ['clips'],
          })
        linked.add(clip.linkedVideoId)
      }
    }
  })

export type VideoProject = z.infer<typeof videoProjectSchema>
export type ProjectClip = VideoProject['clips'][number]
export type ProjectVideoClip = Extract<ProjectClip, { kind: 'video' }>
export type ProjectAudioClip = Extract<ProjectClip, { kind: 'audio' }>
export interface ProjectAssetInfo {
  id: string
  kind: 'video' | 'audio'
  duration: number
  hasAudio: boolean
}
export interface ClipEdit {
  start?: number
  in?: number
  out?: number
  track?: number
  x?: number
  y?: number
  scale?: number
  opacity?: number
  gain?: number
}

/** Clip end is derived from its trimmed source interval, never stored separately. */
export function clipEnd(clip: Pick<ProjectClip, 'start' | 'in' | 'out'>): number {
  return clip.start + clip.out - clip.in
}
/** The timeline includes deliberate gaps and audio extending beyond picture. */
export function projectDuration(project: VideoProject): number {
  return Math.max(0, ...project.clips.map((clip) => clipEnd(clip)))
}
/** Empty timelines are valid editor state; export separately requires picture. */
export function emptyVideoProject(
  name: string,
  width: number = VIDEO_PROJECT_LIMITS.defaultWidth,
  height: number = VIDEO_PROJECT_LIMITS.defaultHeight,
): VideoProject {
  return videoProjectSchema.parse({
    name,
    width,
    height,
    clips: [],
    hiddenVideo: [false, false],
    mutedAudio: [false, false, false, false],
  })
}
/** Importing video appends linked source audio; standalone sound starts on A3. */
export function appendProjectClip(
  project: VideoProject,
  asset: ProjectAssetInfo,
  track = asset.kind === 'video' ? 0 : 2,
): VideoProject {
  const start =
    asset.kind === 'video'
      ? Math.max(
          0,
          ...project.clips
            .filter((clip) => clip.kind === 'video' && clip.track === track)
            .map((clip) => clipEnd(clip)),
        )
      : 0
  const base = { id: crypto.randomUUID(), assetId: asset.id, start, in: 0, out: asset.duration }
  const clip: ProjectClip =
    asset.kind === 'video'
      ? { ...base, kind: 'video', track, x: 0.5, y: 0.5, scale: 1, opacity: 1 }
      : { ...base, kind: 'audio', track, gain: 1, linkedVideoId: null }
  const clips = [...project.clips, clip]
  if (clip.kind === 'video' && asset.hasAudio)
    clips.push({
      ...base,
      id: crypto.randomUUID(),
      kind: 'audio',
      track,
      gain: 1,
      linkedVideoId: clip.id,
    })
  return videoProjectSchema.parse({ ...project, clips })
}
/** Editing a linked source interval moves/trims picture and sound together. */
export function editProjectClip(project: VideoProject, id: string, edit: ClipEdit): VideoProject {
  const selected = project.clips.find((clip) => clip.id === id)
  if (selected === undefined) throw new RangeError('Select an existing clip.')
  if (
    (selected.kind === 'video' && edit.gain !== undefined) ||
    (selected.kind === 'audio' &&
      [edit.x, edit.y, edit.scale, edit.opacity].some((value) => value !== undefined))
  )
    throw new RangeError('Clip controls must match their media type.')
  const videoId = selected.kind === 'video' ? selected.id : selected.linkedVideoId
  const clips = project.clips.map((clip) => {
    if (clip.id === id) return { ...clip, ...edit }
    const isLinked =
      videoId !== null &&
      (clip.id === videoId || (clip.kind === 'audio' && clip.linkedVideoId === videoId))
    if (!isLinked) return clip
    return {
      ...clip,
      start: edit.start ?? clip.start,
      in: edit.in ?? clip.in,
      out: edit.out ?? clip.out,
    }
  })
  return videoProjectSchema.parse({ ...project, clips })
}
/** Split refuses endpoints; linked picture/sound retain synchronized source offsets. */
export function splitProjectClip(project: VideoProject, id: string, time: number): VideoProject {
  const selected = project.clips.find((clip) => clip.id === id)
  if (selected === undefined || time <= selected.start || time >= clipEnd(selected))
    throw new RangeError('Split must be inside the selected clip.')
  const videoId = selected.kind === 'video' ? selected.id : selected.linkedVideoId
  const rightVideoId = crypto.randomUUID()
  const clips = project.clips.flatMap((clip) => {
    if (
      clip.id !== id &&
      (videoId === null ||
        !(clip.id === videoId || (clip.kind === 'audio' && clip.linkedVideoId === videoId)))
    )
      return [clip]
    const cut = clip.in + time - clip.start
    const right = {
      ...clip,
      id: clip.kind === 'video' ? rightVideoId : crypto.randomUUID(),
      start: time,
      in: cut,
    }
    return [
      { ...clip, out: cut },
      right.kind === 'audio'
        ? { ...right, linkedVideoId: videoId === null ? null : rightVideoId }
        : right,
    ]
  })
  return videoProjectSchema.parse({ ...project, clips })
}
/** Linked deletion never leaves orphan sound in the timeline. Imported assets remain reusable. */
export function removeProjectClip(project: VideoProject, id: string): VideoProject {
  const selected = project.clips.find((clip) => clip.id === id)
  if (selected === undefined) throw new RangeError('Select an existing clip.')
  const videoId = selected.kind === 'video' ? selected.id : selected.linkedVideoId
  return videoProjectSchema.parse({
    ...project,
    clips: project.clips.filter(
      (clip) =>
        clip.id !== id &&
        (videoId === null ||
          !(clip.id === videoId || (clip.kind === 'audio' && clip.linkedVideoId === videoId))),
    ),
  })
}
/** Explicit unlink allows independent sound placement without altering picture. */
export function unlinkProjectAudio(project: VideoProject, id: string): VideoProject {
  const selected = project.clips.find((clip) => clip.id === id)
  if (selected?.kind !== 'audio' || selected.linkedVideoId === null)
    throw new RangeError('Select linked audio.')
  return videoProjectSchema.parse({
    ...project,
    clips: project.clips.map((clip) => (clip.id === id ? { ...clip, linkedVideoId: null } : clip)),
  })
}
