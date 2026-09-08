/**
 * Generates short in-memory test clips with mediabunny, so the video browser
 * tests have real MP4/WebM input without a committed fixture. Test-support
 * only (coverage-excluded, never shipped).
 */
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny'
import type { AudioCodec, OutputFormat, VideoCodec } from 'mediabunny'

import { context2d } from '../frame'

export const CLIP_WIDTH = 320
export const CLIP_HEIGHT = 240
export const CLIP_FPS = 30
export const CLIP_SECONDS = 1
export const CLIP_FRAMES = CLIP_FPS * CLIP_SECONDS
const FRAME_DURATION = 1 / CLIP_FPS
const CLIP_BITRATE = 800_000
const AUDIO_BITRATE = 96_000
const SAMPLE_RATE = 48_000
const TONE_HZ = 440
const TONE_GAIN = 0.25
const SQUARE = 24
const SQUARE_STEP = 6

function formatFor(codec: VideoCodec): OutputFormat {
  return codec === 'avc' || codec === 'hevc' ? new Mp4OutputFormat() : new WebMOutputFormat()
}

/** A grey background with a blue square marching along the top, well clear of a bottom-right mark. */
function paintFrame(ctx: OffscreenCanvasRenderingContext2D, index: number): void {
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, CLIP_WIDTH, CLIP_HEIGHT)
  ctx.fillStyle = '#3060c0'
  ctx.fillRect((index * SQUARE_STEP) % (CLIP_WIDTH - SQUARE), 0, SQUARE, SQUARE)
}

function bufferOf(output: Output<OutputFormat, BufferTarget>): Blob {
  const { buffer } = output.target
  if (buffer === null) {
    throw new Error('the clip was finalised without a buffer')
  }
  return new Blob([buffer])
}

export interface TestClip {
  blob: Blob
  codec: VideoCodec
}

/** A short moving-square clip, video only. */
export async function encodeTestClip(): Promise<TestClip> {
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8', 'av1'], {
    width: CLIP_WIDTH,
    height: CLIP_HEIGHT,
  })
  if (codec === null) {
    throw new Error('this browser cannot encode a test clip')
  }
  const canvas = new OffscreenCanvas(CLIP_WIDTH, CLIP_HEIGHT)
  const ctx = context2d(canvas)
  const output = new Output({ format: formatFor(codec), target: new BufferTarget() })
  const source = new CanvasSource(canvas, {
    codec,
    quality: new Quality({ bitrate: CLIP_BITRATE }),
  })
  output.addVideoTrack(source)
  await output.start()
  for (let index = 0; index < CLIP_FRAMES; index += 1) {
    paintFrame(ctx, index)
    await source.add(index * FRAME_DURATION, FRAME_DURATION)
  }
  await output.finalize()
  return { blob: bufferOf(output), codec }
}

/** A short WebM clip with a VP-family video track and an Opus audio track. */
export async function encodeTestClipWithAudio(): Promise<Blob> {
  const videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], {
    width: CLIP_WIDTH,
    height: CLIP_HEIGHT,
  })
  const audioCodec: AudioCodec | null = await getFirstEncodableAudioCodec(['opus'], {
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
  })
  if (videoCodec === null || audioCodec === null) {
    throw new Error('this browser cannot encode a WebM + Opus clip')
  }
  const canvas = new OffscreenCanvas(CLIP_WIDTH, CLIP_HEIGHT)
  const ctx = context2d(canvas)
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: CLIP_BITRATE }),
  })
  const audioSource = new AudioBufferSource({
    codec: audioCodec,
    quality: new Quality({ bitrate: AUDIO_BITRATE }),
  })
  output.addVideoTrack(videoSource)
  output.addAudioTrack(audioSource)
  await output.start()
  const tone = new AudioBuffer({
    length: SAMPLE_RATE * CLIP_SECONDS,
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
  })
  const channel = tone.getChannelData(0)
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.sin((index / SAMPLE_RATE) * 2 * Math.PI * TONE_HZ) * TONE_GAIN
  }
  await audioSource.add(tone)
  for (let index = 0; index < CLIP_FRAMES; index += 1) {
    paintFrame(ctx, index)
    await videoSource.add(index * FRAME_DURATION, FRAME_DURATION)
  }
  await output.finalize()
  return bufferOf(output)
}
