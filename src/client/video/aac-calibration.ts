import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny'

import { aacCalibrationSignal, measureAacDelay } from './aac-calibration-signal'
import { CancelledError } from './errors'
import {
  AAC_TIMING_POLICY,
  AUDIO_REENCODE_BITRATE,
  VIDEO_PROJECT_LIMITS,
} from '../../shared/constants'

function check(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError()
}

/** Encode and decode a bounded synthetic signal with the exact project AAC configuration. */
export async function calibrateAacEncoder(signal: AbortSignal): Promise<number> {
  check(signal)
  const reference = aacCalibrationSignal()
  const { channels, sampleRate, audioChunkFrames } = VIDEO_PROJECT_LIMITS
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
  const source = new AudioSampleSource({
    codec: 'aac',
    quality: new Quality({ bitrate: AUDIO_REENCODE_BITRATE }),
  })
  output.addAudioTrack(source)
  try {
    await output.start()
    for (let offset = 0; offset < reference.length; offset += audioChunkFrames) {
      check(signal)
      const frames = Math.min(audioChunkFrames, reference.length - offset)
      const data = new Float32Array(frames * channels)
      for (let channel = 0; channel < channels; channel += 1)
        data.set(reference.subarray(offset, offset + frames), channel * frames)
      const sample = new AudioSample({
        data,
        format: 'f32-planar',
        sampleRate,
        numberOfChannels: channels,
        timestamp: offset / sampleRate,
      })
      try {
        await source.add(sample)
      } finally {
        sample.close()
      }
    }
    source.close()
    await output.finalize()
  } catch (error) {
    if (output.state !== 'finalized') await output.cancel()
    throw error
  }
  check(signal)
  const { buffer } = target
  if (buffer === null || buffer.byteLength > AAC_TIMING_POLICY.calibrationBytes)
    throw new Error('AAC calibration did not produce a bounded encoded signal.')
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (
      track === null ||
      (await track.getSampleRate()) !== sampleRate ||
      (await track.getNumberOfChannels()) !== channels
    )
      throw new Error('AAC calibration returned an unexpected audio configuration.')
    const maximumFrames =
      reference.length + AAC_TIMING_POLICY.maximumDelayFrames + AAC_TIMING_POLICY.packetFrames
    const decoded = new Float32Array(maximumFrames)
    let end = 0
    const samples = new AudioSampleSink(track).samples()
    for await (const sample of samples) {
      try {
        check(signal)
        const offset = Math.round(sample.timestamp * sampleRate)
        if (
          sample.sampleRate !== sampleRate ||
          offset < 0 ||
          offset + sample.numberOfFrames > maximumFrames
        )
          throw new Error('AAC calibration returned an invalid decoded extent.')
        const plane = decoded.subarray(offset, offset + sample.numberOfFrames)
        sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' })
        end = Math.max(end, offset + sample.numberOfFrames)
      } finally {
        sample.close()
      }
    }
    return measureAacDelay(decoded.subarray(0, end))
  } finally {
    input.dispose()
  }
}
