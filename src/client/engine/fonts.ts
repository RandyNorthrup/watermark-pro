/**
 * Loads the fonts a mark needs into a `FontFaceSet` (the worker's own set,
 * or the document's on the main thread) and remembers what is already there
 * so each family and weight is fetched once per engine.
 */
import type { FontResource } from './protocol'

export class FontLoader {
  readonly #target: FontFaceSet
  readonly #loaded = new Set<string>()

  constructor(target: FontFaceSet) {
    this.#target = target
  }

  async ensure(fonts: readonly FontResource[]): Promise<void> {
    for (const font of fonts) {
      const key = `${font.family}#${String(font.weight)}`
      if (this.#loaded.has(key)) {
        continue
      }
      const face = new FontFace(font.family, `url(${font.url})`, { weight: String(font.weight) })
      await face.load()
      this.#target.add(face)
      this.#loaded.add(key)
    }
  }
}
