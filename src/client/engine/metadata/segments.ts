/**
 * JPEG segment and PNG chunk surgery for the export metadata policy. Pure byte
 * code: it locates the Exif, XMP and density payloads in a source file and
 * splices them into (or strips them from) an encoded output. Field parsing of
 * the TIFF block lives in `exif-edit.ts`; this module only moves whole
 * segments and reads the container-level density (JFIF APP0, PNG pHYs).
 *
 * Every offset is bounds-checked; a malformed input yields empty results
 * rather than throwing, so untrusted photos can never crash a batch.
 */
import { crc32 } from './crc32'
import { readDensity } from './exif-edit'
import type { PrintDensity } from '../../../shared/metadata'

const MARKER_BYTE = 0xff
const SOI = 0xff_d8
const EOI = 0xff_d9
const SOS = 0xff_da
const APP0 = 0xff_e0
const APP1 = 0xff_e1
const RST_FIRST = 0xff_d0
const RST_LAST = 0xff_d7
const TEM = 0xff_01
/** marker (2 bytes) + the 2-byte length field that follows a non-standalone marker. */
const SEGMENT_HEADER = 4
const LENGTH_FIELD = 2

const JFIF_ID = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00]) // "JFIF\0"
const EXIF_ID = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]) // "Exif\0\0"
// The XMP APP1 identifier is literally this http URI (an XML namespace, not a
// fetched URL), fixed by the Adobe XMP spec. See PLAN.md §9.
// eslint-disable-next-line unicorn/prefer-https
const XMP_ID = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0')
const JFIF_VERSION_BYTES = 2
const JFIF_UNITS_INCH = 1
const JFIF_UNITS_CM = 2

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_LENGTH_FIELD = 4
const PNG_TYPE_FIELD = 4
const PNG_CRC_FIELD = 4
const PNG_CHUNK_HEADER = PNG_LENGTH_FIELD + PNG_TYPE_FIELD
const PHYS_UNIT_METRE = 1
const METRES_PER_INCH = 0.0254
const CENTIMETRES_PER_METRE = 100
const XMP_KEYWORD = 'XML:com.adobe.xmp'

/** Raw metadata payloads pulled from a source file, before any editing. */
export interface RawMetadata {
  /** TIFF payload: the APP1 body after "Exif\0\0", or the PNG eXIf chunk data. */
  exif: Uint8Array | null
  /** XMP packet bytes. */
  xmp: Uint8Array | null
  density: PrintDensity | null
}

const EMPTY: RawMetadata = { exif: null, xmp: null, density: null }

export interface JpegSegment {
  marker: number
  /** Offset of the 0xFF marker byte. */
  start: number
  /** Total bytes of the segment (header + data), 2 for a standalone marker. */
  length: number
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function hasBytesAt(bytes: Uint8Array, offset: number, id: Uint8Array): boolean {
  return (
    offset + id.length <= bytes.length && id.every((byte, index) => bytes[offset + index] === byte)
  )
}

function isStandalone(marker: number): boolean {
  return (
    marker === SOI ||
    marker === EOI ||
    marker === TEM ||
    (marker >= RST_FIRST && marker <= RST_LAST)
  )
}

/** Every marker segment from SOI up to (and including) SOS; [] for a non-JPEG. */
export function jpegSegments(bytes: Uint8Array): JpegSegment[] {
  if (
    bytes.length < LENGTH_FIELD ||
    ((MARKER_BYTE << 8) | (bytes[1] ?? 0)) !== SOI ||
    bytes[0] !== MARKER_BYTE
  ) {
    return []
  }
  const data = view(bytes)
  const segments: JpegSegment[] = []
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== MARKER_BYTE) {
      break
    }
    // Skip any 0xFF fill bytes before the marker code.
    let code = bytes[offset + 1] ?? 0
    while (code === MARKER_BYTE && offset + 2 < bytes.length) {
      offset += 1
      code = bytes[offset + 1] ?? 0
    }
    const marker = (MARKER_BYTE << 8) | code
    if (marker === SOS || marker === EOI) {
      segments.push({ marker, start: offset, length: LENGTH_FIELD })
      break
    }
    if (isStandalone(marker)) {
      segments.push({ marker, start: offset, length: LENGTH_FIELD })
      offset += LENGTH_FIELD
      continue
    }
    if (offset + SEGMENT_HEADER > bytes.length) {
      break
    }
    const dataLength = data.getUint16(offset + LENGTH_FIELD, false)
    const length = LENGTH_FIELD + dataLength
    if (length < SEGMENT_HEADER || offset + length > bytes.length) {
      break
    }
    segments.push({ marker, start: offset, length })
    offset += length
  }
  return segments
}

/** Density from a JFIF APP0 segment body (which starts at "JFIF\0"). */
function jfifDensity(bytes: Uint8Array, idStart: number, end: number): PrintDensity | null {
  const unitsOffset = idStart + JFIF_ID.length + JFIF_VERSION_BYTES
  if (unitsOffset + 5 > end) {
    return null
  }
  const data = view(bytes)
  const units = data.getUint8(unitsOffset)
  const x = data.getUint16(unitsOffset + 1, false)
  const y = data.getUint16(unitsOffset + 3, false)
  if (units === JFIF_UNITS_INCH) {
    return { x, y, unit: 'inch' }
  }
  if (units === JFIF_UNITS_CM) {
    return { x, y, unit: 'cm' }
  }
  return null
}

/** Exif, XMP and density from a JPEG; nulls where a payload is absent. */
export function extractJpegMetadata(bytes: Uint8Array): RawMetadata {
  const segments = jpegSegments(bytes)
  if (segments.length === 0) {
    return EMPTY
  }
  let exif: Uint8Array | null = null
  let xmp: Uint8Array | null = null
  let density: PrintDensity | null = null
  for (const segment of segments) {
    const dataStart = segment.start + SEGMENT_HEADER
    const dataEnd = segment.start + segment.length
    if (segment.marker === APP0 && hasBytesAt(bytes, dataStart, JFIF_ID)) {
      density = jfifDensity(bytes, dataStart, dataEnd)
    } else if (segment.marker === APP1 && hasBytesAt(bytes, dataStart, EXIF_ID)) {
      exif = bytes.slice(dataStart + EXIF_ID.length, dataEnd)
    } else if (segment.marker === APP1 && hasBytesAt(bytes, dataStart, XMP_ID)) {
      xmp = bytes.slice(dataStart + XMP_ID.length, dataEnd)
    }
  }
  if (density === null && exif !== null) {
    density = readDensity(exif)
  }
  return { exif, xmp, density }
}

/**
 * Inserts APP segments straight after SOI, dropping any APP0/APP1 the encoder
 * wrote so nothing is duplicated. The caller passes complete segments in the
 * order JFIF requires: APP0 first, then APP1 Exif, then APP1 XMP.
 */
export function insertJpegSegments(jpeg: Uint8Array, segments: Uint8Array[]): Uint8Array {
  let bodyStart = 2
  for (const segment of jpegSegments(jpeg)) {
    if (segment.marker === APP0 || segment.marker === APP1) {
      bodyStart = segment.start + segment.length
    } else {
      break
    }
  }
  return concat([jpeg.slice(0, 2), ...segments, jpeg.slice(bodyStart)])
}

/** Builds a complete APP1 segment (marker, length, identifier, payload). */
export function app1Segment(identifier: Uint8Array, payload: Uint8Array): Uint8Array {
  const bodyLength = LENGTH_FIELD + identifier.length + payload.length
  const segment = new Uint8Array(LENGTH_FIELD + bodyLength)
  const data = view(segment)
  data.setUint16(0, APP1, false)
  data.setUint16(LENGTH_FIELD, bodyLength, false)
  segment.set(identifier, SEGMENT_HEADER)
  segment.set(payload, SEGMENT_HEADER + identifier.length)
  return segment
}

/** Builds a JFIF APP0 segment carrying only the density (no thumbnail). */
export function jfifSegment(density: PrintDensity): Uint8Array {
  const THUMBNAIL_FIELDS = 2
  const bodyLength =
    LENGTH_FIELD + JFIF_ID.length + JFIF_VERSION_BYTES + 1 + 2 + 2 + THUMBNAIL_FIELDS
  const segment = new Uint8Array(LENGTH_FIELD + bodyLength)
  const data = view(segment)
  data.setUint16(0, APP0, false)
  data.setUint16(LENGTH_FIELD, bodyLength, false)
  segment.set(JFIF_ID, SEGMENT_HEADER)
  let offset = SEGMENT_HEADER + JFIF_ID.length
  data.setUint8(offset, 1) // JFIF major version 1
  data.setUint8(offset + 1, 2) // minor version 2
  offset += JFIF_VERSION_BYTES
  data.setUint8(offset, density.unit === 'cm' ? JFIF_UNITS_CM : JFIF_UNITS_INCH)
  data.setUint16(offset + 1, density.x, false)
  data.setUint16(offset + 3, density.y, false)
  // Thumbnail width and height both zero (no embedded thumbnail).
  return segment
}

export const EXIF_IDENTIFIER = EXIF_ID
export const XMP_IDENTIFIER = XMP_ID

interface PngChunk {
  type: string
  start: number
  dataStart: number
  dataLength: number
}

/** One chunk to write into a PNG; the CRC is computed for you. */
export interface PngChunkInput {
  type: string
  data: Uint8Array
}

function isPng(bytes: Uint8Array): boolean {
  return hasBytesAt(bytes, 0, PNG_SIGNATURE)
}

/** Every chunk after the signature; [] for a non-PNG. */
export function pngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) {
    return []
  }
  const data = view(bytes)
  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length
  const decoder = new TextDecoder('latin1')
  while (offset + PNG_CHUNK_HEADER <= bytes.length) {
    const dataLength = data.getUint32(offset, false)
    const dataStart = offset + PNG_CHUNK_HEADER
    const next = dataStart + dataLength + PNG_CRC_FIELD
    if (next > bytes.length) {
      break
    }
    const type = decoder.decode(bytes.subarray(offset + PNG_LENGTH_FIELD, dataStart))
    chunks.push({ type, start: offset, dataStart, dataLength })
    offset = next
  }
  return chunks
}

/** pHYs density; pixels-per-metre is converted back to an inch/cm figure. */
function physDensity(bytes: Uint8Array, chunk: PngChunk): PrintDensity | null {
  const data = view(bytes)
  const x = data.getUint32(chunk.dataStart, false)
  const y = data.getUint32(chunk.dataStart + 4, false)
  const unit = data.getUint8(chunk.dataStart + 8)
  if (unit !== PHYS_UNIT_METRE) {
    return null
  }
  return { x: Math.round(x * METRES_PER_INCH), y: Math.round(y * METRES_PER_INCH), unit: 'inch' }
}

/** The text of an iTXt chunk whose keyword is the Adobe XMP marker. */
function itxtXmp(bytes: Uint8Array, chunk: PngChunk): Uint8Array | null {
  const keywordBytes = new TextEncoder().encode(XMP_KEYWORD)
  if (!hasBytesAt(bytes, chunk.dataStart, keywordBytes)) {
    return null
  }
  // keyword\0 compressionFlag(1) compressionMethod(1) languageTag\0 translatedKeyword\0 text
  let cursor = chunk.dataStart + keywordBytes.length + 1 + 2
  const chunkEnd = chunk.dataStart + chunk.dataLength
  let nulls = 0
  while (cursor < chunkEnd && nulls < 2) {
    if (bytes[cursor] === 0) {
      nulls += 1
    }
    cursor += 1
  }
  return cursor <= chunkEnd ? bytes.slice(cursor, chunkEnd) : null
}

/** The metadata one PNG chunk contributes; empty keys for chunks we ignore. */
function pngChunkMetadata(bytes: Uint8Array, chunk: PngChunk): Partial<RawMetadata> {
  switch (chunk.type) {
    case 'eXIf': {
      return { exif: bytes.slice(chunk.dataStart, chunk.dataStart + chunk.dataLength) }
    }
    case 'iTXt': {
      const xmp = itxtXmp(bytes, chunk)
      return xmp === null ? {} : { xmp }
    }
    case 'pHYs': {
      return { density: physDensity(bytes, chunk) }
    }
    default: {
      return {}
    }
  }
}

/** Exif, XMP and density from a PNG; nulls where a chunk is absent. */
export function extractPngMetadata(bytes: Uint8Array): RawMetadata {
  const chunks = pngChunks(bytes)
  if (chunks.length === 0) {
    return EMPTY
  }
  const found: RawMetadata = { exif: null, xmp: null, density: null }
  for (const chunk of chunks) {
    Object.assign(found, pngChunkMetadata(bytes, chunk))
  }
  if (found.density === null && found.exif !== null) {
    found.density = readDensity(found.exif)
  }
  return found
}

export function buildPngChunk(type: string, chunkData: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(PNG_CHUNK_HEADER + chunkData.length + PNG_CRC_FIELD)
  const data = view(out)
  data.setUint32(0, chunkData.length, false)
  out.set(typeBytes, PNG_LENGTH_FIELD)
  out.set(chunkData, PNG_CHUNK_HEADER)
  const crcInput = new Uint8Array(typeBytes.length + chunkData.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(chunkData, typeBytes.length)
  data.setUint32(PNG_CHUNK_HEADER + chunkData.length, crc32(crcInput), false)
  return out
}

/** An `iTXt` chunk body carrying an uncompressed XMP packet. */
export function xmpItxtData(xmp: Uint8Array): Uint8Array {
  const keyword = new TextEncoder().encode(XMP_KEYWORD)
  // keyword\0, compressionFlag 0, compressionMethod 0, languageTag\0, translatedKeyword\0
  const header = new Uint8Array(keyword.length + 1 + 2 + 1 + 1)
  header.set(keyword, 0)
  return concat([header, xmp])
}

/** A `pHYs` chunk body from a density (converted to pixels per metre). */
export function physChunkData(density: PrintDensity): Uint8Array {
  const perMetre = (value: number): number =>
    density.unit === 'cm'
      ? Math.round(value * CENTIMETRES_PER_METRE)
      : Math.round(value / METRES_PER_INCH)
  const data = new Uint8Array(9)
  const dataView = view(data)
  dataView.setUint32(0, perMetre(density.x), false)
  dataView.setUint32(4, perMetre(density.y), false)
  dataView.setUint8(8, PHYS_UNIT_METRE)
  return data
}

/**
 * Inserts chunks straight after IHDR, dropping any existing eXIf, XMP iTXt and
 * pHYs so nothing is duplicated. CRCs are recomputed here.
 */
export function insertPngChunks(png: Uint8Array, chunks: PngChunkInput[]): Uint8Array {
  const existing = pngChunks(png)
  const ihdr = existing.find((chunk) => chunk.type === 'IHDR')
  if (ihdr === undefined) {
    return png
  }
  const insertAt = ihdr.dataStart + ihdr.dataLength + PNG_CRC_FIELD
  const dropped = new Set(['eXIf', 'iTXt', 'pHYs'])
  const head = png.slice(0, insertAt)
  const tailParts: Uint8Array[] = []
  for (const chunk of existing) {
    const chunkEnd = chunk.dataStart + chunk.dataLength + PNG_CRC_FIELD
    if (chunk.start >= insertAt && !dropped.has(chunk.type)) {
      tailParts.push(png.slice(chunk.start, chunkEnd))
    }
  }
  const built = chunks.map((chunk) => buildPngChunk(chunk.type, chunk.data))
  return concat([head, ...built, ...tailParts])
}

/** Concatenates byte arrays into one. */
export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
