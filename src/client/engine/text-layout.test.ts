import { describe, expect, it } from 'vitest'

import { clustersOf } from './text-layout'

describe('clustersOf', () => {
  it('splits into grapheme clusters, keeping combined emoji whole', () => {
    expect(clustersOf('abc')).toEqual(['a', 'b', 'c'])
    // A flag is two code points but one grapheme.
    expect(clustersOf('🇬🇧!')).toEqual(['🇬🇧', '!'])
  })
})
