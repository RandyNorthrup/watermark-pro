import { describe, expect, it, vi } from 'vitest'

import { createProjectMedia, disposeProjectMedia, probeProjectMedia } from './project-media'
import { encodeTestAudio } from './test-support/audio'
import { encodeTestClip } from './test-support/clip'
import { MAX_VIDEO_BYTES } from '../../shared/constants'

describe('native project imports', () => {
  it('decodes picture and PCM audio from bytes despite misleading MIME and filenames', async () => {
    const encoded = await encodeTestClip()
    const video = new File([encoded.blob], 'wrong.txt', { type: 'text/plain' })
    const picture = await probeProjectMedia(video)
    expect(picture.kind).toBe('video')
    if (picture.kind !== 'video') throw new Error('Native video was misidentified.')
    expect(picture.poster.type).toBe('image/png')
    expect(picture.map.values.length).toBeGreaterThan(0)
    const audio = await encodeTestAudio()
    const sound = await probeProjectMedia(new File([audio], 'fake.mp4', { type: 'video/mp4' }))
    expect(sound.kind).toBe('audio')
    expect(sound.probe.audioCodec).toBe('pcm-s16')
    expect(sound.probe.durationSeconds).toBeCloseTo(1)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    try {
      const source = createProjectMedia(video, picture)
      expect(source.kind).toBe('video')
      disposeProjectMedia(source)
      expect(revoke).toHaveBeenCalledTimes(2)
      const sourceAudio = createProjectMedia(video, sound)
      disposeProjectMedia(sourceAudio)
      expect(revoke).toHaveBeenCalledTimes(3)
    } finally {
      revoke.mockRestore()
    }
  })
  it('refuses invalid containers and excessive bytes instead of showing successful empty imports', async () => {
    await expect(
      probeProjectMedia(new File(['invalid'], 'fake.mp4', { type: 'video/mp4' })),
    ).rejects.toThrow()
    const oversized = new File([], 'huge.mp4')
    Object.defineProperty(oversized, 'size', { value: MAX_VIDEO_BYTES + 1 })
    await expect(probeProjectMedia(oversized)).rejects.toThrow('limit')
  })
})
