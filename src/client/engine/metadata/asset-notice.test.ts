import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { withAssetNotice } from './asset-notice'
import { insertPngChunks, pngChunks, xmpItxtData } from './segments'
import { webpWithArtworkNotice } from './webp-notice'
import { FLUENT_STICKER_NOTICE } from '../../../shared/asset-licenses'
import { minimalPng } from '../../test-support/exif-fixtures'

/** Minimal container fixtures test structure; browser tests independently prove real decoding. */
function riff(chunks: { type: string; data: Uint8Array }[]): Uint8Array {
  const length =
    12 + chunks.reduce((total, chunk) => total + 8 + chunk.data.length + (chunk.data.length % 2), 0)
  const bytes = new Uint8Array(length)
  const view = new DataView(bytes.buffer)
  const encoder = new TextEncoder()
  bytes.set(encoder.encode('RIFF'))
  view.setUint32(4, length - 8, true)
  bytes.set(encoder.encode('WEBP'), 8)
  let offset = 12
  for (const chunk of chunks) {
    bytes.set(encoder.encode(chunk.type), offset)
    view.setUint32(offset + 4, chunk.data.length, true)
    bytes.set(chunk.data, offset + 8)
    offset += 8 + chunk.data.length + (chunk.data.length % 2)
  }
  return bytes
}

function noticeDocument(container: string): XMLDocument {
  const start = container.indexOf('<x:xmpmeta')
  const end = container.indexOf('</x:xmpmeta>') + '</x:xmpmeta>'.length
  return new DOMParser().parseFromString(container.slice(start, end), 'application/xml')
}

describe('artwork notice containers', () => {
  it('round-trips XML text without creating elements, attributes, or entity references from notice content', () => {
    const notice = `A & B <script data-owner="other">not markup</script> 'quotes' العربية ]]>`
    const bytes = webpWithArtworkNotice(
      riff([{ type: 'VP8 ', data: new Uint8Array([1, 2]) }]),
      notice,
      { width: 1, height: 1 },
    )
    const container = new TextDecoder().decode(bytes)
    const xml = noticeDocument(container)
    expect(xml.querySelectorAll(':scope parsererror')).toHaveLength(0)
    expect(xml.querySelectorAll(':scope script')).toHaveLength(0)
    expect(
      xml.getElementsByTagNameNS('https://lumafoil.com/ns/assets/1.0/', 'ArtworkLicense')[0]
        ?.textContent,
    ).toBe(notice)
  })

  it('adds full JPEG and PNG notices without deleting previously selected metadata', async () => {
    const jpeg = new Blob([readFileSync('public/sample-scene.jpg')], { type: 'image/jpeg' })
    const markedJpeg = await withAssetNotice(jpeg, 'image/jpeg', FLUENT_STICKER_NOTICE, {
      width: 1,
      height: 1,
    })
    expect(await markedJpeg.text()).toContain(FLUENT_STICKER_NOTICE)
    const originalXmp = new TextEncoder().encode('<original>user metadata</original>')
    const png = insertPngChunks(minimalPng(), [{ type: 'iTXt', data: xmpItxtData(originalXmp) }])
    const markedPng = await withAssetNotice(
      new Blob([png] as BlobPart[]),
      'image/png',
      FLUENT_STICKER_NOTICE,
      { width: 1, height: 1 },
    )
    const bytes = new Uint8Array(await markedPng.arrayBuffer())
    expect(pngChunks(bytes).filter((chunk) => chunk.type === 'iTXt')).toHaveLength(2)
    expect(new TextDecoder().decode(bytes)).toContain('<original>user metadata</original>')
    expect(new TextDecoder().decode(bytes)).toContain(FLUENT_STICKER_NOTICE)
    expect(await withAssetNotice(jpeg, 'image/jpeg', null, { width: 1, height: 1 })).toBe(jpeg)
  })

  it('sets WebP XMP and alpha flags, canvas dimensions, padding, and escaped notice content', async () => {
    const simple = riff([{ type: 'VP8L', data: new Uint8Array([0x2f, 0, 0, 0, 0x10]) }])
    const withNotice = webpWithArtworkNotice(simple, 'A < B & C', { width: 400, height: 300 })
    expect(withNotice[20]).toBe(0x14)
    expect([...withNotice.slice(24, 27)]).toEqual([143, 1, 0])
    expect([...withNotice.slice(27, 30)]).toEqual([43, 1, 0])
    expect(new DataView(withNotice.buffer).getUint32(4, true)).toBe(withNotice.length - 8)
    expect(new TextDecoder().decode(withNotice)).toContain('A &lt; B &amp; C')
    const extended = riff([
      { type: 'VP8X', data: new Uint8Array(10) },
      { type: 'VP8 ', data: new Uint8Array([1, 2]) },
    ])
    const result = await withAssetNotice(
      new Blob([extended] as BlobPart[]),
      'image/webp',
      FLUENT_STICKER_NOTICE,
      { width: 1, height: 1 },
    )
    const xml = noticeDocument(await result.text())
    expect(
      xml.getElementsByTagNameNS('https://lumafoil.com/ns/assets/1.0/', 'ArtworkLicense')[0]
        ?.textContent,
    ).toBe(FLUENT_STICKER_NOTICE)
  })

  it('refuses invalid or incomplete encoded containers', async () => {
    await expect(
      withAssetNotice(new Blob(['bad']), 'image/jpeg', 'notice', { width: 1, height: 1 }),
    ).rejects.toThrow('no image scan')
    await expect(
      withAssetNotice(new Blob(['bad']), 'image/png', 'notice', { width: 1, height: 1 }),
    ).rejects.toThrow('no end chunk')
    expect(() =>
      webpWithArtworkNotice(new Uint8Array(), 'notice', { width: 1, height: 1 }),
    ).toThrow('Invalid encoded WebP')
    expect(() => webpWithArtworkNotice(riff([]), 'notice', { width: 1, height: 1 })).toThrow(
      'no image bitstream',
    )
    const malformed = riff([{ type: 'VP8 ', data: new Uint8Array([1, 2]) }])
    new DataView(malformed.buffer).setUint32(16, 100, true)
    expect(() => webpWithArtworkNotice(malformed, 'notice', { width: 1, height: 1 })).toThrow(
      'Truncated WebP payload',
    )
    const invalidExtended = riff([
      { type: 'VP8X', data: new Uint8Array(2) },
      { type: 'VP8 ', data: new Uint8Array(2) },
    ])
    expect(() => webpWithArtworkNotice(invalidExtended, 'notice', { width: 1, height: 1 })).toThrow(
      'extended WebP header',
    )
    expect(() =>
      webpWithArtworkNotice(riff([{ type: 'VP8 ', data: new Uint8Array(2) }]), 'notice', {
        width: 0,
        height: 1,
      }),
    ).toThrow('canvas size')
  })
})
