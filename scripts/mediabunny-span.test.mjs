import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ALL_FORMATS, AudioSampleSink, BufferSource, EncodedPacketSink, Input } from 'mediabunny'

import * as aac from '../node_modules/mediabunny/dist/modules/shared/aac-misc.js'

const GAP_FIXTURE = fileURLToPath(
  new URL('../e2e/fixtures/aac-mono-gap-44100.m4a', import.meta.url),
)

// Named ASC fixtures: LC's GASpecificConfig flag selects 1024/960 core frames;
// explicit SBR/PS carries the core rate before the extension output rate.
const fixtures = [
  {
    name: 'mono LC 1024',
    bytes: [0x12, 0x08],
    coreRate: 44_100,
    frames: 1024,
    outputRate: 44_100,
    outputFrames: 1024,
  },
  {
    name: 'stereo LC 1024',
    bytes: [0x11, 0x90],
    coreRate: 48_000,
    frames: 1024,
    outputRate: 48_000,
    outputFrames: 1024,
  },
  {
    name: 'mono LC 960',
    bytes: [0x12, 0x0c],
    coreRate: 44_100,
    frames: 960,
    outputRate: 44_100,
    outputFrames: 960,
  },
  {
    name: 'stereo LC 960',
    bytes: [0x11, 0x94],
    coreRate: 48_000,
    frames: 960,
    outputRate: 48_000,
    outputFrames: 960,
  },
  {
    name: 'explicit HE 1024 core / 2048 output',
    bytes: [0x2b, 0x8a, 0x08, 0],
    coreRate: 22_050,
    frames: 1024,
    outputRate: 44_100,
    outputFrames: 2048,
  },
  {
    name: 'explicit HE 960 core / 1920 output',
    bytes: [0x2b, 0x8a, 0x0a, 0],
    coreRate: 22_050,
    frames: 960,
    outputRate: 44_100,
    outputFrames: 1920,
  },
  {
    name: 'explicit HE v2 PS',
    bytes: [0xeb, 0x8a, 0x08, 0],
    coreRate: 22_050,
    frames: 1024,
    outputRate: 44_100,
    outputFrames: 2048,
  },
]

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const parsed = aac.parseAacAudioSpecificConfig(Uint8Array.from(fixture.bytes))
    assert.equal(parsed.coreSampleRate, fixture.coreRate)
    assert.equal(parsed.coreFrames, fixture.frames)
    assert.equal(parsed.outputSampleRate, fixture.outputRate)
    assert.equal(parsed.outputFrames, fixture.outputFrames)
    assert.equal(
      parsed.coreFrames / parsed.coreSampleRate,
      parsed.outputFrames / parsed.outputSampleRate,
    )
  })
}

for (const [name, bytes] of [
  ['empty ASC', []],
  ['truncated LC ASC', [0x12]],
  ['truncated explicit HE ASC', [0x2b, 0x8a]],
  ['reserved frequency', [0x16, 0x88]],
  ['unknown core object type', [0x2b, 0x8a, 0x04, 0]],
]) {
  test(`${name} rejects unknown span provenance`, () => {
    assert.equal(typeof aac.getAacFrameSpan, 'function')
    assert.throws(() => aac.getAacFrameSpan(Uint8Array.from(bytes)), TypeError)
  })
}

test('unknown core retains existing metadata parser capability', () => {
  const parsed = aac.parseAacAudioSpecificConfig(Uint8Array.of(0x2b, 0x8a, 0x04, 0))
  assert.equal(parsed.coreObjectType, 1)
  assert.equal(parsed.outputSampleRate, 44_100)
  assert.equal(parsed.coreFrames, null)
})

// This fixture scripts only the WebCodecs boundary. The real installed SDK,
// demuxer, packet pump, sample splitting and lifecycle run without replacement.
// It is a frame-accounting proof, not a native AAC waveform/codec proof.
const fixture = { rate: 44_100, frames: 178_176, priming: 1024, seconds: 6, deadline: 30_000 }
const originalDecoder = Object.getOwnPropertyDescriptor(globalThis, 'AudioDecoder')
const originalChunk = Object.getOwnPropertyDescriptor(globalThis, 'EncodedAudioChunk')
const boundary = { scenario: {}, instances: [] }
const ChunkFixture = class EncodedChunkFixture {
  data
  constructor(init) {
    Object.assign(this, init)
  }
  get byteLength() {
    return this.data.byteLength
  }
}
const DecoderFixture = class NativeBoundaryFixture {
  static async isConfigSupported(config) {
    return { config, supported: boundary.scenario.supported !== false }
  }
  state = 'unconfigured'
  decodeQueueSize = 0
  closed = Promise.withResolvers()
  position = 0
  packetCount = 0
  constructor(init) {
    this.init = init
    this.position = boundary.scenario.dropFirstFrames ?? 0
    boundary.instances.push(this)
  }
  configure() {
    this.state = 'configured'
  }
  decode() {
    this.packetCount += 1
    if (boundary.scenario.immediate) this.emit(1024)
  }
  emit(frames) {
    const data = Float32Array.from({ length: frames }, (_, index) => this.position + index + 1)
    this.init.output({
      format: 'f32-planar',
      data,
      sampleRate: boundary.scenario.rate ?? fixture.rate,
      numberOfChannels: 1,
      timestamp: this.position / (boundary.scenario.rate ?? fixture.rate),
    })
    this.position += frames
  }
  async flush() {
    if (boundary.scenario.immediate) return
    const total = this.packetCount * 1024 + (boundary.scenario.adjustFrames ?? 0)
    let index = 0
    while (this.position < total) {
      this.emit(
        Math.min(
          total - this.position,
          boundary.scenario.groups[index % boundary.scenario.groups.length],
        ),
      )
      index += 1
    }
    this.packetCount = 0
    this.position = 0
  }
  close() {
    this.state = 'closed'
    this.closed.resolve()
  }
}

Object.defineProperties(globalThis, {
  EncodedAudioChunk: {
    configurable: true,
    writable: true,
    value: ChunkFixture,
  },
  AudioDecoder: {
    configurable: true,
    writable: true,
    value: DecoderFixture,
  },
})

async function read(options, start, end) {
  boundary.scenario = options
  boundary.instances = []
  const input = new Input({
    source: new BufferSource(readFileSync(GAP_FIXTURE)),
    formats: ALL_FORMATS,
  })
  const pcm = new Float32Array(fixture.seconds * fixture.rate)
  let frames = 0
  let first = null
  let previousEnd = null
  let gap = 0
  let error = null
  let samples
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    if (options.unknown)
      track.getDecoderConfig = async () => ({
        codec: 'mp4a.40.5',
        sampleRate: 44_100,
        numberOfChannels: 1,
        description: Uint8Array.of(0x2b, 0x8a, 0x04, 0),
      })
    samples = new AudioSampleSink(track).samples(start, end)
    for await (const sample of samples) {
      try {
        first ??= sample.timestamp
        frames += sample.numberOfFrames
        if (previousEnd !== null) gap = Math.max(gap, sample.timestamp - previousEnd)
        previousEnd = sample.timestamp + sample.duration
        const data = new Float32Array(sample.numberOfFrames)
        sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' })
        const offset = Math.round(sample.timestamp * fixture.rate)
        const begin = Math.max(0, offset)
        const finish = Math.min(pcm.length, offset + sample.numberOfFrames)
        if (finish > begin) pcm.set(data.subarray(begin - offset, finish - offset), begin)
        if (options.cancel) break
      } finally {
        sample.close()
      }
    }
  } catch (error_) {
    error = error_
  } finally {
    await samples?.return()
    input.dispose()
    await Promise.all(boundary.instances.map((instance) => instance.closed.promise))
  }
  return {
    pcm,
    frames,
    first,
    gap,
    error,
    decoderCount: boundary.instances.length,
    closed: boundary.instances.every((instance) => instance.state === 'closed'),
  }
}

function assertComplete(result) {
  assert.equal(result.error, null)
  assert.equal(result.frames, fixture.frames)
  assert.equal(result.first, -fixture.priming / fixture.rate)
  assert.ok(Math.abs(result.gap - 1) < 1 / fixture.rate)
  assert.ok(
    result.pcm.subarray(2.2 * fixture.rate, 2.4 * fixture.rate).every((value) => value === 0),
  )
  for (const [time, sourceTime] of [
    [0.25, 0.25],
    [3.25, 2.25],
    [4.25, 3.25],
  ])
    assert.equal(
      result.pcm[Math.round(time * fixture.rate)],
      Math.round(sourceTime * fixture.rate) + fixture.priming + 1,
    )
  assert.equal(result.closed, true)
}

test(
  'one grouped native output crosses the gap without losing ordered frames',
  { timeout: fixture.deadline },
  async () => {
    assertComplete(await read({ groups: [fixture.frames] }))
  },
)
test(
  'split and grouped native outputs preserve presentation independently of callback count',
  { timeout: fixture.deadline },
  async () => {
    assertComplete(await read({ groups: [127, 1900, 2048] }))
  },
)
for (const [name, options, message] of [
  ['unexplained priming discard', { groups: [2048], dropFirstFrames: 1024 }, 'decoded extent'],
  ['unexplained tail discard', { groups: [2048], adjustFrames: -1 }, 'decoded extent'],
  ['surplus decoded PCM', { groups: [fixture.frames + 1], adjustFrames: 1 }, 'output exceeds'],
  ['unknown native output rate', { groups: [fixture.frames], rate: 48_000 }, 'decoded rate'],
  ['unknown ASC span', { groups: [fixture.frames], unknown: true }, 'span provenance'],
]) {
  test(`${name} explicitly rejects and closes`, { timeout: fixture.deadline }, async () => {
    const result = await read(options)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, new RegExp(message, 'i'))
    assert.equal(result.closed, true)
  })
}
test(
  'cancellation closes without requiring a complete registered extent',
  { timeout: fixture.deadline },
  async () => {
    const result = await read({ immediate: true, cancel: true })
    assert.equal(result.error, null)
    assert.equal(result.frames, 1024)
    assert.equal(result.closed, true)
  },
)
test(
  'unsupported native capability rejects before a decoder is constructed',
  { timeout: fixture.deadline },
  async () => {
    const result = await read({ groups: [fixture.frames], supported: false })
    assert.match(result.error?.message ?? '', /cannot be decoded/)
    assert.equal(result.decoderCount, 0)
  },
)
test(
  'partial seek preserves its original positive presentation origin',
  { timeout: fixture.deadline },
  async () => {
    const result = await read({ groups: [127, 1900, 2048] }, 3.1, 3.5)
    assert.equal(result.error, null)
    assert.ok(result.first > 3 && result.first <= 3.1)
    assert.ok(result.pcm[Math.round(3.2 * fixture.rate)] > 0)
    assert.equal(Math.round(result.gap * fixture.rate), 0)
    assert.equal(result.closed, true)
  },
)
test(
  'existing sparse forward/backward seek flushes start independent span batches',
  { timeout: fixture.deadline },
  async () => {
    boundary.scenario = { groups: [127, 1900, 2048] }
    boundary.instances = []
    const input = new Input({
      source: new BufferSource(readFileSync(GAP_FIXTURE)),
      formats: ALL_FORMATS,
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const times = [0.25, 3.25, 0.5]
      const expected = await Promise.all(
        times.map((time) => new EncodedPacketSink(track).getPacket(time)),
      )
      let index = 0
      const samples = new AudioSampleSink(track).samplesAtTimestamps(times)
      for await (const sample of samples) {
        assert.ok(sample)
        try {
          assert.ok(Math.abs(sample.timestamp - expected[index].timestamp) < 1 / fixture.rate)
          assert.ok(sample.numberOfFrames > 0)
          index += 1
        } finally {
          sample.close()
        }
      }
      assert.equal(index, times.length)
    } finally {
      input.dispose()
      await Promise.all(boundary.instances.map((instance) => instance.closed.promise))
    }
    assert.equal(boundary.instances.length, 1)
    assert.equal(boundary.instances[0].state, 'closed')
  },
)

test.after(() => {
  if (originalDecoder === undefined) Reflect.deleteProperty(globalThis, 'AudioDecoder')
  else Object.defineProperty(globalThis, 'AudioDecoder', originalDecoder)
  if (originalChunk === undefined) Reflect.deleteProperty(globalThis, 'EncodedAudioChunk')
  else Object.defineProperty(globalThis, 'EncodedAudioChunk', originalChunk)
})
