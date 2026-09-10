/** Embed required artwork notices after the user's personal-metadata policy has been applied. */
import { buildPngChunk, concat, jpegSegments, pngChunks } from './segments'
import { webpWithArtworkNotice } from './webp-notice'
import type { OutputFormat } from '../encode'

const JPEG_COMMENT = 0xff_fe
const JPEG_SCAN = 0xff_da
const JPEG_HEADER_BYTES = 4
const JPEG_LENGTH_BYTES = 2
const PNG_NOTICE_KEYWORD = 'Lumafoil artwork licences'

function jpegWithNotice(bytes: Uint8Array, notice: Uint8Array): Uint8Array {
  const scan = jpegSegments(bytes).find((segment) => segment.marker === JPEG_SCAN)
  if (scan === undefined) throw new Error('Encoded JPEG has no image scan')
  const comment = new Uint8Array(JPEG_HEADER_BYTES + notice.length)
  const view = new DataView(comment.buffer)
  view.setUint16(0, JPEG_COMMENT)
  view.setUint16(JPEG_LENGTH_BYTES, notice.length + JPEG_LENGTH_BYTES)
  comment.set(notice, JPEG_HEADER_BYTES)
  return concat([bytes.slice(0, scan.start), comment, bytes.slice(scan.start)])
}

function pngWithNotice(bytes: Uint8Array, notice: string): Uint8Array {
  const end = pngChunks(bytes).find((chunk) => chunk.type === 'IEND')
  if (end === undefined) throw new Error('Encoded PNG has no end chunk')
  const data = new TextEncoder().encode(`${PNG_NOTICE_KEYWORD}\0\0\0\0\0${notice}`)
  return concat([bytes.slice(0, end.start), buildPngChunk('iTXt', data), bytes.slice(end.start)])
}

/** Returns an unchanged blob when no included artwork needs a notice. */
export async function withAssetNotice(
  blob: Blob,
  format: OutputFormat,
  notice: string | null,
  size: { width: number; height: number },
): Promise<Blob> {
  if (notice === null) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let result: Uint8Array
  switch (format) {
    case 'image/jpeg': {
      result = jpegWithNotice(bytes, new TextEncoder().encode(notice))
      break
    }
    case 'image/png': {
      result = pngWithNotice(bytes, notice)
      break
    }
    case 'image/webp': {
      result = webpWithArtworkNotice(bytes, notice, size)
      break
    }
  }
  return new Blob([result] as BlobPart[], { type: format })
}
