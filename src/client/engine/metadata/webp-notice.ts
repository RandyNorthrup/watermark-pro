/** Retain the sticker licence in a standard WebP XMP chunk without re-encoding pixels. */
import { escapeToBuffer } from 'hono/utils/html'

import { concat } from './segments'

const RIFF_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const FOURCC_BYTES = 4
const EXTENDED_HEADER_BYTES = 10
const XMP_FLAG = 0x04
const ALPHA_FLAG = 0x10
const LOSSLESS_ALPHA_BYTE = 4
const WIDTH_OFFSET = 4
const HEIGHT_OFFSET = 7
const UINT24_BYTES = 3
const BITS_PER_BYTE = 8
const MAX_UINT24 = 0xff_ff_ff
// RDF's fixed XML namespace is an identifier, not a network request (PLAN.md §9, XML namespaces).

const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface Chunk {
  type: string
  data: Uint8Array
}

function chunksOf(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length < RIFF_HEADER_BYTES ||
    decoder.decode(bytes.subarray(0, FOURCC_BYTES)) !== 'RIFF' ||
    decoder.decode(bytes.subarray(CHUNK_HEADER_BYTES, RIFF_HEADER_BYTES)) !== 'WEBP' ||
    view.getUint32(FOURCC_BYTES, true) + CHUNK_HEADER_BYTES !== bytes.length
  )
    throw new Error('Invalid encoded WebP container')
  const chunks: Chunk[] = []
  let offset = RIFF_HEADER_BYTES
  while (offset < bytes.length) {
    if (offset + CHUNK_HEADER_BYTES > bytes.length) throw new Error('Truncated WebP chunk')
    const size = view.getUint32(offset + FOURCC_BYTES, true)
    const start = offset + CHUNK_HEADER_BYTES
    const end = start + size
    if (end + (size % 2) > bytes.length) throw new Error('Truncated WebP payload')
    chunks.push({
      type: decoder.decode(bytes.subarray(offset, offset + FOURCC_BYTES)),
      data: bytes.slice(start, end),
    })
    offset = end + (size % 2)
  }
  return chunks
}

function buildChunk(chunk: Chunk): Uint8Array {
  const result = new Uint8Array(CHUNK_HEADER_BYTES + chunk.data.length + (chunk.data.length % 2))
  result.set(encoder.encode(chunk.type))
  new DataView(result.buffer).setUint32(FOURCC_BYTES, chunk.data.length, true)
  result.set(chunk.data, CHUNK_HEADER_BYTES)
  return result
}

function putDimension(bytes: Uint8Array, offset: number, dimension: number): void {
  if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > MAX_UINT24)
    throw new Error('Invalid WebP canvas size')
  for (let index = 0; index < UINT24_BYTES; index += 1)
    bytes[offset + index] = (dimension - 1) >>> (index * BITS_PER_BYTE)
}

/** Only sticker-specific rights are added; no Microsoft author/copyright tag describes the user's photo. */
export function webpWithArtworkNotice(
  bytes: Uint8Array,
  notice: string,
  size: { width: number; height: number },
): Uint8Array {
  const chunks = chunksOf(bytes)
  if (chunks.every((chunk) => !(chunk.type === 'VP8 ' || chunk.type === 'VP8L')))
    throw new Error('WebP has no image bitstream')
  const extended = chunks.find((chunk) => chunk.type === 'VP8X')
  const header = extended?.data ?? new Uint8Array(EXTENDED_HEADER_BYTES)
  if (header.length !== EXTENDED_HEADER_BYTES) throw new Error('Invalid extended WebP header')
  header[0] = (header[0] ?? 0) | XMP_FLAG
  if (extended === undefined) {
    const lossless = chunks.find((chunk) => chunk.type === 'VP8L')
    if (((lossless?.data[LOSSLESS_ALPHA_BYTE] ?? 0) & ALPHA_FLAG) !== 0) header[0] |= ALPHA_FLAG
    putDimension(header, WIDTH_OFFSET, size.width)
    putDimension(header, HEIGHT_OFFSET, size.height)
  }
  // Hono's established escaper emits only the five basic XML entities
  // (apostrophes use a numeric reference), so its output is valid XML text.
  const buffer: [string] = ['']
  escapeToBuffer(notice, buffer)
  const [escaped] = buffer
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${RDF_NAMESPACE}"><rdf:Description rdf:about="" xmlns:lumafoil="https://lumafoil.com/ns/assets/1.0/"><lumafoil:ArtworkLicense>${escaped}</lumafoil:ArtworkLicense></rdf:Description></rdf:RDF></x:xmpmeta>`
  const payload = concat([
    buildChunk({ type: 'VP8X', data: header }),
    ...chunks
      .filter((chunk) => chunk.type !== 'VP8X' && chunk.type !== 'XMP ')
      .map((chunk) => buildChunk(chunk)),
    buildChunk({ type: 'XMP ', data: encoder.encode(xmp) }),
  ])
  const riff = new Uint8Array(RIFF_HEADER_BYTES)
  riff.set(encoder.encode('RIFF'))
  new DataView(riff.buffer).setUint32(FOURCC_BYTES, payload.length + FOURCC_BYTES, true)
  riff.set(encoder.encode('WEBP'), CHUNK_HEADER_BYTES)
  return concat([riff, payload])
}
