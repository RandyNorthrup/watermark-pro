import { vi } from 'vitest'

/**
 * Replacement for `lib/download` in jsdom: records what would have been
 * saved instead of creating an anchor and an object URL.
 */
export const downloads = vi.fn<(blob: Blob, fileName: string) => void>()

export function downloadBlob(blob: Blob, fileName: string): void {
  downloads(blob, fileName)
}
