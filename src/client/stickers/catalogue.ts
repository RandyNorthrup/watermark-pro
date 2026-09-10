/** Pinned, locally bundled Fluent artwork; IDs are the only persisted references. */
import catalogue from './catalogue.json'

export const STICKER_CATEGORIES = [...new Set(catalogue.map((sticker) => sticker.category))]

/** Resolve only catalogue IDs, never a user-controlled URL. */
export function findSticker(id: string) {
  return catalogue.find((sticker) => sticker.id === id)
}

export { default as STICKER_CATALOGUE } from './catalogue.json'
