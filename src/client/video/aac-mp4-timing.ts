import type { AacTiming } from './aac-source'
import {
  AAC_TIMING_POLICY,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  VIDEO_PROJECT_LIMITS,
} from '../../shared/constants'

// ISO BMFF version-zero field offsets are format values, not product tunables.
const MP4 = {
  header: 8,
  type: 4,
  fullVersion: 8,
  movieTimescale: 20,
  movieDuration: 24,
  trackDuration: 28,
  handlerType: 16,
  sampleCount: 16,
  editBytes: 36,
  editListBytes: 28,
  editEntries: 20,
  editDuration: 24,
  editMediaTime: 28,
  editRate: 32,
  groupBytes: 54,
  descriptionBytes: 26,
  groupVersion: 8,
  groupType: 12,
  groupLength: 16,
  groupEntries: 20,
  rollDistance: 24,
  mappingBytes: 28,
  mappingType: 38,
  mappingEntries: 42,
  mappingSamples: 46,
  mappingIndex: 50,
} as const

interface Box {
  start: number
  end: number
  size: number
  type: string
}

/** Preserve codec preroll and express the intended timeline without moving media chunk offsets. */
export function finalizeAacMp4(buffer: ArrayBuffer, timing: AacTiming): Blob {
  if (
    buffer.byteLength > MAX_VIDEO_BYTES ||
    timing.sampleRate !== VIDEO_PROJECT_LIMITS.sampleRate ||
    !Number.isSafeInteger(timing.primingFrames) ||
    timing.primingFrames < AAC_TIMING_POLICY.leadFrames ||
    timing.primingFrames > AAC_TIMING_POLICY.leadFrames + AAC_TIMING_POLICY.maximumDelayFrames ||
    !Number.isSafeInteger(timing.durationFrames) ||
    timing.durationFrames <= 0 ||
    timing.durationFrames > MAX_VIDEO_SECONDS * timing.sampleRate ||
    !Number.isSafeInteger(timing.packets) ||
    timing.packets <= 0
  )
    throw new Error('AAC timing exceeds the bounded project configuration.')
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decode = new TextDecoder()
  const encode = new TextEncoder()
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = []
    for (let position = start; position < end;) {
      if (end - position < MP4.header) throw new Error('Incomplete MP4 box header.')
      const size = view.getUint32(position)
      if (size < MP4.header || position + size > end)
        throw new Error('Invalid bounded MP4 box size.')
      result.push({
        start: position,
        end: position + size,
        size,
        type: decode.decode(bytes.subarray(position + MP4.type, position + MP4.header)),
      })
      position += size
    }
    return result
  }
  function children(parent: Box) {
    return boxes(parent.start + MP4.header, parent.end)
  }
  function one(items: Box[], type: string): Box {
    const selected = items.filter((item) => item.type === type)
    const [box] = selected
    if (box === undefined || selected.length !== 1) throw new Error(`Expected one MP4 ${type} box.`)
    return box
  }
  function field(box: Box, offset: number): number {
    if (box.start + offset + MP4.type > box.end) throw new Error('Incomplete MP4 timing field.')
    return view.getUint32(box.start + offset)
  }
  function versionZero(box: Box) {
    if (box.start + MP4.fullVersion >= box.end || view.getUint8(box.start + MP4.fullVersion) !== 0)
      throw new Error('Unsupported MP4 timing version.')
  }
  const top = boxes(0, buffer.byteLength)
  const movie = one(top, 'moov')
  if (one(top, 'mdat').end > movie.start)
    throw new Error('AAC timing requires media before movie metadata.')
  const movieChildren = children(movie)
  const header = one(movieChildren, 'mvhd')
  versionZero(header)
  const scale = field(header, MP4.movieTimescale)
  field(header, MP4.movieDuration)
  if (scale === 0) throw new Error('MP4 movie timescale is invalid.')
  const duration = Math.round((timing.durationFrames / timing.sampleRate) * scale)
  const tracks = movieChildren.filter((box) => box.type === 'trak')
  const audioTracks = tracks.filter((track) => {
    const media = one(children(track), 'mdia')
    const handler = one(children(media), 'hdlr')
    field(handler, MP4.handlerType)
    return (
      decode.decode(
        bytes.subarray(handler.start + MP4.handlerType, handler.start + MP4.handlerType + MP4.type),
      ) === 'soun'
    )
  })
  const track = one(audioTracks, 'trak')
  const trackChildren = children(track)
  if (trackChildren.some((box) => box.type === 'edts'))
    throw new Error('AAC track already has an edit list.')
  const trackHeader = one(trackChildren, 'tkhd')
  versionZero(trackHeader)
  field(trackHeader, MP4.trackDuration)
  const media = one(trackChildren, 'mdia')
  const mediaChildren = children(media)
  const mediaHeader = one(mediaChildren, 'mdhd')
  versionZero(mediaHeader)
  if (field(mediaHeader, MP4.movieTimescale) !== timing.sampleRate)
    throw new Error('AAC media timescale does not match its encoder.')
  const mediaInfo = one(mediaChildren, 'minf')
  const table = one(children(mediaInfo), 'stbl')
  const tableChildren = children(table)
  if (tableChildren.some((box) => box.type === 'sgpd' || box.type === 'sbgp'))
    throw new Error('AAC track already has sample groups.')
  if (field(one(tableChildren, 'stsz'), MP4.sampleCount) !== timing.packets)
    throw new Error('AAC packet count does not match the sample table.')
  for (const videoTrack of tracks) {
    if (videoTrack === track) continue
    const videoHeader = one(children(videoTrack), 'tkhd')
    versionZero(videoHeader)
    if (field(videoHeader, MP4.trackDuration) > duration + 1)
      throw new Error('AAC timing would truncate another output track.')
  }

  const edit = new Uint8Array(MP4.editBytes)
  const editView = new DataView(edit.buffer)
  editView.setUint32(0, MP4.editBytes)
  edit.set(encode.encode('edts'), MP4.type)
  editView.setUint32(MP4.header, MP4.editListBytes)
  edit.set(encode.encode('elst'), MP4.header + MP4.type)
  editView.setUint32(MP4.editEntries, 1)
  editView.setUint32(MP4.editDuration, duration)
  editView.setInt32(MP4.editMediaTime, timing.primingFrames)
  editView.setUint16(MP4.editRate, 1)

  const groups = new Uint8Array(MP4.groupBytes)
  const groupView = new DataView(groups.buffer)
  groupView.setUint32(0, MP4.descriptionBytes)
  groups.set(encode.encode('sgpd'), MP4.type)
  groups[MP4.groupVersion] = 1
  groups.set(encode.encode('roll'), MP4.groupType)
  groupView.setUint32(MP4.groupLength, 2)
  groupView.setUint32(MP4.groupEntries, 1)
  groupView.setInt16(MP4.rollDistance, -1)
  groupView.setUint32(MP4.descriptionBytes, MP4.mappingBytes)
  groups.set(encode.encode('sbgp'), MP4.descriptionBytes + MP4.type)
  groups.set(encode.encode('roll'), MP4.mappingType)
  groupView.setUint32(MP4.mappingEntries, 1)
  groupView.setUint32(MP4.mappingSamples, timing.packets)
  groupView.setUint32(MP4.mappingIndex, 1)

  view.setUint32(header.start + MP4.movieDuration, duration)
  view.setUint32(trackHeader.start + MP4.trackDuration, duration)
  for (const parent of [movie, track])
    view.setUint32(parent.start, parent.size + MP4.editBytes + MP4.groupBytes)
  for (const parent of [media, mediaInfo, table])
    view.setUint32(parent.start, parent.size + MP4.groupBytes)
  return new Blob(
    [
      bytes.subarray(0, table.end),
      groups,
      bytes.subarray(table.end, track.end),
      edit,
      bytes.subarray(track.end),
    ],
    { type: 'video/mp4' },
  )
}
