/** Pure expiry boundaries; IndexedDB behavior is exercised in shared-files.browser.test.ts. */
import { describe, expect, it } from 'vitest'

import { selectFreshFiles, type SharedFileEntry } from './shared-files'

function entry(name: string, savedAt: number): SharedFileEntry {
  return { userId: 'owner', file: new File(['image'], name, { type: 'image/png' }), savedAt }
}

describe('selectFreshFiles', () => {
  it('preserves order inside the TTL and drops expired and future entries', () => {
    const now = 1000
    const ttl = 400
    const entries = [
      entry('fresh.png', now),
      entry('stale.png', now - 500),
      entry('other.png', now - 1),
      entry('future.png', now + 1),
    ]
    expect(selectFreshFiles(entries, now, ttl).map((file) => file.name)).toEqual([
      'fresh.png',
      'other.png',
    ])
  })
  it('treats an entry at exactly the TTL as expired', () => {
    expect(selectFreshFiles([entry('boundary.png', 600)], 1000, 400)).toEqual([])
  })
})
