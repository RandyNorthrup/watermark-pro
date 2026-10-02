import {
  ALL_FORMATS,
  AudioSampleSink,
  BufferSource,
  canEncodeAudio,
  EncodedPacketSink,
  Input,
} from 'mediabunny'
import { expect, it } from 'vitest'

import { calibrateAacEncoder, encodeAacCalibration } from './aac-calibration'
import { aacCalibrationSignal, measureAacDelay } from './aac-calibration-signal'
import {
  AAC_TIMING_POLICY,
  AUDIO_REENCODE_BITRATE,
  VIDEO_PROJECT_LIMITS,
} from '../../shared/constants'

const hasNativeAac = await canEncodeAudio('aac', {
  sampleRate: VIDEO_PROJECT_LIMITS.sampleRate,
  numberOfChannels: VIDEO_PROJECT_LIMITS.channels,
  bitrate: AUDIO_REENCODE_BITRATE,
})

it(
  hasNativeAac
    ? 'measures native AAC packet and decoded timestamp origins from synthetic PCM'
    : 'reports unavailable native AAC for the synthetic timestamp contract',
  async () => {
    if (!hasNativeAac) {
      await expect(calibrateAacEncoder(new AbortController().signal)).rejects.toThrow()
      return
    }
    const { sampleRate } = VIDEO_PROJECT_LIMITS
    const reference = aacCalibrationSignal()
    const recording = await encodeAacCalibration(new AbortController().signal)
    const input = new Input({ source: new BufferSource(recording.buffer), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryAudioTrack()
      if (track === null) throw new Error('Synthetic AAC track missing')
      const firstPacket = await new EncodedPacketSink(track).getFirstPacket()
      const maximum =
        reference.length +
        AAC_TIMING_POLICY.calibrationPaddingFrames +
        AAC_TIMING_POLICY.maximumDelayFrames +
        AAC_TIMING_POLICY.packetFrames
      const decoded = new Float32Array(maximum)
      const extents: { offset: number; frames: number; rate: number }[] = []
      let origin: number | undefined
      let end = 0
      const samples = new AudioSampleSink(track).samples()
      for await (const sample of samples) {
        try {
          const offset = Math.round(sample.timestamp * sampleRate)
          origin ??= offset
          extents.push({ offset, frames: sample.numberOfFrames, rate: sample.sampleRate })
          const begin = offset - origin
          expect(begin).toBeGreaterThanOrEqual(0)
          expect(begin + sample.numberOfFrames).toBeLessThanOrEqual(maximum)
          const plane = new Float32Array(sample.numberOfFrames)
          sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' })
          decoded.set(plane, begin)
          end = Math.max(end, begin + sample.numberOfFrames)
        } finally {
          sample.close()
        }
      }
      // Synthetic codec metadata only. No user media, sample values or credentials are logged.
      const contract = {
        encodedFirst: recording.firstPacketFrame,
        encodedLast: recording.lastPacketFrame,
        demuxedFirst: firstPacket === null ? null : Math.round(firstPacket.timestamp * sampleRate),
        decodedFirst: extents[0],
        decodedLast: extents.at(-1),
        decodedFrames: end,
      }
      try {
        const delay = measureAacDelay(decoded.subarray(0, end))
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThanOrEqual(AAC_TIMING_POLICY.maximumDelayFrames)
        expect(await calibrateAacEncoder(new AbortController().signal)).toBe(delay)
      } catch (error) {
        throw new Error(`Synthetic AAC timestamp contract: ${JSON.stringify(contract)}`, {
          cause: error,
        })
      }
    } finally {
      input.dispose()
    }
  },
  30_000,
)
