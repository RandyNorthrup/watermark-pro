/** Real browser font decoding catches corrupt resources and CSS-family naming errors. */
import { describe, expect, it } from 'vitest'

import { FONT_CATALOGUE } from './catalogue'
import { loadFont } from './load'

const BATCH_SIZE = 8
const CATALOGUE_TIMEOUT_MS = 120_000

describe('complete font library', () => {
  it(
    'decodes every bundled family and exposes its actual regular face',
    async () => {
      const loaded = new Set<string>()
      for (let offset = 0; offset < FONT_CATALOGUE.length; offset += BATCH_SIZE) {
        await Promise.all(
          FONT_CATALOGUE.slice(offset, offset + BATCH_SIZE).map(async (font) => {
            const resource = await loadFont(font.family, 400)
            const face = await new FontFace(`"${font.family}"`, `url("${resource.url}")`, {
              weight: String(resource.weight),
            }).load()
            expect(face.status, font.family).toBe('loaded')
            expect(new URL(resource.url, location.href).origin).toBe(location.origin)
            loaded.add(font.family.replace(/ Variable$/, '').toLowerCase())
          }),
        )
      }
      expect(loaded.size).toBeGreaterThan(500)
    },
    CATALOGUE_TIMEOUT_MS,
  )

  it('rejects an unknown family instead of producing a fallback success', async () => {
    await expect(loadFont('Missing font fixture', 400)).rejects.toThrow('unknown font family')
  })
})
