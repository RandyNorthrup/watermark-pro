import { AAC_TIMING_POLICY, VIDEO_PROJECT_LIMITS } from '../../shared/constants'

/** Split planar stereo PCM without moving samples between channels or changing their source clock. */
export function* aacPcmBlocks(data: Float32Array, offset: number) {
  const { channels } = VIDEO_PROJECT_LIMITS
  const frames = data.length / channels
  for (let start = 0; start < frames; start += AAC_TIMING_POLICY.packetFrames) {
    const length = Math.min(AAC_TIMING_POLICY.packetFrames, frames - start)
    const plane = new Float32Array(length * channels)
    for (let channel = 0; channel < channels; channel += 1)
      plane.set(
        data.subarray(channel * frames + start, channel * frames + start + length),
        channel * length,
      )
    yield { data: plane, offset: offset + start }
  }
}
