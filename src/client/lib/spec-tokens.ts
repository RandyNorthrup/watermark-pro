/**
 * Fills a text mark's placeholders for one photo before rendering. The date
 * defaults to the file's last-modified time (cameras and phones set that to the
 * capture time); a photo's EXIF, its position in a batch and the output size
 * are supplied by the caller when known.
 */
import {
  resolveTextTokens,
  TEXT_TOKENS,
  type TextTokenContext,
  type WatermarkSpec,
} from '../../shared/watermark'

export const SAMPLE_FILE_NAME = 'sample-photo'

/** Per-photo context beyond the file itself: EXIF, batch position, output size. */
export type PhotoContext = Pick<TextTokenContext, 'metadata' | 'index' | 'count' | 'output'>

/** The file name without its extension, the way a stamp would show it. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

export function hasTextTokens(spec: WatermarkSpec): boolean {
  return spec.kind === 'text' && TEXT_TOKENS.some((token) => spec.text.includes(token))
}

/** The spec the engine should render for `file`; the same object when there is nothing to fill in. */
export function specForPhoto(
  spec: WatermarkSpec,
  file: File | null,
  context: PhotoContext = {},
): WatermarkSpec {
  if (spec.kind !== 'text' || !hasTextTokens(spec)) {
    return spec
  }
  const base =
    file === null
      ? { date: new Date(), fileName: SAMPLE_FILE_NAME }
      : { date: new Date(file.lastModified), fileName: baseName(file.name) }
  return { ...spec, text: resolveTextTokens(spec.text, { ...base, ...context }) }
}
