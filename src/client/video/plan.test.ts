import { describe, expect, it } from 'vitest'

import {
  audioCodecForContainer,
  checkVideoLimits,
  chooseVideoCodec,
  containerForCodec,
  DEFAULT_VIDEO_LIMITS,
  describeAudio,
  describeOutput,
  estimateRemainingMs,
  fitVideoSize,
  planAudio,
  progressFraction,
  scaleVideoBitrate,
} from './plan'
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MAX_VIDEO_SIDE,
  VIDEO_BITRATE_LADDER,
  VIDEO_BITRATE_REFERENCE_PIXELS,
} from '../../shared/constants'

describe('containerForCodec', () => {
  it('maps H.264 and HEVC to MP4 and the open codecs to WebM', () => {
    expect(containerForCodec('avc')).toBe('mp4')
    expect(containerForCodec('hevc')).toBe('mp4')
    expect(containerForCodec('vp9')).toBe('webm')
    expect(containerForCodec('av1')).toBe('webm')
  })

  it('throws for a codec with no configured container', () => {
    expect(() => containerForCodec('prores')).toThrow(/no container/)
  })
})

describe('audioCodecForContainer', () => {
  it('carries AAC in MP4 and Opus in WebM', () => {
    expect(audioCodecForContainer('mp4')).toBe('aac')
    expect(audioCodecForContainer('webm')).toBe('opus')
  })
})

describe('chooseVideoCodec', () => {
  it('returns the first codec the browser can encode, in preference order', async () => {
    const codec = await chooseVideoCodec((candidate) => Promise.resolve(candidate === 'vp9'))
    expect(codec).toBe('vp9')
  })

  it('prefers the earlier codec when several can be encoded', async () => {
    const codec = await chooseVideoCodec((candidate) =>
      Promise.resolve(candidate === 'hevc' || candidate === 'vp9'),
    )
    expect(codec).toBe('hevc')
  })

  it('returns null when nothing can be encoded', async () => {
    const codec = await chooseVideoCodec(() => Promise.resolve(false))
    expect(codec).toBeNull()
  })
})

describe('planAudio', () => {
  it('drops the audio when the input has none', () => {
    expect(planAudio(null, 'mp4', true)).toEqual({ mode: 'none' })
  })

  it('copies AAC into MP4 and Opus into WebM without re-encoding', () => {
    expect(planAudio('aac', 'mp4', true)).toEqual({ mode: 'copy', codec: 'aac' })
    expect(planAudio('opus', 'webm', true)).toEqual({ mode: 'copy', codec: 'opus' })
  })

  it('re-encodes a mismatched codec to the container codec when possible', () => {
    expect(planAudio('opus', 'mp4', true)).toEqual({
      mode: 'reencode',
      codec: 'aac',
      bitrate: expect.any(Number),
    })
    expect(planAudio('aac', 'webm', true)).toEqual({
      mode: 'reencode',
      codec: 'opus',
      bitrate: expect.any(Number),
    })
  })

  it('falls back to silent when the container codec cannot be encoded', () => {
    expect(planAudio('mp3', 'mp4', false)).toEqual({ mode: 'none' })
  })
})

describe('scaleVideoBitrate', () => {
  it('quotes the ladder value at the reference (1080p) pixel count', () => {
    expect(scaleVideoBitrate('standard', VIDEO_BITRATE_REFERENCE_PIXELS)).toBe(
      VIDEO_BITRATE_LADDER.standard,
    )
  })

  it('scales down for smaller frames and up for larger ones', () => {
    const half = scaleVideoBitrate('high', VIDEO_BITRATE_REFERENCE_PIXELS / 2)
    expect(half).toBe(Math.round(VIDEO_BITRATE_LADDER.high / 2))
    const quad = scaleVideoBitrate('low', VIDEO_BITRATE_REFERENCE_PIXELS * 4)
    expect(quad).toBe(VIDEO_BITRATE_LADDER.low * 4)
  })

  it('never drops below one bit per second', () => {
    expect(scaleVideoBitrate('low', 0)).toBe(1)
  })
})

describe('fitVideoSize', () => {
  it('keeps the source at "original", rounded to even sides', () => {
    expect(fitVideoSize({ width: 1921, height: 1081 }, 'original')).toEqual({
      width: 1922,
      height: 1082,
    })
  })

  it('fits a taller-than-target frame down to the target height', () => {
    expect(fitVideoSize({ width: 3840, height: 2160 }, '1080p')).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(fitVideoSize({ width: 1920, height: 1080 }, '720p')).toEqual({
      width: 1280,
      height: 720,
    })
  })

  it('never enlarges a frame already at or below the target height', () => {
    expect(fitVideoSize({ width: 640, height: 360 }, '1080p')).toEqual({
      width: 640,
      height: 360,
    })
  })
})

describe('checkVideoLimits', () => {
  const within = { bytes: 1000, seconds: 10, width: 1920, height: 1080 }

  it('passes a file within every limit', () => {
    expect(checkVideoLimits(within)).toBeNull()
  })

  it('refuses an oversized file', () => {
    const limit = checkVideoLimits({ ...within, bytes: MAX_VIDEO_BYTES + 1 })
    expect(limit?.reason).toBe('bytes')
  })

  it('refuses a too-long file', () => {
    const limit = checkVideoLimits({ ...within, seconds: MAX_VIDEO_SECONDS + 1 })
    expect(limit?.reason).toBe('seconds')
  })

  it('refuses a too-large frame by its longest side', () => {
    const limit = checkVideoLimits({ ...within, width: MAX_VIDEO_SIDE + 1 })
    expect(limit?.reason).toBe('side')
  })

  it('honours overridden limits', () => {
    const limit = checkVideoLimits(within, { ...DEFAULT_VIDEO_LIMITS, maxBytes: 1 })
    expect(limit?.reason).toBe('bytes')
    expect(limit?.message).toMatch(/larger than/)
  })
})

describe('progress maths', () => {
  it('reports a bounded fraction and zero for an unknown total', () => {
    expect(progressFraction(5, 10)).toBe(0.5)
    expect(progressFraction(5, null)).toBe(0)
    expect(progressFraction(20, 10)).toBe(1)
  })

  it('estimates remaining time from the pace, and null at the edges', () => {
    expect(estimateRemainingMs(10, 20, 1000)).toBe(1000)
    expect(estimateRemainingMs(0, 20, 1000)).toBeNull()
    expect(estimateRemainingMs(20, 20, 1000)).toBeNull()
    expect(estimateRemainingMs(10, null, 1000)).toBeNull()
  })
})

describe('descriptions', () => {
  it('names the output container and codec', () => {
    expect(describeOutput('avc', 'mp4')).toBe('Saves as MP4 (H.264)')
    expect(describeOutput('vp9', 'webm')).toBe('Saves as WebM (VP9)')
  })

  it('describes each audio outcome', () => {
    expect(describeAudio({ mode: 'none' })).toMatch(/No audio/)
    expect(describeAudio({ mode: 'copy', codec: 'aac' })).toMatch(/copied.*AAC/)
    expect(describeAudio({ mode: 'reencode', codec: 'opus', bitrate: 128_000 })).toMatch(
      /re-encoded to Opus/,
    )
  })
})
