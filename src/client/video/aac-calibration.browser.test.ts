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

/** Independent synthetic diagnostic searches advances too; production keeps its current delay guard. */
function signedPeaks(decoded: Float32Array) {
  const reference = aacCalibrationSignal()
  const policy = AAC_TIMING_POLICY
  return policy.markers.map((marker) => {
    const start = marker.start + policy.measuredOffset
    const expected = reference.subarray(start, start + policy.measuredFrames)
    const energy = expected.reduce((sum, value) => sum + value * value, 0)
    let peak = { delay: 0, score: -1, runnerUp: -1 }
    for (let shift = -policy.maximumDelayFrames; shift <= policy.maximumDelayFrames; shift += 1) {
      const begin = start + shift
      if (begin < 0 || begin + expected.length > decoded.length) continue
      const actual = decoded.subarray(begin, begin + expected.length)
      const product = expected.reduce((sum, value, index) => sum + value * (actual[index] ?? 0), 0)
      const actualEnergy = actual.reduce((sum, value) => sum + value * value, 0)
      const score = product / Math.sqrt(energy * actualEnergy || 1)
      if (score > peak.score) peak = { delay: shift, score, runnerUp: peak.score }
      else peak.runnerUp = Math.max(peak.runnerUp, score)
    }
    return peak
  })
}

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
      const sequential = new Float32Array(maximum)
      let sequentialEnd = 0
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
          expect(sequentialEnd + plane.length).toBeLessThanOrEqual(maximum)
          sequential.set(plane, sequentialEnd)
          sequentialEnd += plane.length
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
        signedPeaks: signedPeaks(decoded.subarray(0, end)),
        sequentialFrames: sequentialEnd,
        sequentialPeaks: signedPeaks(sequential.subarray(0, sequentialEnd)),
        decodedExtents: extents,
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
