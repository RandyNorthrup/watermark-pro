/**
 * The heart of the video tool: decode every frame, draw the watermark on it
 * with the existing engine, and re-encode, while the audio track is copied
 * through (or re-encoded, or dropped) per the plan. Placement and the
 * luminance map are computed once, from the first frame, and reused for every
 * frame so the mark never jumps. Cancellation resolves with a `CancelledError`,
 * releases the encoder, and closes every decoded frame — no dangling frames.
 *
 * Browser-bound (WebCodecs + mediabunny + OffscreenCanvas) and runs inside the
 * Web Worker, so it is coverage-excluded; its pure arithmetic lives in
 * `plan.ts`. It matches the proven M17.0 spike pipeline exactly.
 */
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  WebMOutputFormat,
} from 'mediabunny'
import type { InputAudioTrack, InputVideoTrack, OutputFormat } from 'mediabunny'

import { CancelledError } from './errors'
import { context2d } from './frame'
import type { AudioPlan, TranscodePlan, VideoContainer } from './plan'
import type { LuminanceMap } from '../engine/analysis'
import type { Size } from '../engine/layout'
import { analysePixels, composeMark } from '../engine/pipeline'
import type { RenderableMark } from '../engine/render'

export interface TranscodeRequest {
  source: Blob
  /** Resolved marks (bitmaps, icon paths, seeds already attached), drawn in order. */
  marks: RenderableMark[]
  plan: TranscodePlan
  signal: AbortSignal
}

export interface TranscodeProgress {
  /** Called after each frame with the running count and the frame's timestamp (seconds). */
  onProgress?: (frames: number, timestampSeconds: number) => void
}

const OUTPUT_MIME: Record<VideoContainer, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
}

/** H.264/HEVC go in MP4, the open codecs in WebM. */
function outputFormatFor(container: VideoContainer): OutputFormat {
  return container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat()
}

/** Read through a function so TypeScript does not narrow `aborted` across an await. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

type AudioPipe =
  | { kind: 'copy'; source: EncodedAudioPacketSource; track: InputAudioTrack }
  | { kind: 'reencode'; source: AudioBufferSource; track: InputAudioTrack }
  | null

/** Adds the output audio track (before the output starts) and returns how to drain it, or null. */
async function buildAudioPipe(input: Input, output: Output, audio: AudioPlan): Promise<AudioPipe> {
  if (audio.mode === 'none') {
    return null
  }
  const track = await input.getPrimaryAudioTrack()
  if (track === null) {
    return null
  }
  if (audio.mode === 'copy') {
    const source = new EncodedAudioPacketSource(audio.codec)
    output.addAudioTrack(source)
    return { kind: 'copy', source, track }
  }
  const source = new AudioBufferSource({
    codec: audio.codec,
    quality: new Quality({ bitrate: audio.bitrate }),
  })
  output.addAudioTrack(source)
  return { kind: 'reencode', source, track }
}

/** Copies the encoded audio packets through, or decodes and re-encodes them. */
async function drainAudio(pipe: AudioPipe, signal: AbortSignal): Promise<void> {
  if (pipe === null) {
    return
  }
  if (pipe.kind === 'copy') {
    const packetSink = new EncodedPacketSink(pipe.track)
    const decoderConfig = await pipe.track.getDecoderConfig()
    let meta: EncodedAudioChunkMetadata | undefined =
      decoderConfig === null ? undefined : { decoderConfig }
    for await (const packet of packetSink.packets()) {
      if (isAborted(signal)) {
        throw new CancelledError()
      }
      await pipe.source.add(packet, meta)
      meta = undefined
    }
  } else {
    const bufferSink = new AudioBufferSink(pipe.track)
    for await (const wrapped of bufferSink.buffers()) {
      if (isAborted(signal)) {
        throw new CancelledError()
      }
      await pipe.source.add(wrapped.buffer)
    }
  }
  pipe.source.close()
}

/**
 * Decodes, marks and re-encodes every frame. Every decoded sample is closed
 * (including the in-flight one when cancelled), and the placement map is taken
 * from the first frame and reused for the rest.
 */
async function encodeFrames(
  track: InputVideoTrack,
  ctx: OffscreenCanvasRenderingContext2D,
  size: Size,
  marks: readonly RenderableMark[],
  videoSource: CanvasSource,
  signal: AbortSignal,
  progress: TranscodeProgress,
): Promise<void> {
  const sink = new VideoSampleSink(track)
  let map: LuminanceMap | null = null
  let index = 0
  for await (const sample of sink.samples()) {
    if (isAborted(signal)) {
      sample.close()
      throw new CancelledError()
    }
    const { timestamp, duration } = sample
    ctx.clearRect(0, 0, size.width, size.height)
    sample.draw(ctx, 0, 0, size.width, size.height)
    sample.close()
    map ??= analysePixels(ctx.getImageData(0, 0, size.width, size.height))
    for (const mark of marks) {
      composeMark(ctx, size, map, mark)
    }
    await videoSource.add(timestamp, duration > 0 ? duration : undefined)
    index += 1
    progress.onProgress?.(index, timestamp)
  }
}

/** Transcodes one video, drawing the marks on every frame; returns the muxed file. */
export async function transcodeVideo(
  request: TranscodeRequest,
  progress: TranscodeProgress = {},
): Promise<Blob> {
  const { source, marks, plan, signal } = request
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (videoTrack === null) {
    throw new Error('This file has no video track.')
  }
  const { width, height } = plan.output
  const canvas = new OffscreenCanvas(width, height)
  const ctx = context2d(canvas)
  const output = new Output({ format: outputFormatFor(plan.container), target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, {
    codec: plan.videoCodec,
    quality: new Quality({ bitrate: plan.bitrate }),
  })
  output.addVideoTrack(videoSource)
  const audioPipe = await buildAudioPipe(input, output, plan.audio)

  await output.start()
  try {
    await encodeFrames(videoTrack, ctx, { width, height }, marks, videoSource, signal, progress)
    videoSource.close()
    await drainAudio(audioPipe, signal)
    await output.finalize()
  } catch (error) {
    // Release the encoder and every internal resource whether we were cancelled
    // or hit a real failure; then let the caller see which it was.
    await output.cancel()
    throw error
  }
  const { buffer } = output.target
  if (buffer === null) {
    throw new Error('The video was finalised without any data.')
  }
  return new Blob([buffer], { type: OUTPUT_MIME[plan.container] })
}
