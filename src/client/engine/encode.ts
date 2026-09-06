/**
 * Canvas → Blob. Browsers encode PNG, JPEG and WebP natively; the requested
 * type is verified on the result because an unsupported type silently
 * falls back to PNG in some engines.
 */
export const OUTPUT_FORMATS = ['image/png', 'image/jpeg', 'image/webp'] as const

export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export interface EncodeOptions {
  format: OutputFormat
  /** 0–1 for lossy formats; ignored for PNG. */
  quality: number
}

export class EncodeError extends Error {
  override readonly name = 'EncodeError'
}

export async function encodeCanvas(canvas: OffscreenCanvas, options: EncodeOptions): Promise<Blob> {
  if (options.quality < 0 || options.quality > 1) {
    throw new RangeError('quality must be between 0 and 1')
  }
  const blob = await canvas.convertToBlob({ type: options.format, quality: options.quality })
  if (blob.type !== options.format) {
    throw new EncodeError(`this browser cannot encode ${options.format}`)
  }
  return blob
}
