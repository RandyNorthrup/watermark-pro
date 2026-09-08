/**
 * Shared PDF test fixtures. `markPng` is a tiny valid 1×1 PNG that stands in
 * for a rendered watermark: the pure `watermark-pdf` only embeds and draws it
 * (its pixels are proven in `raster.browser.test.ts`), and the jsdom raster
 * fake returns it so the real pdf-lib path still embeds a live image.
 */
const MARK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function markPng(): Uint8Array {
  const binary = atob(MARK_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0
  }
  return bytes
}
