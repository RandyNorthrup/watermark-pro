import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  canEncodeAudio,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { calibrateAacEncoder } from './aac-calibration'
import { finalizeAacMp4 } from './aac-mp4-timing'
import { createTimedAacSource } from './aac-source'
import { CancelledError } from './errors'

const NATIVE_TIMEOUT = 30_000
const RATE = 48_000
const FRAMES = RATE * 4
const MARKERS = [128, FRAMES - 2048]

function referencePcm(): Float32Array {
  const reference = new Float32Array(FRAMES)
  for (const start of MARKERS) {
    for (let frame = 0; frame < 2048; frame += 1) {
      const time = frame / RATE
      const phase = 2 * Math.PI * (1000 * time + (6000 * time * time) / (2 * (2048 / RATE)))
      reference[start + frame] = 0.5 * Math.sin(phase) * Math.sin((Math.PI * frame) / 2048) ** 2
    }
  }
  return reference
}
function alignment(decoded: Float32Array, reference: Float32Array, start: number) {
  let best = { delay: 0, score: -1 }
  for (let delay = -48; delay <= 48; delay += 1) {
    let sum = 0,
      sourceEnergy = 0,
      decodedEnergy = 0
    for (let frame = 512; frame < 1536; frame += 1) {
      const expected = reference[start + frame] ?? 0
      const actual = decoded[start + frame + delay] ?? 0
      sum += expected * actual
      sourceEnergy += expected * expected
      decodedEnergy += actual * actual
    }
    const score = sum / Math.sqrt(sourceEnergy * decodedEnergy || 1)
    if (score > best.score) best = { delay, score }
  }
  return best
}
async function isSupported() {
  return await canEncodeAudio('aac', { sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 })
}
const hasNativeAac = await isSupported()
let timingStage = 'idle'
interface SyntheticDecoderProbe {
  decoder: AudioDecoder
  stage: string
  firstTimestamp: number
  lastTimestamp: number
  packets: number
}
const decoderProbes: SyntheticDecoderProbe[] = []
function isNativeDecode(
  value: unknown,
): value is (this: AudioDecoder, chunk: EncodedAudioChunk) => void {
  return typeof value === 'function'
}
function observeSyntheticDecoder() {
  const decode: unknown = Object.getOwnPropertyDescriptor(AudioDecoder.prototype, 'decode')?.value
  if (!isNativeDecode(decode))
    throw new Error('Synthetic decoder probe lost native implementation.')
  const spy = vi.spyOn(AudioDecoder.prototype, 'decode')
  const probes = new WeakMap<AudioDecoder, SyntheticDecoderProbe>()
  spy.mockImplementation(function (this: AudioDecoder, chunk: EncodedAudioChunk) {
    let probe = probes.get(this)
    if (probe === undefined) {
      probe = {
        decoder: this,
        stage: timingStage,
        firstTimestamp: chunk.timestamp,
        lastTimestamp: chunk.timestamp,
        packets: 0,
      }
      probes.set(this, probe)
      decoderProbes.push(probe)
    }
    probe.lastTimestamp = chunk.timestamp
    probe.packets += 1
    decode.call(this, chunk)
  })
}

describe('native AAC project timing', () => {
  afterEach((context) => {
    if (context.task.result?.state === 'fail') {
      console.error('Synthetic AAC timing stage', timingStage)
      console.error(
        'Synthetic AAC decoder queues',
        decoderProbes.map(({ decoder, ...probe }) => ({
          ...probe,
          state: decoder.state,
          queue: decoder.decodeQueueSize,
        })),
      )
    }
    vi.restoreAllMocks()
    decoderProbes.length = 0
  })
  it(
    hasNativeAac
      ? 'native AAC preserves exact timeline duration and both decoded edges'
      : 'unavailable native AAC encoder explicitly refuses calibration',
    async () => {
      if (!hasNativeAac) {
        await expect(calibrateAacEncoder(new AbortController().signal)).rejects.toThrow()
        return
      }
      observeSyntheticDecoder()
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: false }),
        target: new BufferTarget(),
      })
      timingStage = 'prepare-calibration'
      const source = await createTimedAacSource(output, 4, new AbortController().signal)
      const reference = referencePcm()
      try {
        timingStage = 'start-output'
        await output.start()
        timingStage = 'encode-reference'
        for (let offset = 0; offset < FRAMES; offset += 2048) {
          const frames = Math.min(2048, FRAMES - offset)
          const data = new Float32Array(frames * 2)
          data.set(reference.subarray(offset, offset + frames))
          data.set(reference.subarray(offset, offset + frames), frames)
          await source.add(data, frames, offset)
        }
        timingStage = 'finish-source'
        const timing = await source.finish()
        timingStage = 'finalize-output'
        await output.finalize()
        if (output.target.buffer === null) throw new Error('Native AAC output missing.')
        timingStage = 'write-timing'
        const blob = finalizeAacMp4(output.target.buffer, timing)
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
        try {
          timingStage = 'demux-output'
          expect(await input.computeDuration()).toBeCloseTo(4, 5)
          const track = await input.getPrimaryAudioTrack()
          if (track === null) throw new Error('Native AAC track missing.')
          // Verify container/native playback before a sample iterator can stall.
          timingStage = 'decode-web-audio'
          const native = await new OfflineAudioContext(2, RATE, RATE).decodeAudioData(
            await blob.arrayBuffer(),
          )
          expect(native.length).toBeGreaterThanOrEqual(FRAMES)
          expect(native.length).toBeLessThan(FRAMES + 1024)
          for (const start of MARKERS) {
            const result = alignment(native.getChannelData(0), reference, start)
            expect(result.score).toBeGreaterThan(0.9)
            expect(Math.abs(result.delay)).toBeLessThanOrEqual(1)
          }
          const decoded = new Float32Array(FRAMES)
          const samples = new AudioSampleSink(track).samples()
          timingStage = 'decode-library'
          for await (const sample of samples) {
            try {
              const offset = Math.round(sample.timestamp * RATE)
              const begin = Math.max(0, offset),
                end = Math.min(FRAMES, offset + sample.numberOfFrames)
              if (end <= begin) continue
              const plane = new Float32Array(sample.numberOfFrames)
              sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' })
              decoded.set(plane.subarray(begin - offset, end - offset), begin)
            } finally {
              sample.close()
            }
          }
          for (const start of MARKERS) {
            const result = alignment(decoded, reference, start)
            expect(result.score).toBeGreaterThan(0.9)
            expect(Math.abs(result.delay)).toBeLessThanOrEqual(1)
          }
        } finally {
          input.dispose()
        }
      } finally {
        timingStage += ':cleanup'
        await source.cancel()
        if (output.state !== 'finalized') await output.cancel()
      }
    },
    NATIVE_TIMEOUT,
  )

  it('refuses cancellation before allocating an encoder', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(calibrateAacEncoder(controller.signal)).rejects.toBeInstanceOf(CancelledError)
  })
  it.each([0, NaN, 601])('refuses out-of-bound duration %s', async (duration) => {
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    await expect(
      createTimedAacSource(output, duration, new AbortController().signal),
    ).rejects.toThrow('duration')
    await output.cancel()
  })
  if (hasNativeAac) {
    it(
      'refuses non-contiguous PCM and a missing project tail',
      async () => {
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: false }),
          target: new BufferTarget(),
        })
        const source = await createTimedAacSource(output, 4096 / RATE, new AbortController().signal)
        try {
          await output.start()
          await source.add(new Float32Array(4096), 2048, 0)
          await expect(source.add(new Float32Array(4096), 2048, 4096)).rejects.toThrow('contiguous')
          await expect(source.add(new Float32Array(1), 2048, 2048)).rejects.toThrow('contiguous')
          await expect(source.finish()).rejects.toThrow('missing project samples')
        } finally {
          await source.cancel()
          await output.cancel()
        }
      },
      NATIVE_TIMEOUT,
    )
    it(
      'cancels an already started native encoder instead of returning partial audio',
      async () => {
        const controller = new AbortController()
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: false }),
          target: new BufferTarget(),
        })
        const source = await createTimedAacSource(output, 4096 / RATE, controller.signal)
        try {
          await output.start()
          await source.add(new Float32Array(4096), 2048, 0)
          controller.abort()
          await expect(source.add(new Float32Array(4096), 2048, 2048)).rejects.toBeInstanceOf(
            CancelledError,
          )
        } finally {
          await source.cancel()
          await output.cancel()
        }
      },
      NATIVE_TIMEOUT,
    )
    it(
      'surfaces packet-forwarding failures through both work and cleanup',
      async () => {
        vi.spyOn(EncodedAudioPacketSource.prototype, 'add').mockRejectedValueOnce(
          new Error('Native fixture forwarding failure'),
        )
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: false }),
          target: new BufferTarget(),
        })
        const source = await createTimedAacSource(output, 2048 / RATE, new AbortController().signal)
        await output.start()
        const work = async () => {
          await source.add(new Float32Array(4096), 2048, 0)
          await source.finish()
        }
        try {
          await expect(work()).rejects.toThrow('Native fixture forwarding failure')
        } finally {
          await expect(source.cancel()).rejects.toThrow('Native fixture forwarding failure')
          await output.cancel()
        }
      },
      NATIVE_TIMEOUT,
    )
  }
})
