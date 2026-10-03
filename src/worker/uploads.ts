import * as exifr from 'exifr'
import { imageDimensionsFromData } from 'image-dimensions'

import { apiErrors } from './errors'
import {
  encodedImageDimensionsSchema,
  type ImageDimensions,
  imageOrientationSchema,
} from '../shared/api'
import {
  EXIF_SWAPPED_ORIENTATIONS,
  IMAGE_HEADER_POLICY,
  PHOTO_CONTENT_TYPES,
} from '../shared/constants'

// Destructure the documented default API: raw Node loads exifr's UMD entry,
// which does not expose this named export to Node's static CJS interop.
const { orientation: readExifOrientation } = exifr.default

/**
 * Content sniffing for uploads. The declared MIME type is never trusted;
 * the type comes from the file signature, and the size limit is enforced
 * before the body is read into memory.
 */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

export type ImageType = (typeof IMAGE_TYPES)[number]

/** Byte values of a Latin-1 string; keeps signatures readable as the magic they are. */
function signature(text: string): readonly number[] {
  return Array.from(text, (character) => character.codePointAt(0) ?? 0)
}

const PNG_SIGNATURE = signature('\u{89}PNG\r\n\u{1A}\n')
const JPEG_SIGNATURE = signature('\u{FF}\u{D8}\u{FF}')
const GIF_SIGNATURE = signature('GIF8')
const RIFF_SIGNATURE = signature('RIFF')
const WEBP_TAG = signature('WEBP')
const FTYP_TAG = signature('ftyp')
const AVIF_BRANDS = new Set(['avif', 'avis'])
const RIFF_TAG_OFFSET = 8
const FTYP_OFFSET = 4
const BRAND_OFFSET = 8
const BRAND_LENGTH = 4
/** Longest prefix any signature needs. */
export const SNIFF_LENGTH = 12
const HEX_RADIX = 16

/** RFC 5987 encoding preserves Unicode names without letting header delimiters enter a response. */
export function imageContentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replaceAll(
    /[!'()*]/g,
    (character) => `%${(character.codePointAt(0) ?? 0).toString(HEX_RADIX).toUpperCase()}`,
  )
  return `inline; filename*=UTF-8''${encoded}`
}

function hasSignature(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte)
}

/** Returns the image type a byte sequence declares, or null when it is not a supported image. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (hasSignature(bytes, PNG_SIGNATURE)) {
    return 'image/png'
  }
  if (hasSignature(bytes, JPEG_SIGNATURE)) {
    return 'image/jpeg'
  }
  if (hasSignature(bytes, GIF_SIGNATURE)) {
    return 'image/gif'
  }
  if (hasSignature(bytes, RIFF_SIGNATURE) && hasSignature(bytes, WEBP_TAG, RIFF_TAG_OFFSET)) {
    return 'image/webp'
  }
  if (hasSignature(bytes, FTYP_TAG, FTYP_OFFSET)) {
    const brand = new TextDecoder().decode(bytes.slice(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH))
    if (AVIF_BRANDS.has(brand)) {
      return 'image/avif'
    }
  }
  return null
}

/**
 * Reads only dimension-bearing prefixes until found. Geometric probes bound
 * repeated work and keep normal large uploads out of the parser's full-input
 * clone. No smaller header cap is imposed; the existing file byte cap remains
 * authoritative. This validates header dimensions, not compressed pixels.
 */
async function encodedSize(file: File, contentType: ImageType): Promise<ImageDimensions> {
  let length = Math.min(IMAGE_HEADER_POLICY.initialBytes, file.size)
  for (;;) {
    const header = new Uint8Array(await file.slice(0, length).arrayBuffer())
    let dimensions: ReturnType<typeof imageDimensionsFromData>
    try {
      dimensions = imageDimensionsFromData(header)
    } catch {
      throw apiErrors.validation('Malformed encoded image header')
    }
    if (dimensions !== undefined) {
      const parsed = encodedImageDimensionsSchema.safeParse(dimensions)
      if (!parsed.success || `image/${dimensions.type}` !== contentType) {
        throw apiErrors.validation('Invalid encoded image dimensions')
      }
      return parsed.data
    }
    if (length === file.size) {
      throw apiErrors.validation('Incomplete or malformed encoded image header')
    }
    length = Math.min(file.size, length * IMAGE_HEADER_POLICY.growthFactor)
  }
}

async function jpegOrientation(bytes: ArrayBuffer): Promise<number | undefined> {
  try {
    return await readExifOrientation(bytes)
  } catch {
    throw apiErrors.validation('Malformed JPEG orientation metadata')
  }
}

/** Admits a stored image from actual bytes before hashing, reserving quota or writing objects. */
export async function readImageUpload(
  file: File,
  maxBytes: number,
  maxSide: number,
  claimed?: ImageDimensions,
) {
  if (file.size > maxBytes) throw apiErrors.payloadTooLarge()
  const prefix = new Uint8Array(await file.slice(0, SNIFF_LENGTH).arrayBuffer())
  const contentType = sniffImageType(prefix)
  if (contentType === null || !(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw apiErrors.unsupportedMedia()
  }
  const raw = await encodedSize(file, contentType)
  if (Math.max(raw.width, raw.height) > maxSide) {
    throw apiErrors.validation('Encoded image dimensions exceed the upload limit')
  }
  const bytes = await file.arrayBuffer()
  // First-party PNG/WebP uploads are rendered upright before encoding. JPEG
  // claims must also honor genuine EXIF; its dimension tags never supply size.
  const orientation = contentType === 'image/jpeg' ? await jpegOrientation(bytes) : undefined
  const parsedOrientation = imageOrientationSchema.safeParse(orientation ?? 1)
  if (!parsedOrientation.success) throw apiErrors.validation('Invalid image orientation')
  const isSwapped = EXIF_SWAPPED_ORIENTATIONS.includes(parsedOrientation.data)
  const size = isSwapped ? { width: raw.height, height: raw.width } : raw
  if (claimed !== undefined && (claimed.width !== size.width || claimed.height !== size.height)) {
    throw apiErrors.validation('Claimed image dimensions do not match encoded display dimensions')
  }
  return { bytes, contentType, ...size }
}
