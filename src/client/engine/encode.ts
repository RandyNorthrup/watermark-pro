/**
 * Canvas → Blob. Browsers encode PNG, JPEG and WebP natively; the requested
 * type is verified on the result because an unsupported type silently
 * falls back to PNG in some engines.
 */
import type { EngineCanvas } from './canvas'

export const OUTPUT_FORMATS = ['image/png', 'image/jpeg', 'image/webp'] as const

export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

/** What of the source's metadata an export keeps. Strip is the safe default. */
export const METADATA_POLICIES = ['strip', 'keep-except-location', 'keep'] as const
export type MetadataPolicy = (typeof METADATA_POLICIES)[number]
export const DEFAULT_METADATA_POLICY: MetadataPolicy = 'strip'

/** Whether a format can carry the keep policies; WebP cannot (always stripped). */
export function canCarryMetadata(format: OutputFormat): boolean {
  return format !== 'image/webp'
}

/** The effective policy: a keep choice falls back to strip where the format cannot carry it. */
export function effectivePolicy(policy: MetadataPolicy, format: OutputFormat): MetadataPolicy {
  return canCarryMetadata(format) ? policy : DEFAULT_METADATA_POLICY
}

export interface EncodeOptions {
  format: OutputFormat
  /** 0–1 for lossy formats; ignored for PNG. */
  quality: number
  /** How much source metadata to keep; defaults to strip when absent. */
  metadata?: MetadataPolicy
}

export class EncodeError extends Error {
  override readonly name = 'EncodeError'
}

export async function encodeCanvas(canvas: EngineCanvas, options: EncodeOptions): Promise<Blob> {
  if (options.quality < 0 || options.quality > 1) {
    throw new RangeError('quality must be between 0 and 1')
  }
  const blob = await canvas.encode(options)
  if (blob.type !== options.format) {
    throw new EncodeError(`this browser cannot encode ${options.format}`)
  }
  return blob
}
