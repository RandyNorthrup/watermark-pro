import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findSticker, STICKER_CATALOGUE, STICKER_CATEGORIES } from './catalogue'
import { artworkLicenseNotice, FLUENT_STICKER_NOTICE } from '../../shared/asset-licenses'
import { DEFAULT_TEXT_SPEC, watermarkSpecSchema } from '../../shared/watermark'
import { buildPresetFile, parsePresetFile } from '../lib/preset-file'

describe('licensed sticker catalogue', () => {
  it('has 400 unique designs across eight groups with a bundled MIT notice', () => {
    expect(STICKER_CATALOGUE).toHaveLength(400)
    expect(new Set(STICKER_CATALOGUE.map((sticker) => sticker.id)).size).toBe(400)
    expect(STICKER_CATEGORIES).toHaveLength(8)
    const license = readFileSync(path.resolve('public/stickers/LICENSE.txt'), 'utf8')
    expect(license).toContain('Copyright (c) Microsoft Corporation.')
    expect(license).toContain('MIT License')
    expect(FLUENT_STICKER_NOTICE).toContain(license.trim())
    expect(
      artworkLicenseNotice([
        { ...DEFAULT_TEXT_SPEC, kind: 'symbol', symbol: { type: 'icon', name: 'camera' } },
      ]),
    ).toContain(readFileSync('node_modules/lucide/LICENSE', 'utf8').trim())
    expect(findSticker('camera')?.name).toBe('Camera')
    expect(findSticker('https://untrusted.example/evil.svg')).toBeUndefined()
  })

  it.each(STICKER_CATALOGUE)('verifies immutable static SVG bytes for $id', (sticker) => {
    const svg = readFileSync(path.resolve('public', sticker.url.slice(1)))
    const digest = createHash('sha256').update(svg).digest('hex')
    expect(sticker.url).toContain(digest.slice(0, 12))
    const document = new DOMParser().parseFromString(svg.toString('utf8'), 'image/svg+xml')
    expect(
      document.querySelector('parsererror, script, foreignObject, image, use, animate, style'),
    ).toBeNull()
    expect(document.documentElement.localName).toBe('svg')
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^on|href/i)
        if (attribute.name !== 'xmlns')
          expect(attribute.value).not.toMatch(/https?:|data:|javascript:/i)
      }
    }
  })

  it('round-trips a saved sticker and rejects unknown or URL references at the schema', async () => {
    const spec = watermarkSpecSchema.parse({
      ...DEFAULT_TEXT_SPEC,
      kind: 'symbol',
      symbol: { type: 'sticker', id: 'camera' },
    })
    const file = buildPresetFile([{ name: 'Camera stamp', spec }], [])
    const parsed = await parsePresetFile(
      new File([JSON.stringify(file)], 'stickers.wmp.json', { type: 'application/json' }),
    )
    expect(parsed.presets[0]?.spec).toEqual(spec)
    expect(
      watermarkSpecSchema.safeParse({ ...spec, symbol: { type: 'sticker', id: '../private/file' } })
        .success,
    ).toBe(false)
    expect(
      watermarkSpecSchema.safeParse({
        ...spec,
        symbol: { type: 'sticker', id: 'not-in-catalogue' },
      }).success,
    ).toBe(false)
  })
})
