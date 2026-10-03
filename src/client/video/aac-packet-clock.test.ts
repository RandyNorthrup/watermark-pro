import { EncodedPacket } from 'mediabunny'
import { describe, expect, it } from 'vitest'

import { createAacPacketClock } from './aac-packet-clock'
import { AAC_TIMING_POLICY, MAX_VIDEO_SECONDS, VIDEO_PROJECT_LIMITS } from '../../shared/constants'

const RATE = VIDEO_PROJECT_LIMITS.sampleRate
const FRAME = AAC_TIMING_POLICY.packetFrames
function packet(frames: number, duration: number = FRAME) {
  return new EncodedPacket(new Uint8Array([11, 22, 33]), 'key', frames / RATE, duration / RATE)
}
describe('complete AAC coded-frame clock', () => {
  it('preserves bytes and full frame durations on a regular native clock', () => {
    const normalize = createAacPacketClock()
    for (const frames of [0, FRAME, FRAME * 2]) {
      const original = packet(frames)
      const corrected = normalize(original)
      expect(corrected.timestamp).toBe(frames / RATE)
      expect(corrected.duration).toBe(FRAME / RATE)
      expect(corrected.data).toEqual(original.data)
    }
  })
  it('corrects the initial repeated zero without overwriting or shortening either frame', () => {
    const normalize = createAacPacketClock()
    const result = [0, 0, FRAME, FRAME * 2].map((frames) => normalize(packet(frames)))
    expect(result.map((item) => Math.round(item.timestamp * RATE))).toEqual([
      0,
      FRAME,
      FRAME * 2,
      FRAME * 3,
    ])
    expect(result.every((item) => item.duration === FRAME / RATE)).toBe(true)
  })
  it('derives the AAC-LC frame duration when native chunk duration is unspecified', () => {
    expect(createAacPacketClock()(packet(0, 0)).duration).toBe(FRAME / RATE)
  })
  it('reports numeric invalid-frame context while retaining the generic failure', () => {
    const normalize = createAacPacketClock()
    normalize(packet(0))
    expect(() => normalize(packet(FRAME, FRAME - 1))).toThrow(
      expect.objectContaining({
        message: 'AAC encoder returned invalid frame timing.',
        expectedFrame: FRAME,
        nativeFrame: FRAME,
        nativeOffset: 0,
        durationFrames: FRAME - 1,
      }),
    )
  })
  it('measures a shortened initial interval while keeping later frames complete', () => {
    const normalize = createAacPacketClock()
    const firstInterval = FRAME / 2
    const result = [0, firstInterval, firstInterval + FRAME].map((frames) =>
      normalize(packet(frames)),
    )
    expect(result.map((item) => Math.round(item.timestamp * RATE))).toEqual([0, FRAME, FRAME * 2])
    expect(result.every((item) => item.duration === FRAME / RATE)).toBe(true)
    expect(() => normalize(packet(firstInterval + FRAME * 3))).toThrow('discontinuous')
  })
  it.each([-1, NaN, Infinity])('rejects invalid native timestamp %s', (frames) => {
    expect(() => createAacPacketClock()(packet(frames))).toThrow()
  })
  it.each([-1, FRAME - 1, FRAME * 2, NaN])(
    'rejects incompatible native duration %s',
    (duration) => {
      expect(() => createAacPacketClock()(packet(0, duration))).toThrow()
    },
  )
  it('rejects a missing middle frame instead of hiding the gap', () => {
    const normalize = createAacPacketClock()
    normalize(packet(0))
    expect(() => normalize(packet(FRAME * 2))).toThrow('discontinuous')
  })
  it('rejects a repeated later frame on both regular and corrected clocks', () => {
    for (const prefix of [
      [0, FRAME],
      [0, 0, FRAME],
    ]) {
      const normalize = createAacPacketClock()
      for (const frames of prefix) normalize(packet(frames))
      expect(() => normalize(packet(FRAME))).toThrow('discontinuous')
    }
  })
  it('rejects an unsafe finite timestamp and a stream beyond the bounded encoder interval', () => {
    expect(() => createAacPacketClock()(packet(Number.MAX_SAFE_INTEGER))).toThrow('invalid')
    const normalize = createAacPacketClock()
    const maximum =
      MAX_VIDEO_SECONDS * RATE +
      AAC_TIMING_POLICY.leadFrames +
      AAC_TIMING_POLICY.tailFrames +
      AAC_TIMING_POLICY.maximumDelayFrames
    let frames = 0
    while (frames < maximum) {
      normalize(packet(frames))
      frames += FRAME
    }
    expect(() => normalize(packet(frames))).toThrow('invalid')
  })
})
