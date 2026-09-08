/**
 * Up-front detection of what this browser can produce, shown to the user before
 * they start ("Saves as MP4 (H.264)"). Browser-bound (WebCodecs + mediabunny),
 * so coverage-excluded; the pure selection logic it drives lives in `plan.ts`
 * and is tested there against a fake `canEncode`.
 */
import { canEncodeAudio, canEncodeVideo } from 'mediabunny'
import type { AudioCodec, VideoCodec } from 'mediabunny'
import { useEffect, useState } from 'react'

import {
  audioCodecForContainer,
  chooseVideoCodec,
  containerForCodec,
  describeOutput,
  type VideoContainer,
} from './plan'

/** The output this browser will produce, or the fact that it cannot encode video. */
export interface VideoCapabilitySupported {
  supported: true
  videoCodec: VideoCodec
  container: VideoContainer
  /** The codec the container carries when audio must be re-encoded. */
  audioCodec: AudioCodec
  /** Whether that audio codec can actually be encoded here (else audio is dropped). */
  canEncodeAudio: boolean
  /** "Saves as MP4 (H.264)" and the like. */
  label: string
}

export interface VideoCapabilityUnsupported {
  supported: false
}

export type VideoCapability = VideoCapabilitySupported | VideoCapabilityUnsupported

/** Whether this browser has the WebCodecs `VideoEncoder` at all (Firefox ≤ 129 and old Safari do not). */
export function hasVideoEncoder(): boolean {
  return typeof VideoEncoder !== 'undefined'
}

/** Detects the best encodable codec, its container, and whether its audio codec can be encoded. */
export async function detectVideoCapability(): Promise<VideoCapability> {
  if (!hasVideoEncoder()) {
    return { supported: false }
  }
  const videoCodec = await chooseVideoCodec((codec) => canEncodeVideo(codec))
  if (videoCodec === null) {
    return { supported: false }
  }
  const container = containerForCodec(videoCodec)
  const audioCodec = audioCodecForContainer(container)
  const canEncodeAudioTrack = await canEncodeAudio(audioCodec)
  return {
    supported: true,
    videoCodec,
    container,
    audioCodec,
    canEncodeAudio: canEncodeAudioTrack,
    label: describeOutput(videoCodec, container),
  }
}

/** The detected capability, or null while detection is still running. */
export function useVideoCapability(): VideoCapability | null {
  const [capability, setCapability] = useState<VideoCapability | null>(null)
  useEffect(() => {
    let isLive = true
    void detectVideoCapability().then((result) => {
      if (isLive) {
        setCapability(result)
      }
    })
    return () => {
      isLive = false
    }
  }, [])
  return capability
}
