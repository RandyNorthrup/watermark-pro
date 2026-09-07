/**
 * Writes the chosen metadata into an encoded image, after `encodeCanvas`. A
 * no-op for `strip` except that print density is always preserved (it is not
 * personal). In keep modes the source Exif is copied, its Orientation reset to
 * 1 (the pixels are already upright) and its pixel-dimension tags rewritten to
 * the output size, GPS removed for keep-except-location; nothing is added to
 * the block. WebP cannot carry metadata, so its keep modes throw (the UI never
 * offers them). Runs in the worker: Blob → bytes → patch → Blob.
 */
import { setOrientation, setPixelDimensions, removeLocation } from './exif-edit'
import {
  app1Segment,
  EXIF_IDENTIFIER,
  insertJpegSegments,
  insertPngChunks,
  jfifSegment,
  physChunkData,
  type PngChunkInput,
  type RawMetadata,
  XMP_IDENTIFIER,
  xmpItxtData,
} from './segments'
import type { MetadataPolicy, OutputFormat } from '../encode'

/** Orientation value for an upright image. */
const UPRIGHT = 1

interface OutputSize {
  width: number
  height: number
}

/** A copy of the source Exif, made upright and resized, GPS optionally removed. */
function editedExif(exif: Uint8Array, policy: MetadataPolicy, size: OutputSize): Uint8Array {
  const copy = new Uint8Array(exif)
  setOrientation(copy, UPRIGHT)
  setPixelDimensions(copy, size)
  if (policy === 'keep-except-location') {
    removeLocation(copy)
  }
  return copy
}

function jpegWithMetadata(
  jpeg: Uint8Array,
  source: RawMetadata,
  policy: MetadataPolicy,
  size: OutputSize,
): Uint8Array {
  const segments: Uint8Array[] = []
  if (source.density !== null) {
    segments.push(jfifSegment(source.density))
  }
  if (policy !== 'strip' && source.exif !== null) {
    segments.push(app1Segment(EXIF_IDENTIFIER, editedExif(source.exif, policy, size)))
    if (policy === 'keep' && source.xmp !== null) {
      segments.push(app1Segment(XMP_IDENTIFIER, source.xmp))
    }
  }
  return segments.length === 0 ? jpeg : insertJpegSegments(jpeg, segments)
}

function pngWithMetadata(
  png: Uint8Array,
  source: RawMetadata,
  policy: MetadataPolicy,
  size: OutputSize,
): Uint8Array {
  const chunks: PngChunkInput[] = []
  if (policy !== 'strip' && source.exif !== null) {
    chunks.push({ type: 'eXIf', data: editedExif(source.exif, policy, size) })
    if (policy === 'keep' && source.xmp !== null) {
      chunks.push({ type: 'iTXt', data: xmpItxtData(source.xmp) })
    }
  }
  if (source.density !== null) {
    chunks.push({ type: 'pHYs', data: physChunkData(source.density) })
  }
  return chunks.length === 0 ? png : insertPngChunks(png, chunks)
}

/**
 * Returns `blob` with the policy's metadata written in. The source raw bytes
 * come from `photo-metadata.ts`; `null` means the photo had none, so only the
 * strip fast path (which does nothing) applies.
 */
export async function withMetadata(
  blob: Blob,
  format: OutputFormat,
  source: RawMetadata | null,
  policy: MetadataPolicy,
  outputSize: OutputSize,
): Promise<Blob> {
  if (format === 'image/webp') {
    if (policy !== 'strip') {
      throw new RangeError('WebP exports cannot carry metadata')
    }
    return blob
  }
  if (source === null) {
    return blob
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const patched =
    format === 'image/jpeg'
      ? jpegWithMetadata(bytes, source, policy, outputSize)
      : pngWithMetadata(bytes, source, policy, outputSize)
  // `Uint8Array<ArrayBufferLike>` is a valid BlobPart at runtime; the cast bridges
  // the lib.dom generic, as in zip.ts.
  return patched === bytes ? blob : new Blob([patched] as BlobPart[], { type: format })
}
