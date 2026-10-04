import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  BufferSource,
  EncodedPacketSink,
  Input,
} from 'mediabunny'

export type ReadMode = 'complete' | 'cancel' | 'error'
export interface SdkAudioReport {
  rate: number
  channels: number
  originalFirst: number
  decodedFirst: number | null
  nativeFirst: number
  originalDeltas: number[]
  nativeDeltas: number[]
  maximumGap: number
  activeRms: number
  silentRms: number
  hasClosed: boolean
  error: string | null
  decodedFrames: number
  gapRms: number
  postGapRms: number
  finalToneRms: number
  observation: SdkTimingObservation
}
interface SampleTiming {
  beforeTimestamp: number
  afterTimestamp: number
  duration: number
  frames: number
}
interface TimingSummary {
  count: number
  frames: number
  first: SampleTiming | null
  last: SampleTiming | null
  end: number | null
  maximumAfterGap: number
  maximumBeforeGap: number
  beforeGapBefore: SampleTiming | null
  beforeGapAfter: SampleTiming | null
  gapBefore: SampleTiming | null
  gapAfter: SampleTiming | null
  nearestBeforeJump: SampleTiming | null
  nearestAfterJump: SampleTiming | null
}
interface PacketTiming {
  timestamp: number
  duration: number
}
interface SdkTimingObservation {
  packets: {
    count: number
    first: PacketTiming | null
    last: PacketTiming | null
    maximumDelta: number
    beforeJump: PacketTiming | null
    afterJump: PacketTiming | null
  }
  nativeInput: { count: number; first: number | null; last: number | null; maximumDelta: number }
  timestampSetterEvents: TimingSummary
  decodedSamples: TimingSummary
  allocatedPcmFrames: number
  maximumGap: number
}
function emptyTiming(): TimingSummary {
  return {
    count: 0,
    frames: 0,
    first: null,
    last: null,
    end: null,
    maximumAfterGap: 0,
    maximumBeforeGap: 0,
    beforeGapBefore: null,
    beforeGapAfter: null,
    gapBefore: null,
    gapAfter: null,
    nearestBeforeJump: null,
    nearestAfterJump: null,
  }
}
// Retain fixed setter-event or emitted-sample records; event frame sums may repeat actual PCM frames.
// Never retain PCM or a full sample trace; decodedSamples carries the physical emitted extent.
function retainTiming(summary: TimingSummary, timing: SampleTiming, before: number, after: number) {
  if (
    [timing.beforeTimestamp, timing.afterTimestamp, timing.duration, timing.frames].some(
      (value) => !Number.isFinite(value),
    )
  )
    throw new Error('Synthetic SDK sample timing is not finite.')
  summary.count += 1
  summary.frames += timing.frames
  summary.first ??= timing
  if (summary.last !== null) {
    const rawGap = timing.beforeTimestamp - summary.last.beforeTimestamp - summary.last.duration
    if (rawGap > summary.maximumBeforeGap) {
      summary.maximumBeforeGap = rawGap
      summary.beforeGapBefore = summary.last
      summary.beforeGapAfter = timing
    }
    const gap = timing.afterTimestamp - summary.last.afterTimestamp - summary.last.duration
    if (gap > summary.maximumAfterGap) {
      summary.maximumAfterGap = gap
      summary.gapBefore = summary.last
      summary.gapAfter = timing
    }
  }
  if (
    summary.nearestBeforeJump === null ||
    Math.abs(timing.afterTimestamp - before) <
      Math.abs(summary.nearestBeforeJump.afterTimestamp - before)
  )
    summary.nearestBeforeJump = timing
  if (
    summary.nearestAfterJump === null ||
    Math.abs(timing.afterTimestamp - after) <
      Math.abs(summary.nearestAfterJump.afterTimestamp - after)
  )
    summary.nearestAfterJump = timing
  summary.last = timing
  summary.end = Math.max(summary.end ?? -Infinity, timing.afterTimestamp + timing.duration)
}
function isSetTimestamp(value: unknown): value is (this: AudioSample, timestamp: number) => void {
  return typeof value === 'function'
}
interface ObservedDecoder {
  decoder: AudioDecoder
  timestamps: number[]
  closed: Promise<boolean>
  finish: () => void
}
function isDecode(value: unknown): value is (this: AudioDecoder, chunk: EncodedAudioChunk) => void {
  return typeof value === 'function'
}
function isClose(value: unknown): value is (this: AudioDecoder) => void {
  return typeof value === 'function'
}
function deltas(values: number[]) {
  return values.slice(1).map((value, index) => value - (values[index] ?? 0))
}
function rms(data: Float32Array, rate: number, start: number, end: number) {
  const values = data.subarray(Math.round(start * rate), Math.round(end * rate))
  if (values.length === 0) throw new Error('Synthetic AAC measurement interval is empty.')
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
}

/** Exercise the actual SDK import/native decoder, observing its public boundary without changing its clock. */
export async function readSdkAudio(buffer: ArrayBuffer, mode: ReadMode): Promise<SdkAudioReport> {
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS })
  const timestampDescriptor = Object.getOwnPropertyDescriptor(AudioSample.prototype, 'setTimestamp')
  const setTimestamp: unknown = timestampDescriptor?.value
  if (timestampDescriptor === undefined || !isSetTimestamp(setTimestamp))
    throw new Error('Synthetic SDK observer lost the public sample timestamp boundary.')
  const decodeDescriptor = Object.getOwnPropertyDescriptor(AudioDecoder.prototype, 'decode')
  const closeDescriptor = Object.getOwnPropertyDescriptor(AudioDecoder.prototype, 'close')
  const decode: unknown = decodeDescriptor?.value
  const close: unknown = closeDescriptor?.value
  if (
    decodeDescriptor === undefined ||
    closeDescriptor === undefined ||
    !isDecode(decode) ||
    !isClose(close)
  )
    throw new Error('Synthetic AAC observer lost the native decoder boundary.')
  const timestampSetterEvents = emptyTiming()
  const decodedSamples = emptyTiming()
  let beforeJump = 0
  let afterJump = 0
  const packetObservation: SdkTimingObservation['packets'] = {
    count: 0,
    first: null,
    last: null,
    maximumDelta: 0,
    beforeJump: null,
    afterJump: null,
  }
  Object.defineProperty(AudioSample.prototype, 'setTimestamp', {
    ...timestampDescriptor,
    value: function (this: AudioSample, timestamp: number) {
      const beforeTimestamp = this.timestamp
      setTimestamp.call(this, timestamp)
      retainTiming(
        timestampSetterEvents,
        {
          beforeTimestamp,
          afterTimestamp: this.timestamp,
          duration: this.duration,
          frames: this.numberOfFrames,
        },
        beforeJump,
        afterJump,
      )
    },
  })
  const records = new Map<AudioDecoder, ObservedDecoder>()
  Object.defineProperties(AudioDecoder.prototype, {
    decode: {
      ...decodeDescriptor,
      value: function (this: AudioDecoder, chunk: EncodedAudioChunk) {
        let record = records.get(this)
        if (record === undefined) {
          const completion = Promise.withResolvers<boolean>()
          record = {
            decoder: this,
            timestamps: [],
            closed: completion.promise,
            finish: () => completion.resolve(true),
          }
          records.set(this, record)
        }
        record.timestamps.push(chunk.timestamp / 1_000_000)
        if (mode === 'error') throw new Error('Synthetic SDK native decoder failure')
        decode.call(this, chunk)
      },
    },
    close: {
      ...closeDescriptor,
      value: function (this: AudioDecoder) {
        close.call(this)
        records.get(this)?.finish()
      },
    },
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (track === null || !(await track.canDecode()))
      throw new Error('Synthetic AAC input cannot decode.')
    const rate = await track.getSampleRate()
    const channels = await track.getNumberOfChannels()
    const original: number[] = []
    const packets = new EncodedPacketSink(track).packets()
    for await (const packet of packets) {
      original.push(packet.timestamp)
      const timing = { timestamp: packet.timestamp, duration: packet.duration }
      packetObservation.count += 1
      packetObservation.first ??= timing
      if (packetObservation.last !== null) {
        const delta = timing.timestamp - packetObservation.last.timestamp
        if (delta > packetObservation.maximumDelta) {
          packetObservation.maximumDelta = delta
          packetObservation.beforeJump = packetObservation.last
          packetObservation.afterJump = timing
        }
      }
      packetObservation.last = timing
    }
    beforeJump = packetObservation.beforeJump?.timestamp ?? 0
    afterJump = packetObservation.afterJump?.timestamp ?? 0
    const first = original[0]
    if (first === undefined) throw new Error('Synthetic AAC input has no packets.')
    const pcm = new Float32Array(Math.ceil((await input.computeDuration()) * rate))
    let decodedFirst: number | null = null
    let previousEnd: number | null = null
    let maximumGap = 0
    let error: string | null = null
    const samples = new AudioSampleSink(track).samples()
    try {
      for await (const sample of samples) {
        try {
          if (sample.sampleRate !== rate || sample.numberOfChannels !== channels)
            throw new Error('Synthetic AAC decoding changed its input format.')
          retainTiming(
            decodedSamples,
            {
              beforeTimestamp: sample.timestamp,
              afterTimestamp: sample.timestamp,
              duration: sample.duration,
              frames: sample.numberOfFrames,
            },
            beforeJump,
            afterJump,
          )
          decodedFirst ??= sample.timestamp
          if (previousEnd !== null)
            maximumGap = Math.max(maximumGap, sample.timestamp - previousEnd)
          previousEnd = sample.timestamp + sample.duration
          const offset = Math.round(sample.timestamp * rate)
          const begin = Math.max(0, offset)
          const end = Math.min(pcm.length, offset + sample.numberOfFrames)
          if (end > begin) {
            const plane = new Float32Array(sample.numberOfFrames)
            sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' })
            pcm.set(plane.subarray(begin - offset, end - offset), begin)
          }
          if (mode === 'cancel') break
        } finally {
          sample.close()
        }
      }
    } catch (error_: unknown) {
      if (mode !== 'error') throw error_
      error = error_ instanceof Error ? error_.message : String(error_)
    } finally {
      await samples.return()
      input.dispose()
      await Promise.all(records.values().map((record) => record.closed))
    }
    const native = records
      .values()
      .flatMap((record) => record.timestamps)
      .toArray()
    if (native.length === 0) throw new Error('Synthetic AAC did not reach the native SDK boundary.')
    let maximumNativeDelta = 0
    for (const delta of deltas(native)) maximumNativeDelta = Math.max(maximumNativeDelta, delta)
    return {
      rate,
      channels,
      originalFirst: first,
      decodedFirst,
      nativeFirst: native[0] ?? NaN,
      originalDeltas: deltas(original),
      nativeDeltas: deltas(native),
      maximumGap,
      activeRms: rms(pcm, rate, 0.2, 0.4),
      silentRms: rms(pcm, rate, 1.2, 1.3),
      hasClosed: records.values().every((record) => record.decoder.state === 'closed'),
      error,
      decodedFrames: decodedSamples.frames,
      gapRms: rms(pcm, rate, 2.2, 2.7),
      postGapRms: rms(pcm, rate, 3.2, 3.4),
      finalToneRms: pcm.length > rate * 4.4 ? rms(pcm, rate, 4.2, 4.4) : rms(pcm, rate, 3.6, 3.8),
      observation: {
        packets: packetObservation,
        nativeInput: {
          count: native.length,
          first: native[0] ?? null,
          last: native.at(-1) ?? null,
          maximumDelta: maximumNativeDelta,
        },
        timestampSetterEvents,
        decodedSamples,
        allocatedPcmFrames: pcm.length,
        maximumGap,
      },
    }
  } finally {
    input.dispose()
    Object.defineProperty(AudioSample.prototype, 'setTimestamp', timestampDescriptor)
    Object.defineProperties(AudioDecoder.prototype, {
      decode: decodeDescriptor,
      close: closeDescriptor,
    })
  }
}
