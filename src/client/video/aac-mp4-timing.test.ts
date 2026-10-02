import { describe, expect, it } from 'vitest'

import { finalizeAacMp4 } from './aac-mp4-timing'
import type { AacTiming } from './aac-source'

const timing: AacTiming = {
  primingFrames: 6208,
  durationFrames: 192_000,
  sampleRate: 48_000,
  packets: 194,
}
const encode = new TextEncoder()
function box(type: string, ...payload: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(8 + payload.reduce((size, item) => size + item.length, 0))
  new DataView(result.buffer).setUint32(0, result.length)
  result.set(encode.encode(type), 4)
  let offset = 8
  for (const item of payload) {
    result.set(item, offset)
    offset += item.length
  }
  return result
}
function fields(type: string, size: number, values: Record<number, number | string>) {
  const result = box(type, new Uint8Array(size - 8))
  const view = new DataView(result.buffer)
  for (const [key, value] of Object.entries(values)) {
    const offset = Number(key)
    if (typeof value === 'string') result.set(encode.encode(value), offset)
    else view.setUint32(offset, value)
  }
  return result
}
function fixture(
  options: {
    sampleRate?: number
    packetCount?: number
    timescale?: number
    version?: number
    extraTrack?: Uint8Array
    extraTable?: Uint8Array
    movieFirst?: boolean
    duplicateAudio?: boolean
    videoDuration?: number
    shortHeader?: boolean
  } = {},
): ArrayBuffer {
  const header = fields(
    'mvhd',
    options.shortHeader === true ? 24 : 28,
    options.shortHeader === true ? { 20: 1000 } : { 20: options.timescale ?? 1000, 24: 4129 },
  )
  header[8] = options.version ?? 0
  const table = box(
    'stbl',
    fields('stsz', 20, { 16: options.packetCount ?? 194 }),
    ...(options.extraTable === undefined ? [] : [options.extraTable]),
  )
  function track(handler: string, duration: number) {
    return box(
      'trak',
      fields('tkhd', 32, { 28: duration }),
      box(
        'mdia',
        fields('mdhd', 28, { 20: options.sampleRate ?? 48_000 }),
        fields('hdlr', 24, { 16: handler }),
        box('minf', table),
      ),
      ...(options.extraTrack === undefined ? [] : [options.extraTrack]),
    )
  }
  const audio = track('soun', 4129)
  const movie = box(
    'moov',
    header,
    audio,
    ...(options.duplicateAudio === true ? [audio] : []),
    track('vide', options.videoDuration ?? 4000),
  )
  const media = box('mdat', new Uint8Array([11, 22, 33, 44]))
  const parts = options.movieFirst === true ? [movie, media] : [media, movie]
  const result = new Uint8Array(parts.reduce((size, item) => size + item.length, 0))
  let offset = 0
  for (const item of parts) {
    result.set(item, offset)
    offset += item.length
  }
  return result.buffer
}

describe('bounded AAC container timing', () => {
  it('preserves media bytes and writes the requested timing, preroll and sample mapping', async () => {
    const original = fixture()
    const blob = finalizeAacMp4(original, timing)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(blob.type).toBe('video/mp4')
    expect(bytes.length).toBe(original.byteLength + 90)
    expect([...bytes.subarray(0, 12)]).toEqual([...new Uint8Array(original).subarray(0, 12)])
    const text = new TextDecoder('latin1').decode(bytes)
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(text.indexOf('mvhd') - 4 + 24)).toBe(4000)
    const edit = text.indexOf('elst') - 4
    expect(view.getUint32(edit + 16)).toBe(4000)
    expect(view.getInt32(edit + 20)).toBe(6208)
    expect(view.getUint16(edit + 24)).toBe(1)
    const description = text.indexOf('sgpd') - 4
    expect(view.getUint8(description + 8)).toBe(1)
    expect(view.getInt16(description + 24)).toBe(-1)
    const mapping = text.indexOf('sbgp') - 4
    expect(view.getUint32(mapping + 20)).toBe(194)
    expect(view.getUint32(mapping + 24)).toBe(1)
  })
  it.each([
    [{ sampleRate: 44_100 }, 'timescale'],
    [{ packetCount: 193 }, 'packet count'],
    [{ timescale: 0 }, 'timescale'],
    [{ version: 1 }, 'version'],
    [{ extraTrack: box('edts') }, 'edit list'],
    [{ extraTable: box('sgpd') }, 'sample groups'],
    [{ movieFirst: true }, 'media before'],
    [{ duplicateAudio: true }, 'one MP4 trak'],
    [{ videoDuration: 4500 }, 'truncate'],
    [{ shortHeader: true }, 'timing field'],
  ] as const)('refuses malformed or incompatible timing %j', (options, message) => {
    const buffer = fixture(options)
    const before = new Uint8Array(buffer).slice()
    expect(() => finalizeAacMp4(buffer, timing)).toThrow(message)
    expect(new Uint8Array(buffer)).toEqual(before)
  })
  it.each([
    { sampleRate: 44_100 },
    { primingFrames: 0 },
    { primingFrames: 12_289 },
    { primingFrames: 6208.5 },
    { durationFrames: 0 },
    { durationFrames: 28_800_001 },
    { durationFrames: 1.5 },
    { packets: 0 },
    { packets: NaN },
  ])('refuses invalid measured proof %j', (invalid) => {
    expect(() => finalizeAacMp4(fixture(), { ...timing, ...invalid })).toThrow('configuration')
  })
  it.each([new Uint8Array(7), new Uint8Array(8), new Uint8Array([0, 0, 0, 9, 109, 100, 97, 116])])(
    'refuses a truncated or invalid box',
    (bytes) => {
      expect(() => finalizeAacMp4(Uint8Array.from(bytes).buffer, timing)).toThrow(/box/)
    },
  )
})
