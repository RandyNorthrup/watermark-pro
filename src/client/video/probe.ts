/**
 * Reads a video's metadata and refuses an over-limit file *before* a single
 * frame is decoded, plus samples one frame for the preview. Native browser
 * tests exercise mediabunny and OffscreenCanvas with V8 coverage; the limit
 * arithmetic lives in `plan.ts` and has independent unit tests.
 */
import type { AudioCodec, Input, VideoCodec } from 'mediabunny'

import { context2d } from './frame'
import { checkVideoLimits, DEFAULT_VIDEO_LIMITS, type VideoLimit, type VideoLimits } from './plan'

/** Thrown when a file exceeds a limit; carries which one for the UI. */
export class VideoLimitError extends Error {
  override readonly name = 'VideoLimitError'
  readonly reason: VideoLimit['reason']

  constructor(limit: VideoLimit) {
    super(limit.message)
    this.reason = limit.reason
  }
}

export interface VideoProbe {
  /** Duration in seconds, from packet timestamps (no frame is decoded). */
  durationSeconds: number
  /** Display width and height, after rotation and pixel-aspect adjustment. */
  width: number
  height: number
  videoCodec: VideoCodec
  /** The input audio codec, or null when the file has no audio track. */
  audioCodec: AudioCodec | null
}

async function inputFor(file: Blob): Promise<Input> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny')
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
}

/**
 * Reads duration, display size, and codecs, then refuses the file if it breaks
 * a limit. Only metadata is touched here — no `VideoSampleSink` is created — so
 * an over-limit file is rejected before any decoding work begins.
 */
export async function probeVideo(
  file: File,
  limits: VideoLimits = DEFAULT_VIDEO_LIMITS,
): Promise<VideoProbe> {
  const input = await inputFor(file)
  const videoTrack = await input.getPrimaryVideoTrack()
  if (videoTrack === null) {
    throw new Error('This file has no video track.')
  }
  const [durationSeconds, width, height, videoCodec] = await Promise.all([
    input.computeDuration(),
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    videoTrack.getCodec(),
  ])
  if (videoCodec === null) {
    throw new Error('This video uses a codec the browser cannot read.')
  }
  const limit = checkVideoLimits(
    { bytes: file.size, seconds: durationSeconds, width, height },
    limits,
  )
  if (limit !== null) {
    throw new VideoLimitError(limit)
  }
  const audioTrack = await input.getPrimaryAudioTrack()
  const audioCodec = audioTrack === null ? null : await audioTrack.getCodec()
  return { durationSeconds, width, height, videoCodec, audioCodec }
}

/**
 * Decodes a single frame at `timestampSeconds` (clamped by the sink) to a PNG,
 * for the still preview the editor path renders the chosen layers onto.
 */
export async function sampleFrame(file: File, timestampSeconds: number): Promise<Blob> {
  const { VideoSampleSink } = await import('mediabunny')
  const input = await inputFor(file)
  const videoTrack = await input.getPrimaryVideoTrack()
  if (videoTrack === null) {
    throw new Error('This file has no video track.')
  }
  const sink = new VideoSampleSink(videoTrack)
  const sample = await sink.getSample(timestampSeconds)
  if (sample === null) {
    throw new Error('Could not read a frame from this video.')
  }
  const canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight)
  // `draw` honours the track's rotation metadata; the destination is the
  // display size, so a rotated phone clip previews upright.
  sample.draw(context2d(canvas), 0, 0, canvas.width, canvas.height)
  sample.close()
  return await canvas.convertToBlob({ type: 'image/png' })
}
