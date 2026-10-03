import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { containerForCodec, type TranscodePlan } from './plan'
import { transcodeProject } from './project-transcode'
import {
  CLIP_FRAMES,
  CLIP_HEIGHT,
  CLIP_SECONDS,
  CLIP_WIDTH,
  encodeTestClip,
} from './test-support/clip'
import { transcodeVideo } from './transcode'
import { appendProjectClip, emptyVideoProject } from '../../shared/video-project'

const NATIVE_TIMEOUT_MS = 30_000
const FIXTURE_BITRATE = 800_000

afterEach(() => vi.restoreAllMocks())

describe('complete native frame encoding', () => {
  it.each(['single', 'project'] as const)(
    '%s export succeeds with every frame and refuses an encoder that omits a frame',
    async (kind) => {
      const { blob, codec } = await encodeTestClip()
      const plan: TranscodePlan = {
        videoCodec: codec,
        container: containerForCodec(codec),
        bitrate: FIXTURE_BITRATE,
        output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
        audio: { mode: 'none' },
      }
      const project = appendProjectClip(
        emptyVideoProject('Frame integrity fixture', CLIP_WIDTH, CLIP_HEIGHT),
        { id: 'fixture', kind: 'video', duration: CLIP_SECONDS, hasAudio: false },
      )
      const request = {
        source: blob,
        marks: [],
        plan,
        signal: new AbortController().signal,
      }
      const render = async () =>
        kind === 'single'
          ? await transcodeVideo(request)
          : await transcodeProject({
              ...request,
              project,
              sources: [{ id: 'fixture', source: blob }],
            })
      const complete = await render()
      const input = new Input({ source: new BlobSource(complete), formats: ALL_FORMATS })
      try {
        const picture = await input.getPrimaryVideoTrack()
        if (picture === null) throw new Error('The complete fixture has no picture.')
        const stats = await picture.computePacketStats()
        expect(stats.packetCount).toBe(CLIP_FRAMES)
        expect(await input.computeDuration()).toBeCloseTo(CLIP_SECONDS, 2)
      } finally {
        input.dispose()
      }

      // Preserve the original method while forwarding the actual encoder as its receiver.
      const nativeEncode = Reflect.get(VideoEncoder.prototype, 'encode')
      let submitted = 0
      vi.spyOn(VideoEncoder.prototype, 'encode').mockImplementation(function (
        this: VideoEncoder,
        frame: VideoFrame,
        options?: VideoEncoderEncodeOptions,
      ) {
        submitted += 1
        // A real encoder still handles every other sample. Simulate its documented
        // low-latency omission to prove the pipeline refuses an incomplete export.
        if (submitted === 2) return
        nativeEncode.call(this, frame, options)
      })
      await expect(render()).rejects.toThrow(
        'The video encoder omitted frames. No export was returned.',
      )
      expect(submitted).toBe(CLIP_FRAMES)
    },
    NATIVE_TIMEOUT_MS,
  )
})
