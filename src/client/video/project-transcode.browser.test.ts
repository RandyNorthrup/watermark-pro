import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  getFirstEncodableVideoCodec,
  Input,
  VideoSampleSink,
} from 'mediabunny'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { CancelledError } from './errors'
import { context2d } from './frame'
import { createVideoMotion } from './motion'
import type { TranscodePlan } from './plan'
import { transcodeProject, type ProjectComposition } from './project-transcode'
import { encodeTestAudio } from './test-support/audio'
import { encodeTestClip, encodeTestClipWithAudio } from './test-support/clip'
import { MAX_VIDEO_BYTES } from '../../shared/constants'
import {
  appendProjectClip,
  editProjectClip,
  emptyVideoProject,
  projectDuration,
  splitProjectClip,
  type VideoProject,
} from '../../shared/video-project'
import { DEFAULT_SHAPE_SPEC } from '../../shared/watermark'

const NATIVE_TIMEOUT = 30_000
let grey: Blob
let red: Blob
let sound: Blob
let plan: TranscodePlan
let project: VideoProject

beforeAll(async () => {
  const greyClip = await encodeTestClip()
  const redClip = await encodeTestClip('#c02020')
  grey = greyClip.blob
  red = redClip.blob
  sound = await encodeTestClipWithAudio()
  const videoCodec = await getFirstEncodableVideoCodec(['vp9', 'vp8'])
  if (videoCodec === null) throw new Error('Native composition tests require a video encoder.')
  plan = {
    videoCodec,
    container: 'webm',
    bitrate: 800_000,
    output: { width: 320, height: 240 },
    audio: { mode: 'reencode', codec: 'opus', bitrate: 96_000 },
  }
  project = appendProjectClip(emptyVideoProject('Native project', 320, 240), {
    id: 'grey',
    kind: 'video',
    duration: 1,
    hasAudio: false,
  })
}, NATIVE_TIMEOUT)
function request(value = project): ProjectComposition {
  return {
    project: value,
    sources: [
      { id: 'grey', source: grey },
      { id: 'red', source: red },
      { id: 'sound', source: sound },
    ],
  }
}
async function render(composition: ProjectComposition, signal = new AbortController().signal) {
  return await transcodeProject({ ...composition, source: grey, marks: [], plan, signal })
}
async function pixel(blob: Blob, time: number, x = 160, y = 120) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (track === null) throw new Error('Export has no video track.')
    const sample = await new VideoSampleSink(track).getSample(time)
    if (sample === null) throw new Error('Export frame is missing.')
    const canvas = new OffscreenCanvas(320, 240)
    const context = context2d(canvas)
    try {
      sample.draw(context, 0, 0, 320, 240)
    } finally {
      sample.close()
    }
    return [...context.getImageData(x, y, 1, 1).data].slice(0, 3)
  } finally {
    input.dispose()
  }
}
async function amplitude(blob: Blob, start: number, end: number): Promise<number | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (track === null) return null
    let sum = 0
    let count = 0
    const samples = new AudioSampleSink(track).samples(start, end)
    for await (const sample of samples) {
      try {
        const data = new Float32Array(sample.numberOfFrames)
        sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' })
        for (const [index, value] of data.entries()) {
          const time = sample.timestamp + index / sample.sampleRate
          if (time >= start && time < end) {
            sum += value * value
            count += 1
          }
        }
      } finally {
        sample.close()
      }
    }
    if (count === 0) throw new Error('No samples in measured audio interval.')
    return Math.sqrt(sum / count)
  } finally {
    input.dispose()
  }
}

describe('native multi-clip composition', () => {
  it.each([2, 4])(
    'resamples real %i-channel PCM into a bounded stereo mix',
    async (channels) => {
      const wave = await encodeTestAudio(channels)
      const withAudio = appendProjectClip(project, {
        id: 'wave',
        kind: 'audio',
        duration: 1,
        hasAudio: true,
      })
      const audio = withAudio.clips.at(-1)
      if (audio === undefined) throw new Error('PCM fixture missing.')
      const edited = editProjectClip(withAudio, audio.id, { gain: 0.5 })
      const composition = request(edited)
      const blob = await render({
        ...composition,
        sources: [...composition.sources, { id: 'wave', source: wave }],
      })
      const rms = await amplitude(blob, 0.2, 0.8)
      expect(rms).toBeGreaterThan(channels === 2 ? 0.06 : 0.13)
      expect(rms).toBeLessThan(channels === 2 ? 0.11 : 0.21)
    },
    NATIVE_TIMEOUT,
  )
  it(
    'cuts trimmed sources at project time and preserves source frame offsets',
    async () => {
      const first = project.clips[0]
      if (first === undefined) throw new Error('Fixture clip missing.')
      const trimmed = editProjectClip(project, first.id, { out: 0.5 })
      const joined = appendProjectClip(trimmed, {
        id: 'red',
        kind: 'video',
        duration: 1,
        hasAudio: false,
      })
      const second = joined.clips.at(-1)
      if (second === undefined) throw new Error('Second clip missing.')
      const timeline = editProjectClip(joined, second.id, { in: 0.5 })
      const blob = await render(request(timeline))
      const measured1 = await pixel(blob, 0.2)
      expect(measured1).toEqual(expect.arrayContaining([expect.closeTo(128, -1)]))
      const after = await pixel(blob, 0.8)
      expect(after[0]).toBeGreaterThan(175)
      expect(after[1]).toBeLessThan(50)
      // The blue square has advanced into the second source's trimmed interval.
      const measured2 = await pixel(blob, 0.8, 145, 10)
      expect(measured2[2]).toBeGreaterThan(150)
      const measured3 = await pixel(blob, 0.8, 30, 10)
      expect(measured3[2]).toBeLessThan(50)
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
      try {
        expect(await input.computeDuration()).toBeCloseTo(1, 2)
      } finally {
        input.dispose()
      }
      expect(projectDuration(timeline)).toBe(1)
    },
    NATIVE_TIMEOUT,
  )

  it(
    'composites V2 scale and opacity above V1 and exports intentional gaps',
    async () => {
      const layered = appendProjectClip(
        project,
        { id: 'red', kind: 'video', duration: 1, hasAudio: false },
        1,
      )
      const overlay = layered.clips.at(-1)
      if (overlay === undefined) throw new Error('Overlay missing.')
      const small = editProjectClip(layered, overlay.id, { scale: 0.5, opacity: 0.5 })
      const blob = await render(request(small))
      const measured4 = await pixel(blob, 0.5)
      expect(measured4[0]).toBeGreaterThan(150)
      const measured5 = await pixel(blob, 0.5, 20, 100)
      expect(measured5[0]).toBeCloseTo(128, -1)
      const hidden = await render(request({ ...small, hiddenVideo: [true, true] }))
      const measured6 = await pixel(hidden, 0.5)
      expect(measured6).toEqual([0, 0, 0])
      const first = project.clips[0]
      if (first === undefined) throw new Error('Fixture missing.')
      const gap = await render(request(editProjectClip(project, first.id, { start: 0.25 })))
      const measured7 = await pixel(gap, 0.1)
      expect(measured7).toEqual([0, 0, 0])
      const measured8 = await pixel(gap, 0.5)
      expect(measured8[0]).toBeGreaterThan(120)
    },
    NATIVE_TIMEOUT,
  )

  it(
    'streams source audio with trims, gain and silence; mute removes audio',
    async () => {
      const withSound = appendProjectClip(project, {
        id: 'sound',
        kind: 'audio',
        duration: 1,
        hasAudio: true,
      })
      const audio = withSound.clips.at(-1)
      if (audio === undefined) throw new Error('Sound missing.')
      const edited = editProjectClip(withSound, audio.id, {
        start: 0.25,
        in: 0.1,
        out: 0.8,
        gain: 0.5,
      })
      const blob = await render(request(edited))
      expect(await amplitude(blob, 0.02, 0.15)).toBeLessThan(0.001)
      expect(await amplitude(blob, 0.4, 0.6)).toBeGreaterThan(0.06)
      expect(await amplitude(blob, 0.4, 0.6)).toBeLessThan(0.11)
      expect(await amplitude(blob, 0.97, 0.99)).toBeLessThan(0.01)
      const muted = await render(request({ ...edited, mutedAudio: [false, false, true, false] }))
      expect(await amplitude(muted, 0.4, 0.6)).toBeNull()
      const zero = await render(request(editProjectClip(edited, audio.id, { gain: 0 })))
      expect(await amplitude(zero, 0.4, 0.6)).toBeNull()
    },
    NATIVE_TIMEOUT,
  )

  it(
    'cuts linked audio with picture and mixes overlapping sound',
    async () => {
      const linked = appendProjectClip(emptyVideoProject('Linked', 320, 240), {
        id: 'sound',
        kind: 'video',
        duration: 1,
        hasAudio: true,
      })
      const first = linked.clips[0]
      if (first === undefined) throw new Error('Linked fixture missing.')
      const cut = splitProjectClip(linked, first.id, 0.5)
      const mixed = appendProjectClip(
        cut,
        { id: 'sound', kind: 'audio', duration: 1, hasAudio: true },
        3,
      )
      const blob = await render(request(mixed))
      expect(await amplitude(blob, 0.6, 0.8)).toBeGreaterThan(0.25)
      const measured9 = await pixel(blob, 0.7)
      expect(measured9[0]).toBeGreaterThan(120)
    },
    NATIVE_TIMEOUT,
  )

  it(
    'applies watermark timing after composing picture',
    async () => {
      const spec = {
        ...DEFAULT_SHAPE_SPEC,
        fill: { enabled: true, colour: '#ff0000', opacity: 1 },
        style: { ...DEFAULT_SHAPE_SPEC.style, scale: 0.3, opacity: 1 },
        placement: { mode: 'custom' as const, x: 0.5, y: 0.5 },
      }
      const motion = { ...createVideoMotion(1), start: 0.5 }
      const blob = await transcodeProject({
        ...request(),
        source: grey,
        marks: [{ spec }],
        motions: [motion],
        plan,
        signal: new AbortController().signal,
      })
      const measured10 = await pixel(blob, 0.2)
      expect(measured10[0]).toBeCloseTo(128, -1)
      const measured11 = await pixel(blob, 0.8)
      expect(measured11[0]).toBeGreaterThan(220)
      const measured12 = await pixel(blob, 0.8)
      expect(measured12[1]).toBeLessThan(30)
    },
    NATIVE_TIMEOUT,
  )

  it(
    'rejects missing sources, invalid trims, duplicate sources and empty picture',
    async () => {
      await expect(render({ ...request(), sources: [] })).rejects.toThrow('missing')
      await expect(
        render({
          ...request(),
          sources: [
            { id: 'grey', source: grey },
            { id: 'grey', source: grey },
          ],
        }),
      ).rejects.toThrow('unique')
      const first = project.clips[0]
      if (first === undefined) throw new Error('Fixture missing.')
      const invalidTrim = editProjectClip(project, first.id, { out: 2 })
      await expect(render(request(invalidTrim))).rejects.toThrow('beyond')
      const empty = emptyVideoProject('Empty')
      await expect(render(request(empty))).rejects.toThrow('Add video')
      const oversized = new Blob()
      Object.defineProperty(oversized, 'size', { value: MAX_VIDEO_BYTES + 1 })
      await expect(
        render({ ...request(), sources: [{ id: 'grey', source: oversized }] }),
      ).rejects.toThrow('limit')
    },
    NATIVE_TIMEOUT,
  )

  it(
    'refuses missing audio and unsupported audio encoding instead of exporting silence',
    async () => {
      const absent = appendProjectClip(project, {
        id: 'red',
        kind: 'audio',
        duration: 1,
        hasAudio: true,
      })
      await expect(render(request(absent))).rejects.toThrow('audio track')
      const actual = appendProjectClip(project, {
        id: 'sound',
        kind: 'audio',
        duration: 1,
        hasAudio: true,
      })
      await expect(
        transcodeProject({
          ...request(actual),
          source: grey,
          marks: [],
          plan: { ...plan, audio: { mode: 'none' } },
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow('audio encoder')
    },
    NATIVE_TIMEOUT,
  )

  it(
    'cancels before work and during frames, disposing every opened native input',
    async () => {
      const before = new AbortController()
      before.abort()
      await expect(render(request(), before.signal)).rejects.toBeInstanceOf(CancelledError)
      const during = new AbortController()
      const dispose = vi.spyOn(Input.prototype, 'dispose')
      try {
        await expect(
          transcodeProject(
            { ...request(), source: grey, marks: [], plan, signal: during.signal },
            {
              onProgress: (frames) => {
                if (frames === 3) during.abort()
              },
            },
          ),
        ).rejects.toBeInstanceOf(CancelledError)
        expect(dispose).toHaveBeenCalledTimes(3)
      } finally {
        dispose.mockRestore()
      }
    },
    NATIVE_TIMEOUT,
  )
})
