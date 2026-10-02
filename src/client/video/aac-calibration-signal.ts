import { AAC_TIMING_POLICY, VIDEO_PROJECT_LIMITS } from '../../shared/constants'

/** Known synthetic PCM measures the selected encoder, independent of personal content or platform names. */
export function aacCalibrationSignal(): Float32Array {
  const policy = AAC_TIMING_POLICY
  const pcm = new Float32Array(policy.calibrationFrames)
  const seconds = policy.markerFrames / VIDEO_PROJECT_LIMITS.sampleRate
  for (const marker of policy.markers) {
    for (let frame = 0; frame < policy.markerFrames; frame += 1) {
      const time = frame / VIDEO_PROJECT_LIMITS.sampleRate
      const phase =
        2 * Math.PI * (marker.frequency * time + (policy.sweepHertz * time * time) / (2 * seconds))
      pcm[marker.start + frame] =
        policy.amplitude * Math.sin(phase) * Math.sin((Math.PI * frame) / policy.markerFrames) ** 2
    }
  }
  return pcm
}

/** Two distinct, unambiguous correlation peaks must agree on a bounded integer delay. */
export function measureAacDelay(decoded: Float32Array): number {
  const policy = AAC_TIMING_POLICY
  if (
    decoded.length < policy.calibrationFrames ||
    decoded.length > policy.calibrationFrames + policy.maximumDelayFrames + policy.packetFrames
  )
    throw new Error('AAC calibration returned an invalid decoded extent.')
  const reference = aacCalibrationSignal()
  function measure(marker: (typeof policy.markers)[number]): number {
    let bestDelay = 0
    let best = -1
    let runnerUp = -1
    for (let delay = 0; delay <= policy.maximumDelayFrames; delay += 1) {
      let product = 0
      let referenceEnergy = 0
      let decodedEnergy = 0
      for (let frame = 0; frame < policy.measuredFrames; frame += 1) {
        const index = marker.start + policy.measuredOffset + frame
        const expected = reference[index] ?? 0
        const actual = decoded[index + delay] ?? 0
        product += expected * actual
        referenceEnergy += expected * expected
        decodedEnergy += actual * actual
      }
      const correlation = product / Math.sqrt(referenceEnergy * decodedEnergy || 1)
      if (correlation > best) {
        runnerUp = best
        best = correlation
        bestDelay = delay
      } else if (correlation > runnerUp) runnerUp = correlation
    }
    if (best < policy.minimumCorrelation || best - runnerUp < policy.minimumPeakGap)
      throw new Error('AAC calibration could not identify an unambiguous encoder delay.')
    return bestDelay
  }
  const first = measure(policy.markers[0])
  const second = measure(policy.markers[1])
  if (first !== second) throw new Error('AAC calibration markers disagree on encoder delay.')
  return first
}
