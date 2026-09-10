import { expect, it, vi } from 'vitest'

import { MarkResources } from './mark-resources'
import { DEFAULT_SHAPE_SPEC, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'
import { EMOJI_FONT_STACK } from '../symbols/emoji-font'

const modules = vi.hoisted(() => ({ font: vi.fn(), sticker: vi.fn(), symbol: vi.fn() }))
const resolvers = vi.hoisted(() => ({ font: vi.fn(), sticker: vi.fn(), icon: vi.fn() }))

vi.mock('../fonts/load', () => {
  modules.font()
  return { loadFont: resolvers.font }
})
vi.mock('../stickers/load', () => {
  modules.sticker()
  return { loadSticker: resolvers.sticker }
})
vi.mock('../symbols/catalogue', () => {
  modules.symbol()
  return { iconPath: resolvers.icon }
})

it('loads only the resolver needed by actual marks and propagates resolver failures', async () => {
  const resources = new MarkResources(() => Promise.reject(new Error('unexpected logo')))
  const shape = DEFAULT_SHAPE_SPEC
  expect(modules.font).not.toHaveBeenCalled()
  expect(modules.sticker).not.toHaveBeenCalled()
  expect(modules.symbol).not.toHaveBeenCalled()
  const shapeResult = await resources.resolve([shape])
  expect(shapeResult.marks[0]?.spec).toEqual(shape)
  const emoji: WatermarkSpec = {
    ...DEFAULT_TEXT_SPEC,
    kind: 'symbol',
    symbol: { type: 'glyph', glyph: '🌼', fontFamily: EMOJI_FONT_STACK },
  }
  const emojiResult = await resources.resolve([emoji])
  expect(emojiResult.fonts).toEqual([])
  expect(modules.font).not.toHaveBeenCalled()
  expect(modules.sticker).not.toHaveBeenCalled()
  expect(modules.symbol).not.toHaveBeenCalled()

  const font = { family: 'Inter Variable', weight: 600, url: '/fonts/inter.woff2' }
  resolvers.font.mockResolvedValue(font)
  const textResult = await resources.resolve([DEFAULT_TEXT_SPEC])
  expect(textResult.fonts).toEqual([font])
  expect(modules.font).toHaveBeenCalledOnce()
  expect(modules.sticker).not.toHaveBeenCalled()
  expect(modules.symbol).not.toHaveBeenCalled()

  const icon: WatermarkSpec = {
    ...DEFAULT_TEXT_SPEC,
    kind: 'symbol',
    symbol: { type: 'icon', name: 'camera' },
  }
  resolvers.icon.mockReturnValue('M0 0L1 1')
  const iconResult = await resources.resolve([icon])
  expect(iconResult.marks[0]?.iconPath).toBe('M0 0L1 1')
  expect(resolvers.icon).toHaveBeenCalledWith('camera')
  expect(modules.symbol).toHaveBeenCalledOnce()
  expect(modules.sticker).not.toHaveBeenCalled()

  const failure = new Error('sticker download failed')
  resolvers.sticker.mockRejectedValueOnce(failure)
  await expect(
    resources.resolve([
      { ...DEFAULT_TEXT_SPEC, kind: 'symbol', symbol: { type: 'sticker', id: 'camera' } },
    ]),
  ).rejects.toBe(failure)
  expect(modules.sticker).toHaveBeenCalledOnce()
})
