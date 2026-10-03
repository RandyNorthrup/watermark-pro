import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
} from 'mediabunny'
import type { VideoSample } from 'mediabunny'

import { finalizeAacMp4 } from './aac-mp4-timing'
import { CancelledError } from './errors'
import { context2d } from './frame'
import { createFrameEncoder } from './frame-encoder'
import { videoMotionSchema, videoSpecAt } from './motion'
import { checkVideoLimits } from './plan'
import { encodeProjectAudio, type PreparedProjectAudio } from './project-audio'
import type { TranscodeProgress, TranscodeRequest } from './transcode'
import { artworkLicenseNotice } from '../../shared/asset-licenses'
import { MAX_VIDEO_BYTES, VIDEO_PROJECT_LIMITS } from '../../shared/constants'
import {
  clipEnd,
  projectDuration,
  videoProjectSchema,
  type ProjectVideoClip,
  type VideoProject,
} from '../../shared/video-project'
import type { LuminanceMap } from '../engine/analysis'
import { analysePixels, composeMark } from '../engine/pipeline'

export interface ProjectSource {
  id: string
  source: Blob
}
export interface ProjectComposition {
  project: VideoProject
  sources: ProjectSource[]
  /** Keep automatic watermark placement identical to the reference image in the viewer. */
  referenceMap?: LuminanceMap
}
interface VideoCursor {
  clip: ProjectVideoClip
  samples: AsyncGenerator<VideoSample | null, void, unknown>
}

function check(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError()
}

function* sourceTimes(clip: ProjectVideoClip) {
  const fps = VIDEO_PROJECT_LIMITS.framesPerSecond
  for (
    let frame = Math.floor(clip.start * fps);
    frame / fps < clipEnd(clip) - VIDEO_PROJECT_LIMITS.timeEpsilon;
    frame += 1
  )
    if (frame / fps >= clip.start - VIDEO_PROJECT_LIMITS.timeEpsilon)
      yield Math.max(clip.in, clip.in + frame / fps - clip.start)
}

/** Render every project frame with real cuts, gaps, layered picture and a synchronized audio mix. */
export async function transcodeProject(
  request: TranscodeRequest & ProjectComposition,
  progress: TranscodeProgress = {},
): Promise<Blob> {
  const { plan, marks, signal } = request
  const project = videoProjectSchema.parse(request.project)
  const duration = projectDuration(project)
  if (duration <= 0 || project.clips.every((clip) => clip.kind !== 'video'))
    throw new Error('Add video to the timeline before exporting.')
  if (
    request.sources.length > VIDEO_PROJECT_LIMITS.assets ||
    request.sources.reduce((bytes, asset) => bytes + asset.source.size, 0) > MAX_VIDEO_BYTES
  )
    throw new RangeError('Project media exceeds the browser editing limit.')
  const inputs = new Map<string, Input>()
  const cursors: VideoCursor[] = []
  const motions = (request.motions ?? []).map((motion) =>
    motion === null ? null : videoMotionSchema.parse(motion),
  )
  if (motions.length > marks.length)
    throw new RangeError('Video motion must belong to an existing watermark layer.')
  const canvas = new OffscreenCanvas(plan.output.width, plan.output.height)
  const context = context2d(canvas)
  const output = new Output({
    format:
      plan.container === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const encoder = createFrameEncoder(canvas, plan)
  const video = encoder.source
  output.addVideoTrack(video, { frameRate: VIDEO_PROJECT_LIMITS.framesPerSecond })
  const notice = artworkLicenseNotice(marks.map((mark) => mark.spec))
  if (notice !== null) output.setMetadataTags({ comment: notice })
  let audio: PreparedProjectAudio | null = null
  try {
    for (const asset of request.sources) {
      check(signal)
      if (inputs.has(asset.id)) throw new Error('Project media identities must be unique.')
      inputs.set(
        asset.id,
        new Input({ source: new BlobSource(asset.source), formats: ALL_FORMATS }),
      )
    }
    for (const clip of project.clips) {
      check(signal)
      const input = inputs.get(clip.assetId)
      const asset = request.sources.find((source) => source.id === clip.assetId)
      if (input === undefined || asset === undefined)
        throw new Error('A timeline source is missing.')
      const seconds = await input.computeDuration()
      if (clip.out > seconds + 1 / VIDEO_PROJECT_LIMITS.sampleRate)
        throw new RangeError('A trim extends beyond its source.')
      if (clip.kind !== 'video') continue
      const track = await input.getPrimaryVideoTrack()
      if (track === null || !(await track.canDecode()))
        throw new Error('This video track cannot be decoded in this browser.')
      const limit = checkVideoLimits({
        bytes: asset.source.size,
        seconds,
        width: await track.getDisplayWidth(),
        height: await track.getDisplayHeight(),
      })
      if (limit !== null) throw new RangeError(limit.message)
      if (project.hiddenVideo.at(clip.track) !== true)
        cursors.push({
          clip,
          samples: new VideoSampleSink(track).samplesAtTimestamps(sourceTimes(clip)),
        })
    }
    audio = await encodeProjectAudio(project, inputs, output, plan, duration, signal)
    await output.start()
    let map: LuminanceMap | null = request.referenceMap ?? null
    const fps = VIDEO_PROJECT_LIMITS.framesPerSecond
    const ordered = cursors.toSorted((a, b) => a.clip.track - b.clip.track)
    let submittedFrames = 0
    for (let frame = 0; frame / fps < duration - VIDEO_PROJECT_LIMITS.timeEpsilon; frame += 1) {
      check(signal)
      const timestamp = frame / fps
      context.fillStyle = '#000000'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const active = ordered.filter(
        (entry) =>
          timestamp >= entry.clip.start - VIDEO_PROJECT_LIMITS.timeEpsilon &&
          timestamp < clipEnd(entry.clip) - VIDEO_PROJECT_LIMITS.timeEpsilon,
      )
      for (const cursor of active) {
        const clip = cursor.clip
        const next = await cursor.samples.next()
        if (next.done === true || next.value === null)
          throw new Error('A timeline frame could not be decoded.')
        const sample = next.value
        try {
          const fit =
            Math.min(canvas.width / sample.displayWidth, canvas.height / sample.displayHeight) *
            clip.scale
          const width = sample.displayWidth * fit
          const height = sample.displayHeight * fit
          context.save()
          context.globalAlpha = clip.opacity
          sample.draw(
            context,
            clip.x * canvas.width - width / 2,
            clip.y * canvas.height - height / 2,
            width,
            height,
          )
          context.restore()
        } finally {
          sample.close()
        }
      }
      map ??= analysePixels(context.getImageData(0, 0, canvas.width, canvas.height))
      for (const [index, mark] of marks.entries())
        composeMark(context, plan.output, map, {
          ...mark,
          spec: videoSpecAt(mark.spec, motions[index], timestamp),
        })
      await video.add(timestamp, Math.min(1 / fps, duration - timestamp))
      submittedFrames += 1
      progress.onProgress?.(frame + 1, timestamp)
    }
    video.close()
    const timing = await audio?.drain()
    await output.finalize()
    encoder.verifyFrameCount(submittedFrames)
    if (output.target.buffer === null) throw new Error('The timeline was finalized without data.')
    if (timing != null) {
      if (plan.container !== 'mp4') throw new Error('AAC timing requires an MP4 output.')
      return finalizeAacMp4(output.target.buffer, timing)
    }
    return new Blob([output.target.buffer], { type: `video/${plan.container}` })
  } catch (error) {
    await audio?.cancel()
    if (output.state !== 'finalized') await output.cancel()
    throw error
  } finally {
    for (const cursor of cursors) await cursor.samples.return()
    for (const input of inputs.values()) input.dispose()
  }
}
