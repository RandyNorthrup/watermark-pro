/** Replacement for `lib/thumbnail` in jsdom, which cannot decode or draw images. */
export const THUMBNAIL_MAX_SIDE = 400

export function createThumbnail(
  source: Blob,
): Promise<{ blob: Blob; width: number; height: number }> {
  return Promise.resolve({
    blob: new Blob([`thumb:${String(source.size)}`], { type: 'image/jpeg' }),
    width: 200,
    height: 150,
  })
}
