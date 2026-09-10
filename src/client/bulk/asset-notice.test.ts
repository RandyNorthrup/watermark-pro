import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { zipEntries } from './zip'
import { ARTWORK_NOTICE_FILE, FLUENT_STICKER_NOTICE } from '../../shared/asset-licenses'

describe('portable ZIP artwork notices', () => {
  it('includes one full notice beside all marked files and none for an unmarked export', async () => {
    const marked = await zipEntries([
      { name: 'one.png', blob: new Blob(['one']), assetNotice: FLUENT_STICKER_NOTICE },
      { name: 'two.png', blob: new Blob(['two']), assetNotice: FLUENT_STICKER_NOTICE },
    ])
    const entries = unzipSync(new Uint8Array(await marked.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(['one.png', 'two.png', ARTWORK_NOTICE_FILE])
    expect(new TextDecoder().decode(entries[ARTWORK_NOTICE_FILE])).toBe(FLUENT_STICKER_NOTICE)
    const plain = await zipEntries([{ name: 'photo.png', blob: new Blob(['photo']) }])
    const plainEntries = unzipSync(new Uint8Array(await plain.arrayBuffer()))
    expect(Object.keys(plainEntries)).toEqual(['photo.png'])
  })
})
