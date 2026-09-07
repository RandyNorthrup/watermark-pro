import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STYLE,
  DEFAULT_TEXT_SPEC,
  MAX_TEXT_LINES,
  resolveTextTokens,
  watermarkSpecSchema,
} from './watermark'

describe('watermark spec schema', () => {
  it('accepts every mark kind and contrast mode', () => {
    const base = { placement: { mode: 'smart' }, contrast: { mode: 'auto' }, style: DEFAULT_STYLE }
    for (const mark of [
      {
        ...base,
        kind: 'text',
        text: 'Line one\nLine two',
        fontFamily: 'Inter Variable',
        fontWeight: 600,
      },
      {
        ...base,
        kind: 'symbol',
        symbol: { type: 'glyph', glyph: '©', fontFamily: 'Inter Variable' },
      },
      { ...base, kind: 'image', assetId: 'asset-1' },
      { ...base, kind: 'qr', content: 'https://example.test' },
      {
        ...base,
        kind: 'qr',
        content: 'https://example.test',
        contrast: { mode: 'colour', colour: '#FF8800', outline: 0.4 },
      },
      {
        ...base,
        kind: 'qr',
        content: 'x',
        contrast: { mode: 'manual', variant: 'dark', outline: 1 },
      },
    ]) {
      expect(watermarkSpecSchema.safeParse(mark).success, JSON.stringify(mark)).toBe(true)
    }
  })

  it('fills in the backdrop for presets saved before it existed', () => {
    const { backdrop: _backdrop, ...legacyStyle } = DEFAULT_STYLE
    const parsed = watermarkSpecSchema.parse({ ...DEFAULT_TEXT_SPEC, style: legacyStyle })
    expect(parsed.style.backdrop).toEqual({ enabled: false, opacity: 0.6 })
  })

  it('rejects too many lines, bad colours, empty QR content and unknown kinds', () => {
    const lines = Array.from({ length: MAX_TEXT_LINES + 1 }, (_, index) => `l${String(index)}`)
    expect(
      watermarkSpecSchema.safeParse({ ...DEFAULT_TEXT_SPEC, text: lines.join('\n') }).success,
    ).toBe(false)
    expect(
      watermarkSpecSchema.safeParse({
        ...DEFAULT_TEXT_SPEC,
        contrast: { mode: 'colour', colour: 'red', outline: 0.5 },
      }).success,
    ).toBe(false)
    expect(
      watermarkSpecSchema.safeParse({
        ...DEFAULT_TEXT_SPEC,
        contrast: { mode: 'colour', colour: '#12345', outline: 0.5 },
      }).success,
    ).toBe(false)
    expect(
      watermarkSpecSchema.safeParse({ ...DEFAULT_TEXT_SPEC, kind: 'qr', content: '' }).success,
    ).toBe(false)
    expect(watermarkSpecSchema.safeParse({ ...DEFAULT_TEXT_SPEC, kind: 'sticker' }).success).toBe(
      false,
    )
  })
})

describe('resolveTextTokens', () => {
  const context = { date: new Date(2026, 8, 6, 14, 5), fileName: 'IMG_0042' }

  it('fills every token, repeatedly, and leaves other text alone', () => {
    const resolved = resolveTextTokens('{filename} © {date} {time} {filename} {unknown}', context)
    expect(resolved.startsWith('IMG_0042 © ')).toBe(true)
    expect(resolved.endsWith(' IMG_0042 {unknown}')).toBe(true)
    expect(resolved).toContain('2026')
    expect(resolved).not.toContain('{date}')
    expect(resolved).not.toContain('{time}')
  })

  it('returns text without tokens unchanged', () => {
    expect(resolveTextTokens('© Studio', context)).toBe('© Studio')
  })
})
