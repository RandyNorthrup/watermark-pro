/**
 * Pure decisions for the video pipeline, split out of the WebCodecs- and
 * mediabunny-bound modules the way `lib/logo-prepare-pipeline.ts` is split from
 * its canvas component: no DOM, no WebCodecs, no worker — so it runs and earns
 * its coverage in jsdom while `capabilities.ts`, `probe.ts` and `transcode.ts`
 * keep only the browser-bound glue. Everything here is bitrate/size/limit
 * arithmetic and codec→container bookkeeping the tests can exercise directly.
 *
 * The `VideoCodec`/`AudioCodec` types come from mediabunny type-only, so this
 * module pulls in none of its runtime.
 */
import type { AudioCodec, VideoCodec } from 'mediabunny'

import {
  AUDIO_CODEC_PREFERENCE,
  AUDIO_REENCODE_BITRATE,
  CODEC_CONTAINER,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MAX_VIDEO_SIDE,
  VIDEO_BITRATE_LADDER,
  VIDEO_BITRATE_REFERENCE_PIXELS,
  VIDEO_CODEC_PREFERENCE,
  VIDEO_FIT_HEIGHTS,
} from '../../shared/constants'
import type { Size } from '../engine/layout'
import { formatBytes } from '../lib/format-bytes'

/** The two containers the product writes; the codec chooses which (see `CODEC_CONTAINER`). */
export type VideoContainer = (typeof CODEC_CONTAINER)[keyof typeof CODEC_CONTAINER]

/** The user-facing "Quality" choices; each is a bitrate at 1080p, scaled by pixel count. */
export type VideoQuality = keyof typeof VIDEO_BITRATE_LADDER

/** The resolution choices: keep the source, or fit its height to 1080p / 720p. */
export type VideoResolution = 'original' | keyof typeof VIDEO_FIT_HEIGHTS

/** What happens to the input audio track in the output. */
export type AudioPlan =
  | { mode: 'none' }
  | { mode: 'copy'; codec: AudioCodec }
  | { mode: 'reencode'; codec: AudioCodec; bitrate: number }

/** The fully resolved recipe one transcode follows; crosses the worker boundary as plain data. */
export interface TranscodePlan {
  videoCodec: VideoCodec
  container: VideoContainer
  /** Target video bitrate in bits per second, already scaled for `output`. */
  bitrate: number
  /** Final frame size, even on both sides for 4:2:0 encoders. */
  output: Size
  audio: AudioPlan
}

/** The three hard limits a file is refused for, before any frame is decoded. */
export type VideoLimitReason = 'bytes' | 'seconds' | 'side'

export interface VideoLimit {
  reason: VideoLimitReason
  message: string
}

export interface VideoLimits {
  maxBytes: number
  maxSeconds: number
  maxSide: number
}

/** The shipped limits; overridable so tests can trip a limit on a tiny real clip. */
export const DEFAULT_VIDEO_LIMITS: VideoLimits = {
  maxBytes: MAX_VIDEO_BYTES,
  maxSeconds: MAX_VIDEO_SECONDS,
  maxSide: MAX_VIDEO_SIDE,
}

const VIDEO_CODEC_LABELS: Record<VideoCodec, string> = {
  avc: 'H.264',
  hevc: 'HEVC',
  vp9: 'VP9',
  av1: 'AV1',
  vp8: 'VP8',
  prores: 'ProRes',
}

const CONTAINER_LABELS: Record<VideoContainer, string> = {
  mp4: 'MP4',
  webm: 'WebM',
}

const AUDIO_CODEC_LABELS: Record<AudioContainerCodec, string> = {
  aac: 'AAC',
  opus: 'Opus',
}

/** The audio codecs a container carries, exactly the encoder preference (AAC, Opus). */
type AudioContainerCodec = (typeof AUDIO_CODEC_PREFERENCE)[number]

/** AAC is the MP4 audio codec, Opus the WebM one; the encoder preference lists them in that order. */
const [MP4_AUDIO_CODEC, WEBM_AUDIO_CODEC] = AUDIO_CODEC_PREFERENCE

/** Even integer of at least two: 4:2:0 encoders reject odd dimensions. */
function evenSide(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2))
}

/** The container a video codec is muxed into; throws for a codec with no home. */
export function containerForCodec(codec: VideoCodec): VideoContainer {
  const container = (CODEC_CONTAINER as Partial<Record<VideoCodec, VideoContainer>>)[codec]
  if (container === undefined) {
    throw new RangeError(`no container is configured for the ${codec} codec`)
  }
  return container
}

/** The audio codec a container carries: AAC for MP4, Opus for WebM. */
export function audioCodecForContainer(container: VideoContainer): AudioContainerCodec {
  return container === 'mp4' ? MP4_AUDIO_CODEC : WEBM_AUDIO_CODEC
}

/**
 * The first codec in the product's preference order the browser can encode.
 * The `canEncode` predicate is injected so this stays pure and testable; the
 * real caller passes mediabunny's `canEncodeVideo`.
 */
export async function chooseVideoCodec(
  canEncode: (codec: VideoCodec) => Promise<boolean>,
): Promise<VideoCodec | null> {
  for (const codec of VIDEO_CODEC_PREFERENCE) {
    if (await canEncode(codec)) {
      return codec
    }
  }
  return null
}

/**
 * How to handle the input audio: copy the packets when the input codec already
 * fits the output container (AAC → MP4, Opus → WebM), else re-encode to the
 * container's codec when the browser can, else drop it (silent output).
 */
export function planAudio(
  inputCodec: AudioCodec | null,
  container: VideoContainer,
  canEncodeTarget: boolean,
): AudioPlan {
  if (inputCodec === null) {
    return { mode: 'none' }
  }
  const target = audioCodecForContainer(container)
  if (inputCodec === target) {
    return { mode: 'copy', codec: inputCodec }
  }
  if (canEncodeTarget) {
    return { mode: 'reencode', codec: target, bitrate: AUDIO_REENCODE_BITRATE }
  }
  return { mode: 'none' }
}

/**
 * The 1080p ladder bitrate scaled by the actual pixel count, so a 720p frame
 * gets proportionally fewer bits and a 4K frame proportionally more.
 */
export function scaleVideoBitrate(quality: VideoQuality, pixels: number): number {
  const reference = VIDEO_BITRATE_LADDER[quality]
  return Math.max(1, Math.round((reference * pixels) / VIDEO_BITRATE_REFERENCE_PIXELS))
}

/**
 * The output frame size for a resolution choice: the source (rounded to even)
 * for "Original", else the source scaled down to the target height. Never
 * enlarges — a clip already shorter than the target keeps its size.
 */
export function fitVideoSize(source: Size, resolution: VideoResolution): Size {
  if (resolution === 'original') {
    return { width: evenSide(source.width), height: evenSide(source.height) }
  }
  const targetHeight = VIDEO_FIT_HEIGHTS[resolution]
  if (source.height <= targetHeight) {
    return { width: evenSide(source.width), height: evenSide(source.height) }
  }
  const scale = targetHeight / source.height
  return { width: evenSide(source.width * scale), height: evenSide(targetHeight) }
}

/** The first limit a file breaks, or null when it is within every limit. */
export function checkVideoLimits(
  input: { bytes: number; seconds: number; width: number; height: number },
  limits: VideoLimits = DEFAULT_VIDEO_LIMITS,
): VideoLimit | null {
  if (input.bytes > limits.maxBytes) {
    return {
      reason: 'bytes',
      message: `This video is larger than ${formatBytes(limits.maxBytes)}.`,
    }
  }
  if (input.seconds > limits.maxSeconds) {
    return {
      reason: 'seconds',
      message: `This video is longer than the ${String(limits.maxSeconds)}-second limit.`,
    }
  }
  if (Math.max(input.width, input.height) > limits.maxSide) {
    return {
      reason: 'side',
      message: `This video is wider or taller than ${String(limits.maxSide)} px.`,
    }
  }
  return null
}

/** Progress as a fraction in [0, 1]; 0 while the total is still unknown. */
export function progressFraction(done: number, total: number | null): number {
  if (total === null || total <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, done / total))
}

/**
 * Milliseconds still to go, from the pace so far, or null when it cannot yet be
 * estimated (nothing done, unknown total, or already complete).
 */
export function estimateRemainingMs(
  done: number,
  total: number | null,
  elapsedMs: number,
): number | null {
  if (total === null || done <= 0 || done >= total) {
    return null
  }
  return (elapsedMs / done) * (total - done)
}

/** The line the UI shows before starting, e.g. "Saves as MP4 (H.264)". */
export function describeOutput(codec: VideoCodec, container: VideoContainer): string {
  return `Saves as ${CONTAINER_LABELS[container]} (${VIDEO_CODEC_LABELS[codec]})`
}

/** A one-line summary of what happens to the audio, for the UI. */
export function describeAudio(audio: AudioPlan): string {
  switch (audio.mode) {
    case 'none': {
      return 'No audio track.'
    }
    case 'copy': {
      return `Audio copied without re-encoding (${AUDIO_CODEC_LABELS[containerCodecOf(audio.codec)]}).`
    }
    case 'reencode': {
      return `Audio re-encoded to ${AUDIO_CODEC_LABELS[containerCodecOf(audio.codec)]}.`
    }
  }
}

/** Narrows a copied/re-encoded codec to the two this product labels; others read as their id. */
function containerCodecOf(codec: AudioCodec): AudioContainerCodec {
  return codec === 'aac' ? 'aac' : 'opus'
}
