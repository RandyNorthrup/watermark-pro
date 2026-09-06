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
