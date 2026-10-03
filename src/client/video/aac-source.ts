import {
  AudioSample,
  AudioSampleSource,
  EncodedAudioPacketSource,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
} from 'mediabunny'
import type { EncodedPacket } from 'mediabunny'

import { calibrateAacEncoder } from './aac-calibration'
import { createAacPacketClock } from './aac-packet-clock'
import { aacPcmBlocks } from './aac-pcm'
import { CancelledError } from './errors'
import {
  AAC_TIMING_POLICY,
  AUDIO_REENCODE_BITRATE,
  MAX_VIDEO_SECONDS,
  VIDEO_PROJECT_LIMITS,
} from '../../shared/constants'

/** Measured encoder preroll and the exact submitted project extent, in audio frames. */
export interface AacTiming {
  primingFrames: number
  durationFrames: number
  sampleRate: number
  packets: number
}
/** Owns the secondary encoder and forwards only the intended bounded output interval. */
export interface TimedAacSource {
  add(data: Float32Array, frames: number, offset: number): Promise<void>
  finish(): Promise<AacTiming>
  cancel(): Promise<void>
}

/** Forward a bounded encoder queue, preserving priming packets and trimming only end padding. */
export async function createTimedAacSource(
  output: Output,
  duration: number,
  signal: AbortSignal,
): Promise<TimedAacSource> {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS)
    throw new RangeError('AAC project duration exceeds the editing limit.')
  const delay = await calibrateAacEncoder(signal)
  const { sampleRate, channels, audioChunkFrames } = VIDEO_PROJECT_LIMITS
  const policy = AAC_TIMING_POLICY
  const total = Math.ceil(duration * sampleRate)
  const primingFrames = policy.leadFrames + delay
  const end = (total + primingFrames) / sampleRate
  const destination = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(destination)
  let writing = Promise.resolve()
  const failure: { error: Error | null } = { error: null }
  let packets = 0
  let encodedEnd = 0
  let nextOffset = 0
  let tailUsed = 0
  const normalizePacket = createAacPacketClock()
  function checkWriting() {
    if (failure.error !== null) throw failure.error
  }
  async function forward(
    previous: Promise<void>,
    packet: EncodedPacket,
    metadata: EncodedAudioChunkMetadata | undefined,
  ) {
    try {
      await previous
      checkWriting()
      await destination.add(packet, metadata)
    } catch (error: unknown) {
      failure.error =
        error instanceof Error
          ? error
          : new Error('AAC packet forwarding failed.', { cause: error })
    }
  }
  const source = new AudioSampleSource({
    codec: 'aac',
    quality: new Quality({ bitrate: AUDIO_REENCODE_BITRATE }),
    onEncodedPacket(packet, metadata) {
      if (failure.error !== null) return
      try {
        const corrected = normalizePacket(packet)
        if (corrected.timestamp >= end) return
        packets += 1
        encodedEnd = corrected.timestamp + corrected.duration
        // Coded AAC frames stay complete; the edit list clips the exact timeline.
        writing = forward(writing, corrected, metadata)
      } catch (error: unknown) {
        failure.error =
          error instanceof Error ? error : new Error('AAC frame timing failed.', { cause: error })
      }
    },
  })
  const encoding = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new NullTarget(),
  })
  encoding.addAudioTrack(source)
  async function block(data: Float32Array, offset: number) {
    // WebKit/GStreamer reports the latest PCM input timing for emitted packets.
    // One AAC-LC access unit per input prevents a block's repeated metadata from
    // describing several distinct packets. Calibration uses the same boundary.
    for (const input of aacPcmBlocks(data, offset)) {
      if (signal.aborted) throw new CancelledError()
      checkWriting()
      const sample = new AudioSample({
        data: input.data,
        format: 'f32-planar',
        sampleRate,
        numberOfChannels: channels,
        timestamp: input.offset / sampleRate,
      })
      try {
        await source.add(sample)
      } finally {
        sample.close()
      }
      await writing
      checkWriting()
    }
  }
  let isStarted = false
  return {
    async add(data, frames, offset) {
      if (
        offset !== nextOffset ||
        !Number.isSafeInteger(frames) ||
        frames <= 0 ||
        frames > audioChunkFrames ||
        offset + frames > total ||
        data.length !== frames * channels
      )
        throw new Error('AAC input must be contiguous bounded stereo PCM.')
      if (!isStarted) {
        await encoding.start()
        isStarted = true
        await block(new Float32Array(policy.leadFrames * channels), 0)
      }
      if (offset + frames === total && frames % policy.packetFrames !== 0) {
        tailUsed = policy.packetFrames - (frames % policy.packetFrames)
        const paddedFrames = frames + tailUsed
        const padded = new Float32Array(paddedFrames * channels)
        for (let channel = 0; channel < channels; channel += 1)
          padded.set(
            data.subarray(channel * frames, (channel + 1) * frames),
            channel * paddedFrames,
          )
        // Move existing silent tail samples into the final partial PCM block,
        // preventing native timestamp resynchronization mid-coded-frame.
        await block(padded, offset + policy.leadFrames)
      } else await block(data, offset + policy.leadFrames)
      nextOffset += frames
    },
    async finish() {
      if (nextOffset !== total) throw new Error('AAC input is missing project samples.')
      const remainingTail = policy.tailFrames - tailUsed
      // The final project block already consumes its alignment silence. Drop
      // only a redundant partial silent tail unit, keeping the existing cap.
      const alignedTail = remainingTail - (remainingTail % policy.packetFrames)
      await block(new Float32Array(alignedTail * channels), total + policy.leadFrames + tailUsed)
      source.close()
      await encoding.finalize()
      await writing
      checkWriting()
      const encodedFrames = Math.round(encodedEnd * sampleRate)
      if (
        packets === 0 ||
        encodedFrames < total + primingFrames ||
        encodedFrames - total - primingFrames >= policy.packetFrames
      )
        throw new Error('AAC encoder omitted the end of the project audio.')
      destination.close()
      return { primingFrames, durationFrames: total, sampleRate, packets }
    },
    async cancel() {
      if (encoding.state !== 'finalized') await encoding.cancel()
      await writing
      checkWriting()
    },
  }
}
