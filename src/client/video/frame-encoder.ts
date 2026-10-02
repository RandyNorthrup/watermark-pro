import { CanvasSource, Quality } from 'mediabunny'

import type { TranscodePlan } from './plan'
import { VIDEO_ENCODER_LATENCY_MODE } from '../../shared/constants'

/** Avoid native lookahead deadlock and refuse exports if low-latency encoding omits a frame. */
export function createFrameEncoder(canvas: OffscreenCanvas, plan: TranscodePlan) {
  let encodedFrames = 0
  const source = new CanvasSource(canvas, {
    codec: plan.videoCodec,
    quality: new Quality({ bitrate: plan.bitrate }),
    latencyMode: VIDEO_ENCODER_LATENCY_MODE,
    onEncodedPacket: () => {
      encodedFrames += 1
    },
  })
  return {
    source,
    verifyFrameCount(expectedFrames: number): void {
      if (encodedFrames !== expectedFrames || expectedFrames <= 0)
        throw new Error('The video encoder omitted frames. No export was returned.')
    },
  }
}
