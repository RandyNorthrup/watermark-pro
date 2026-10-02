import { describe, expect, it } from 'vitest'

import { aacCalibrationSignal, measureAacDelay } from './aac-calibration-signal'

function delayed(frames: number): Float32Array {
  const original = aacCalibrationSignal()
  const output = new Float32Array(original.length + frames)
  output.set(original, frames)
  return output
}

describe('measured AAC priming', () => {
  it.each([0, 1024, 2112, 8192])('measures %i samples without a platform constant', (delay) => {
    expect(measureAacDelay(delayed(delay))).toBe(delay)
  })
  it('rejects silence rather than assuming an encoder delay', () => {
    expect(() => measureAacDelay(new Float32Array(16_384))).toThrow('unambiguous')
  })
  it.each([1, 16_383, 25_601])('rejects invalid decoded extent %i', (frames) => {
    expect(() => measureAacDelay(new Float32Array(frames))).toThrow('extent')
  })
  it('rejects markers with different delays', () => {
    const signal = aacCalibrationSignal()
    const output = delayed(2112)
    output.fill(0, 10_240 + 2112, 12_288 + 2112)
    output.set(signal.subarray(10_240, 12_288), 10_240 + 1024)
    expect(() => measureAacDelay(output)).toThrow('disagree')
  })
  it('rejects two equally plausible copies', () => {
    const signal = aacCalibrationSignal()
    const output = new Float32Array(24_576)
    output.set(signal)
    for (const start of [4096, 10_240])
      output.set(signal.subarray(start, start + 2048), start + 4096)
    expect(() => measureAacDelay(output)).toThrow('unambiguous')
  })
})
