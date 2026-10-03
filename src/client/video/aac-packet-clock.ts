import type { EncodedPacket } from 'mediabunny'

import { AAC_TIMING_POLICY, MAX_VIDEO_SECONDS, VIDEO_PROJECT_LIMITS } from '../../shared/constants'

/** Give AAC-LC frames a coded clock; native durations may describe known submitted PCM blocks. */
export function createAacPacketClock(
  submittedPcmFrames: ReadonlySet<number> = new Set(),
): (packet: EncodedPacket) => EncodedPacket {
  const { sampleRate } = VIDEO_PROJECT_LIMITS
  const { packetFrames, leadFrames, tailFrames, maximumDelayFrames } = AAC_TIMING_POLICY
  const maximumFrames =
    MAX_VIDEO_SECONDS * sampleRate + leadFrames + tailFrames + maximumDelayFrames
  let frames = 0
  let nativeOffset = 0
  return (packet) => {
    const nativeFrames = Math.round(packet.timestamp * sampleRate)
    const durationFrames = Math.round(packet.duration * sampleRate)
    if (
      !Number.isSafeInteger(nativeFrames) ||
      nativeFrames < 0 ||
      (durationFrames !== 0 &&
        durationFrames !== packetFrames &&
        !submittedPcmFrames.has(durationFrames)) ||
      frames >= maximumFrames
    )
      throw Object.assign(new Error('AAC encoder returned invalid frame timing.'), {
        expectedFrame: frames - nativeOffset,
        nativeFrame: nativeFrames,
        nativeOffset,
        durationFrames,
      })
    // Native priming can shorten the first interval, including repeating zero.
    // Measure that one interval; later missing or repeated frames still refuse.
    if (frames === packetFrames && nativeFrames <= packetFrames)
      nativeOffset = packetFrames - nativeFrames
    if (nativeFrames !== frames - nativeOffset)
      throw Object.assign(new Error('AAC encoder returned discontinuous frame timing.'), {
        expectedFrame: frames - nativeOffset,
        nativeFrame: nativeFrames,
        nativeOffset,
      })
    const corrected = packet.clone({
      timestamp: frames / sampleRate,
      duration: packetFrames / sampleRate,
    })
    frames += packetFrames
    return corrected
  }
}
