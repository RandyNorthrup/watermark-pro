import {
  ALL_FORMATS,
  BlobSource,
  getFirstEncodableVideoCodec,
  Input,
  Output,
  VideoSampleSink,
} from 'mediabunny'
import { describe, expect, it } from 'vitest'

import { CancelledError } from './errors'
import { context2d } from './frame'
import { containerForCodec, planAudio, scaleVideoBitrate, type TranscodePlan } from './plan'
import {
  CLIP_FRAMES,
  CLIP_FPS,
  CLIP_HEIGHT,
  CLIP_WIDTH,
  encodeTestClip,
  encodeTestClipWithAudio,
} from './test-support/clip'
import { transcodeVideo } from './transcode'
import { FLUENT_STICKER_NOTICE } from '../../shared/asset-licenses'
import { VIDEO_CODEC_PREFERENCE } from '../../shared/constants'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'
import type { RenderableMark } from '../engine/render'
import { loadSticker } from '../stickers/load'

const TRANSCODE_TIMEOUT_MS = 30_000
const LATE_TIMESTAMP = (CLIP_FRAMES - 3) / CLIP_FPS
const MARK_REGION = { x: CLIP_WIDTH - 110, y: CLIP_HEIGHT - 70, width: 100, height: 60 } as const
const CONTROL_REGION = { x: 10, y: 120, width: 100, height: 60 } as const

const MARK: RenderableMark = {
  spec: {
    kind: 'text',
    text: '© TEST',
    fontFamily: 'sans-serif',
    fontWeight: 700,
    letterSpacing: 0,
    curve: 0,
    effect: 'solid',
    placement: { mode: 'anchor', anchor: 'bottom-right' },
    contrast: { mode: 'auto' },
    style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.35 },
  } satisfies WatermarkSpec,
}

async function outputPlan(
  width: number,
  height: number,
): Promise<Pick<TranscodePlan, 'videoCodec' | 'container'>> {
  const videoCodec = await getFirstEncodableVideoCodec([...VIDEO_CODEC_PREFERENCE], {
    width,
    height,
  })
  if (videoCodec === null) {
    throw new Error('this browser cannot encode any preferred codec')
  }
  return { videoCodec, container: containerForCodec(videoCodec) }
}

async function frameCount(blob: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (track === null) {
    throw new Error('the clip has no video track')
  }
  const sink = new VideoSampleSink(track)
  let count = 0
  for await (const sample of sink.samples()) {
    sample.close()
    count += 1
  }
  return count
}

async function regionsAt(
  blob: Blob,
  timestamp: number,
): Promise<{ mark: ImageData; control: ImageData }> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (track === null) {
    throw new Error('the clip has no video track')
  }
  const sample = await new VideoSampleSink(track).getSample(timestamp)
  if (sample === null) {
    throw new Error('no frame at the requested timestamp')
  }
  const canvas = new OffscreenCanvas(CLIP_WIDTH, CLIP_HEIGHT)
  const ctx = context2d(canvas)
  sample.draw(ctx, 0, 0, CLIP_WIDTH, CLIP_HEIGHT)
  sample.close()
  return {
    mark: ctx.getImageData(MARK_REGION.x, MARK_REGION.y, MARK_REGION.width, MARK_REGION.height),
    control: ctx.getImageData(
      CONTROL_REGION.x,
      CONTROL_REGION.y,
      CONTROL_REGION.width,
      CONTROL_REGION.height,
    ),
  }
}

/** Mean absolute per-channel difference between two equally sized regions. */
function meanChannelDelta(left: ImageData, right: ImageData): number {
  const a = left.data
  const b = right.data
  const sum = a.reduce((running, value, offset) => running + Math.abs(value - (b[offset] ?? 0)), 0)
  return sum / a.length
}

/** Counts, over the frames the decode sink actually yields, how many were closed. */
interface FrameTally {
  yielded: number
  closed: number
  restore: () => void
}

function countDecodedFrames(): FrameTally {
  // Captured to re-invoke with `.apply` and to restore afterwards; never called free.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- spy on the decode sink's generator
  const original = VideoSampleSink.prototype.samples
  const tally: FrameTally = {
    yielded: 0,
    closed: 0,
    restore: () => {
      VideoSampleSink.prototype.samples = original
    },
  }
  VideoSampleSink.prototype.samples = function (
    this: VideoSampleSink,
    ...args: Parameters<typeof original>
  ) {
    const generator = original.apply(this, args)
    return (async function* () {
      for await (const sample of generator) {
        tally.yielded += 1
        const close = sample.close.bind(sample)
        sample.close = () => {
          tally.closed += 1
          close()
        }
        yield sample
      }
    })()
  }
  return tally
}

describe('transcodeVideo', () => {
  it.each(['mp4', 'webm'] as const)(
    'retains the full artwork notice in %s without claiming authorship',
    async (container) => {
      const { blob } = await encodeTestClip()
      const bitmap = await loadSticker('cherries')
      const videoCodec = await getFirstEncodableVideoCodec(['vp9', 'av1'], {
        width: CLIP_WIDTH,
        height: CLIP_HEIGHT,
      })
      if (videoCodec === null) throw new Error('No common MP4/WebM test encoder')
      const mark: RenderableMark = {
        spec: { ...MARK.spec, kind: 'symbol', symbol: { type: 'sticker', id: 'cherries' } },
        image: bitmap,
      }
      try {
        const output = await transcodeVideo({
          source: blob,
          marks: [mark],
          plan: {
            container,
            videoCodec,
            bitrate: scaleVideoBitrate('standard', CLIP_WIDTH * CLIP_HEIGHT),
            output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
            audio: { mode: 'none' },
          },
          signal: new AbortController().signal,
        })
        const input = new Input({ source: new BlobSource(output), formats: ALL_FORMATS })
        const metadata = await input.getMetadataTags()
        expect(metadata.comment).toBe(FLUENT_STICKER_NOTICE)
        expect(metadata.artist).toBeUndefined()
        expect(await frameCount(output)).toBe(CLIP_FRAMES)
      } finally {
        bitmap.close()
      }
    },
    TRANSCODE_TIMEOUT_MS,
  )
  it(
    'marks every frame, keeps the frame count, and closes every decoded frame',
    async () => {
      const { blob } = await encodeTestClip()
      const { videoCodec, container } = await outputPlan(CLIP_WIDTH, CLIP_HEIGHT)
      const plan: TranscodePlan = {
        videoCodec,
        container,
        bitrate: scaleVideoBitrate('standard', CLIP_WIDTH * CLIP_HEIGHT),
        output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
        audio: { mode: 'none' },
      }
      const before = await regionsAt(blob, LATE_TIMESTAMP)

      const tally = countDecodedFrames()
      let output: Blob
      try {
        output = await transcodeVideo({
          source: blob,
          marks: [MARK],
          plan,
          signal: new AbortController().signal,
        })
      } finally {
        tally.restore()
      }

      expect(await frameCount(output)).toBe(CLIP_FRAMES)
      expect(tally.yielded).toBe(CLIP_FRAMES)
      expect(tally.closed).toBe(tally.yielded)

      // A late frame — not just the first — must carry the mark: its mark region
      // changes far more than a control region that only saw re-encoding noise.
      const after = await regionsAt(output, LATE_TIMESTAMP)
      const markDiff = meanChannelDelta(before.mark, after.mark)
      const controlDiff = meanChannelDelta(before.control, after.control)
      expect(markDiff).toBeGreaterThan(controlDiff * 3 + 2)
    },
    TRANSCODE_TIMEOUT_MS,
  )

  it(
    'cancels mid-way with a CancelledError, releases the encoder, and leaves no dangling frames',
    async () => {
      const { blob } = await encodeTestClip()
      const { videoCodec, container } = await outputPlan(CLIP_WIDTH, CLIP_HEIGHT)
      const plan: TranscodePlan = {
        videoCodec,
        container,
        bitrate: scaleVideoBitrate('low', CLIP_WIDTH * CLIP_HEIGHT),
        output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
        audio: { mode: 'none' },
      }
      const controller = new AbortController()
      const tally = countDecodedFrames()
      let cancelCalls = 0
      // eslint-disable-next-line @typescript-eslint/unbound-method -- spy on Output.cancel; re-invoked with .apply
      const originalCancel = Output.prototype.cancel
      Output.prototype.cancel = function (this: Output) {
        cancelCalls += 1
        return originalCancel.apply(this)
      }
      try {
        await expect(
          transcodeVideo(
            { source: blob, marks: [MARK], plan, signal: controller.signal },
            {
              onProgress: () => {
                controller.abort()
              },
            },
          ),
        ).rejects.toBeInstanceOf(CancelledError)
      } finally {
        tally.restore()
        Output.prototype.cancel = originalCancel
      }

      expect(cancelCalls).toBeGreaterThan(0)
      expect(tally.yielded).toBeGreaterThan(0)
      expect(tally.closed).toBe(tally.yielded)
    },
    TRANSCODE_TIMEOUT_MS,
  )

  it(
    'keeps an audio track when the input had one',
    async () => {
      const blob = await encodeTestClipWithAudio()
      const { getFirstEncodableVideoCodec } = await import('mediabunny')
      const videoCodec = await getFirstEncodableVideoCodec(['vp9', 'av1', 'vp8'], {
        width: CLIP_WIDTH,
        height: CLIP_HEIGHT,
      })
      if (videoCodec === null) {
        throw new Error('this browser cannot encode a WebM codec')
      }
      const container = containerForCodec(videoCodec)
      const plan: TranscodePlan = {
        videoCodec,
        container,
        bitrate: scaleVideoBitrate('standard', CLIP_WIDTH * CLIP_HEIGHT),
        output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
        audio: planAudio('opus', container, true),
      }
      const output = await transcodeVideo({
        source: blob,
        marks: [MARK],
        plan,
        signal: new AbortController().signal,
      })
      const input = new Input({ source: new BlobSource(output), formats: ALL_FORMATS })
      expect(await input.getPrimaryAudioTrack()).not.toBeNull()
    },
    TRANSCODE_TIMEOUT_MS,
  )
})
