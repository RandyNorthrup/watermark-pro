/**
 * Fills a text mark's `{date}`, `{time}` and `{filename}` placeholders for
 * one photo before rendering. The date is the file's last-modified time,
 * which cameras and phones set to the capture time; with no file (the
 * sample scene) it is now.
 */
import { resolveTextTokens, TEXT_TOKENS, type WatermarkSpec } from '../../shared/watermark'

export const SAMPLE_FILE_NAME = 'sample-photo'

/** The file name without its extension, the way a stamp would show it. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

export function hasTextTokens(spec: WatermarkSpec): boolean {
  return spec.kind === 'text' && TEXT_TOKENS.some((token) => spec.text.includes(token))
}

/** The spec the engine should render for `file`; the same object when there is nothing to fill in. */
export function specForPhoto(spec: WatermarkSpec, file: File | null): WatermarkSpec {
  if (spec.kind !== 'text' || !hasTextTokens(spec)) {
    return spec
  }
  const context =
    file === null
      ? { date: new Date(), fileName: SAMPLE_FILE_NAME }
      : { date: new Date(file.lastModified), fileName: baseName(file.name) }
  return { ...spec, text: resolveTextTokens(spec.text, context) }
}
