import { describe, expect, it } from 'vitest'

import { FLUENT_STICKER_NOTICE, artworkLicenseNotice } from './asset-licenses'
import { DEFAULT_TEXT_SPEC } from './watermark'

describe('bundled artwork licensing', () => {
  it('retains the complete source notice without asserting ownership of user content', () => {
    expect(FLUENT_STICKER_NOTICE).toContain('Copyright (c) Microsoft Corporation.')
    expect(FLUENT_STICKER_NOTICE).toContain(
      "does not claim any rights in the user's original photograph",
    )
    expect(artworkLicenseNotice([DEFAULT_TEXT_SPEC])).toBeNull()
    expect(
      artworkLicenseNotice([
        { ...DEFAULT_TEXT_SPEC, kind: 'symbol', symbol: { type: 'sticker', id: 'camera' } },
      ]),
    ).toBe(FLUENT_STICKER_NOTICE)
    const icons = artworkLicenseNotice([
      { ...DEFAULT_TEXT_SPEC, kind: 'symbol', symbol: { type: 'icon', name: 'camera' } },
    ])
    expect(icons).toContain('ISC License')
    expect(icons).toContain('Copyright (c) 2013-present Cole Bemis')
    expect(icons).not.toContain('Microsoft Corporation')
  })
})
