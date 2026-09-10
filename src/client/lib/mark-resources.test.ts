import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkResources } from './mark-resources'
import { DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'
import { loadFont } from '../fonts/load'
import { loadSticker } from '../stickers/load'
import { EMOJI_FONT_STACK } from '../symbols/catalogue'

vi.mock('../fonts/load', () => ({ loadFont: vi.fn() }))
vi.mock('../stickers/load', () => ({ loadSticker: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('mark resources', () => {
  it('deduplicates actual fonts and uses the system emoji stack without downloading it', async () => {
    vi.mocked(loadFont).mockResolvedValue({
      family: 'Inter Variable',
      weight: 600,
      url: '/fonts/inter.woff2',
    })
    const logos = vi.fn(() => Promise.resolve(new Blob()))
    const resources = new MarkResources(logos)
    const emoji: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      kind: 'symbol',
      symbol: { type: 'glyph', glyph: '🌼', fontFamily: EMOJI_FONT_STACK },
    }
    const glyph: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      kind: 'symbol',
      symbol: { type: 'glyph', glyph: '©', fontFamily: 'Inter Variable' },
    }
    const icon: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      kind: 'symbol',
      symbol: { type: 'icon', name: 'camera' },
    }
    const result = await resources.resolve([
      DEFAULT_TEXT_SPEC,
      DEFAULT_TEXT_SPEC,
      emoji,
      glyph,
      icon,
    ])
    expect(result.fonts).toHaveLength(1)
    expect(loadFont).toHaveBeenCalledTimes(3)
    expect(loadFont).toHaveBeenCalledWith('Inter Variable', 400)
    expect(loadFont).not.toHaveBeenCalledWith(EMOJI_FONT_STACK, expect.anything())
    expect(result.marks[4]?.iconPath?.length).toBeGreaterThan(0)
    expect(logos).not.toHaveBeenCalled()
  })

  it('caches private logo bytes, returns fresh bitmaps, and delegates sticker lookup separately', async () => {
    const bitmap = { width: 16, height: 16, close: vi.fn() }
    const create = vi.fn(() => Promise.resolve(bitmap))
    vi.stubGlobal('createImageBitmap', create)
    vi.mocked(loadSticker).mockImplementation(async () => await createImageBitmap(new Blob()))
    const logos = vi.fn(() => Promise.resolve(new Blob(['logo'])))
    const resources = new MarkResources(logos)
    const logo: WatermarkSpec = { ...DEFAULT_TEXT_SPEC, kind: 'image', assetId: 'own-logo' }
    await resources.resolve([logo])
    await resources.resolve([logo])
    expect(logos).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledTimes(2)
    resources.forget('own-logo')
    await resources.resolve([logo])
    expect(logos).toHaveBeenCalledTimes(2)
    resources.clear()
    await resources.resolve([logo])
    expect(logos).toHaveBeenCalledTimes(3)
    const sticker: WatermarkSpec = {
      ...DEFAULT_TEXT_SPEC,
      kind: 'symbol',
      symbol: { type: 'sticker', id: 'camera' },
    }
    const result = await resources.resolve([sticker], 17)
    expect(loadSticker).toHaveBeenCalledWith('camera')
    expect(result.marks[0]).toMatchObject({ image: bitmap, seed: 17 })
    expect(logos).toHaveBeenCalledTimes(3)
  })
})
