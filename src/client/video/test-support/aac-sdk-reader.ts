import { ALL_FORMATS, AudioSampleSink, BufferSource, EncodedPacketSink, Input } from 'mediabunny'

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
  nativeFrames: number
  decodedFrames: number
  gapRms: number
  postGapRms: number
  finalToneRms: number
  activeRms: number
  silentRms: number
  hasClosed: boolean
  error: string | null
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
function isInit(value: unknown): value is AudioDecoderInit {
  return (
    typeof value === 'object' &&
    value !== null &&
    'output' in value &&
    typeof value.output === 'function' &&
    'error' in value &&
    typeof value.error === 'function'
  )
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
  const NativeDecoder = AudioDecoder
  const constructorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioDecoder')
  if (constructorDescriptor === undefined)
    throw new Error('Synthetic AAC observer lost the native decoder constructor.')
  let nativeFrames = 0
  const observedConstructor = new Proxy(NativeDecoder, {
    construct(target, args: unknown[]) {
      const init = args[0]
      if (!isInit(init)) throw new Error('Synthetic AAC observer lost the native decoder init.')
      return Reflect.construct(target, [
        {
          ...init,
          output: (data: AudioData) => {
            nativeFrames += data.numberOfFrames
            init.output(data)
          },
        },
      ])
    },
  })
  Object.defineProperty(globalThis, 'AudioDecoder', {
    ...constructorDescriptor,
    value: observedConstructor,
  })
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS })
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
    for await (const packet of packets) original.push(packet.timestamp)
    const first = original[0]
    if (first === undefined) throw new Error('Synthetic AAC input has no packets.')
    const pcm = new Float32Array(Math.ceil((await input.computeDuration()) * rate))
    let decodedFirst: number | null = null
    let previousEnd: number | null = null
    let maximumGap = 0
    let decodedFrames = 0
    let error: string | null = null
    const samples = new AudioSampleSink(track).samples()
    try {
      for await (const sample of samples) {
        try {
          if (sample.sampleRate !== rate || sample.numberOfChannels !== channels)
            throw new Error('Synthetic AAC decoding changed its input format.')
          decodedFirst ??= sample.timestamp
          decodedFrames += sample.numberOfFrames
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
    return {
      rate,
      channels,
      originalFirst: first,
      decodedFirst,
      nativeFirst: native[0] ?? NaN,
      originalDeltas: deltas(original),
      nativeDeltas: deltas(native),
      maximumGap,
      nativeFrames,
      decodedFrames,
      gapRms: rms(pcm, rate, 2.2, 2.4),
      postGapRms: rms(pcm, rate, 3.2, 3.4),
      finalToneRms: pcm.length > rate * 4.4 ? rms(pcm, rate, 4.2, 4.4) : rms(pcm, rate, 3.6, 3.8),
      activeRms: rms(pcm, rate, 0.2, 0.4),
      silentRms: rms(pcm, rate, 1.2, 1.3),
      hasClosed: records.values().every((record) => record.decoder.state === 'closed'),
      error,
    }
  } finally {
    input.dispose()
    Object.defineProperties(AudioDecoder.prototype, {
      decode: decodeDescriptor,
      close: closeDescriptor,
    })
    Object.defineProperty(globalThis, 'AudioDecoder', constructorDescriptor)
  }
}
