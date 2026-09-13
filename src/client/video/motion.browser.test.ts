import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import { expect, it } from 'vitest'

import { context2d } from './frame'
import { containerForCodec, scaleVideoBitrate } from './plan'
import { CLIP_HEIGHT, CLIP_WIDTH, encodeTestClip } from './test-support/clip'
import { VideoTranscoder } from './worker-client'
import { DEFAULT_SHAPE_SPEC } from '../../shared/watermark'

/** Observe encoded pixels, independently of the motion interpolation functions. */
async function redMark(blob: Blob, time: number) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (track === null) throw new Error('Missing video track')
  const sample = await new VideoSampleSink(track).getSample(time)
  if (sample === null) throw new Error('Missing frame')
  const canvas = new OffscreenCanvas(CLIP_WIDTH, CLIP_HEIGHT)
  const context = context2d(canvas)
  sample.draw(context, 0, 0, canvas.width, canvas.height)
  sample.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  let sumX = 0
  let maxRed = 0
  for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += 1) {
    const red = pixels[pixel * 4] ?? 0
    const green = pixels[pixel * 4 + 1] ?? 0
    if (red < 150 || red < green * 1.3) continue
    count += 1
    sumX += pixel % canvas.width
    maxRed = Math.max(maxRed, red)
  }
  return { count, x: count === 0 ? null : sumX / count, maxRed }
}

it('the real video worker exports movement and both fades at their timestamps', async () => {
  const clip = await encodeTestClip()
  const worker = new VideoTranscoder()
  try {
    const output = await worker.transcode(
      {
        source: clip.blob,
        fonts: [],
        marks: [
          {
            spec: {
              ...DEFAULT_SHAPE_SPEC,
              aspect: 2,
              fill: { enabled: true, colour: '#ff0000', opacity: 1 },
              stroke: { width: 0, colour: null },
              style: { ...DEFAULT_SHAPE_SPEC.style, scale: 0.15, opacity: 1 },
            },
          },
        ],
        motions: [
          {
            start: 0,
            end: 1,
            fadeIn: 0.2,
            fadeOut: 0.2,
            keyframes: [
              { time: 0, x: 0.25, y: 0.65, scale: 0.15, rotation: 0, opacity: 1 },
              { time: 0.8, x: 0.75, y: 0.65, scale: 0.15, rotation: 90, opacity: 1 },
            ],
          },
        ],
        plan: {
          videoCodec: clip.codec,
          container: containerForCodec(clip.codec),
          bitrate: scaleVideoBitrate('high', CLIP_WIDTH * CLIP_HEIGHT),
          output: { width: CLIP_WIDTH, height: CLIP_HEIGHT },
          audio: { mode: 'none' },
        },
      },
      {},
    )
    const start = await redMark(output, 0)
    expect(start.count).toBe(0)
    const middle = await redMark(output, 0.4)
    const late = await redMark(output, 0.8)
    const fading = await redMark(output, 0.9)
    expect(middle.count).toBeGreaterThan(500)
    expect(middle.x).toBeCloseTo(CLIP_WIDTH / 2, -1)
    expect(late.x).toBeCloseTo(CLIP_WIDTH * 0.75, -1)
    expect(middle.maxRed).toBeGreaterThan(240)
    expect(fading.maxRed).toBeGreaterThan(170)
    expect(fading.maxRed).toBeLessThan(220)
  } finally {
    worker.terminate()
  }
}, 30_000)
