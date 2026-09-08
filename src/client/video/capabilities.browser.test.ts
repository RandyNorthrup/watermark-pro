import { describe, expect, it } from 'vitest'

import { detectVideoCapability, hasVideoEncoder } from './capabilities'
import { containerForCodec } from './plan'
import { VIDEO_CODEC_PREFERENCE } from '../../shared/constants'

const DETECT_TIMEOUT_MS = 20_000

describe('video capabilities', () => {
  it('reports that this browser can encode video', () => {
    expect(hasVideoEncoder()).toBe(true)
  })

  it(
    'detects an encodable codec, its container, an audio flag and a label',
    async () => {
      const capability = await detectVideoCapability()
      expect(capability.supported).toBe(true)
      if (!capability.supported) {
        return
      }
      expect(VIDEO_CODEC_PREFERENCE as readonly string[]).toContain(capability.videoCodec)
      expect(capability.container).toBe(containerForCodec(capability.videoCodec))
      expect(typeof capability.canEncodeAudio).toBe('boolean')
      expect(capability.label).toMatch(/^Saves as (MP4|WebM) \(/)
    },
    DETECT_TIMEOUT_MS,
  )
})
