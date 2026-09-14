import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SHAPE_SPEC,
  DEFAULT_STYLE,
  DEFAULT_TEXT_SPEC,
  watermarkSpecSchema,
} from './watermark'

describe('M12 schema', () => {
  it('allows full-circle curves in either direction without reinterpreting saved half circles', () => {
    for (const curve of [-2, -1, 0, 1, 2]) {
      const parsed = watermarkSpecSchema.parse({ ...DEFAULT_TEXT_SPEC, curve })
      expect(parsed.kind === 'text' ? parsed.curve : null).toBe(curve)
    }
    for (const curve of [-2.01, 2.01, Infinity, NaN])
      expect(watermarkSpecSchema.safeParse({ ...DEFAULT_TEXT_SPEC, curve }).success).toBe(false)
  })

  it('parses a pre-M12 text preset, defaulting the new fields', () => {
    const legacy = {
      kind: 'text',
      text: '© Studio',
      fontFamily: 'Inter Variable',
      fontWeight: 600,
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: DEFAULT_STYLE,
    }
    const parsed = watermarkSpecSchema.parse(legacy)
    expect(parsed.kind).toBe('text')
    if (parsed.kind === 'text') {
      expect(parsed.letterSpacing).toBe(0)
      expect(parsed.curve).toBe(0)
      expect(parsed.effect).toBe('solid')
    }
  })

  it('validates a shape mark and its random placement default', () => {
    expect(watermarkSpecSchema.safeParse(DEFAULT_SHAPE_SPEC).success).toBe(true)
    const random = watermarkSpecSchema.parse({
      ...DEFAULT_SHAPE_SPEC,
      placement: { mode: 'random' },
    })
    expect(random.placement.mode === 'random' ? random.placement.jitter : null).toBe(0.08)
  })
})
