import { expect, it, vi } from 'vitest'

import { defaultSpecFor } from './spec-edit'
import { DEFAULT_SHAPE_SPEC, DEFAULT_TEXT_SPEC } from '../../shared/watermark'

const catalogueLoaded = vi.hoisted(() => vi.fn())
vi.mock('../fonts/catalogue', () => {
  catalogueLoaded()
  return { DEFAULT_FONT_FAMILY: 'Inter Variable' }
})

it('creates canonical text and glyph defaults without loading the font catalogue', () => {
  expect(catalogueLoaded).not.toHaveBeenCalled()
  expect(defaultSpecFor('text', DEFAULT_SHAPE_SPEC)).toMatchObject({
    kind: 'text',
    fontFamily: DEFAULT_TEXT_SPEC.fontFamily,
  })
  expect(defaultSpecFor('symbol', DEFAULT_SHAPE_SPEC)).toMatchObject({
    kind: 'symbol',
    symbol: { type: 'glyph', glyph: '©', fontFamily: DEFAULT_TEXT_SPEC.fontFamily },
  })
  expect(catalogueLoaded).not.toHaveBeenCalled()
})
