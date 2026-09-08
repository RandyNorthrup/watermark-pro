import { describe, expect, it } from 'vitest'

import { DEFAULT_VIDEO_LIMITS } from './plan'
import { probeVideo, sampleFrame, VideoLimitError } from './probe'
import { CLIP_FRAMES, CLIP_FPS, CLIP_HEIGHT, CLIP_WIDTH, encodeTestClip } from './test-support/clip'

const PROBE_TIMEOUT_MS = 20_000
const EXPECTED_SECONDS = CLIP_FRAMES / CLIP_FPS

async function clipFile(): Promise<File> {
  const { blob } = await encodeTestClip()
  return new File([blob], 'clip.mp4', { type: blob.type })
}

describe('probeVideo', () => {
  it(
    'reports duration, display size and the video codec, with no audio track',
    async () => {
      const probe = await probeVideo(await clipFile())
      expect(probe.width).toBe(CLIP_WIDTH)
      expect(probe.height).toBe(CLIP_HEIGHT)
      expect(probe.durationSeconds).toBeGreaterThan(EXPECTED_SECONDS * 0.7)
      expect(probe.videoCodec).not.toBeNull()
      expect(probe.audioCodec).toBeNull()
    },
    PROBE_TIMEOUT_MS,
  )

  it(
    'refuses an over-limit file with a VideoLimitError before decoding it',
    async () => {
      const file = await clipFile()
      await expect(
        probeVideo(file, { ...DEFAULT_VIDEO_LIMITS, maxBytes: 1 }),
      ).rejects.toBeInstanceOf(VideoLimitError)
      await expect(
        probeVideo(file, { ...DEFAULT_VIDEO_LIMITS, maxSeconds: 0 }),
      ).rejects.toBeInstanceOf(VideoLimitError)
      await expect(
        probeVideo(file, { ...DEFAULT_VIDEO_LIMITS, maxSide: 1 }),
      ).rejects.toBeInstanceOf(VideoLimitError)
    },
    PROBE_TIMEOUT_MS,
  )

  it(
    'samples a frame as a PNG at the clip size',
    async () => {
      const png = await sampleFrame(await clipFile(), 0)
      expect(png.type).toBe('image/png')
      const bitmap = await createImageBitmap(png)
      expect(bitmap.width).toBe(CLIP_WIDTH)
      expect(bitmap.height).toBe(CLIP_HEIGHT)
      bitmap.close()
    },
    PROBE_TIMEOUT_MS,
  )
})
