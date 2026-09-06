/**
 * Replacement for `lib/image-size` in jsdom, which cannot decode images.
 * Plain-text files are treated as undecodable so tests can exercise the
 * rejection path.
 */
export const FAKE_IMAGE_SIZE = { width: 4000, height: 3000 }

export function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  return file.type === 'text/plain'
    ? Promise.reject(new Error('not an image'))
    : Promise.resolve(FAKE_IMAGE_SIZE)
}
