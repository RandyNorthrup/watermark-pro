import { describe, expect, it } from 'vitest'

import {
  LOGO_CONTENT_TYPES,
  MAX_PRESET_FILE_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  PRESET_FILE_FORMAT,
  PRESET_FILE_VERSION,
} from './constants'
import { collisionRename, presetFileSchema, type PresetFileEntry } from './preset-file'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC } from './watermark'

const textEntry: PresetFileEntry = { name: 'Corner mark', spec: DEFAULT_TEXT_SPEC }

const imageLogo = {
  name: 'logo.png',
  contentType: 'image/png',
  width: 240,
  height: 80,
  base64: 'AQID',
} as const

const imageEntry: PresetFileEntry = {
  name: 'Studio logo',
  spec: {
    kind: 'image',
    assetId: 'asset-1',
    placement: { mode: 'smart' },
    contrast: { mode: 'auto' },
    style: DEFAULT_STYLE,
  },
  logo: imageLogo,
}

/** Accepts invalid entries too so the reject cases can build malformed bundles. */
function validBundle(presets: readonly unknown[]): Record<string, unknown> {
  return {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    exportedAt: '2026-09-07T12:00:00.000Z',
    presets,
  }
}

describe('presetFileSchema', () => {
  it('accepts a bundle with text and image presets', () => {
    const result = presetFileSchema.safeParse(validBundle([textEntry, imageEntry]))
    expect(result.success).toBe(true)
  })

  it('accepts every allowed logo content type', () => {
    for (const contentType of LOGO_CONTENT_TYPES) {
      const entry: PresetFileEntry = { ...imageEntry, logo: { ...imageLogo, contentType } }
      expect(presetFileSchema.safeParse(validBundle([entry])).success).toBe(true)
    }
  })

  it('rejects the wrong format or version', () => {
    expect(
      presetFileSchema.safeParse({ ...validBundle([textEntry]), format: 'other/format' }).success,
    ).toBe(false)
    expect(presetFileSchema.safeParse({ ...validBundle([textEntry]), version: 2 }).success).toBe(
      false,
    )
  })

  it('rejects a non-ISO exportedAt', () => {
    expect(
      presetFileSchema.safeParse({ ...validBundle([textEntry]), exportedAt: 'yesterday' }).success,
    ).toBe(false)
  })

  it('rejects more presets than the limit', () => {
    const tooMany = Array.from({ length: MAX_PRESET_FILE_PRESETS + 1 }, () => textEntry)
    expect(presetFileSchema.safeParse(validBundle(tooMany)).success).toBe(false)
  })

  it('rejects an empty preset name and one over the length limit', () => {
    expect(presetFileSchema.safeParse(validBundle([{ ...textEntry, name: '' }])).success).toBe(
      false,
    )
    const longName = 'x'.repeat(MAX_PRESET_NAME_LENGTH + 1)
    expect(
      presetFileSchema.safeParse(validBundle([{ ...textEntry, name: longName }])).success,
    ).toBe(false)
  })

  it('rejects an unsupported logo content type', () => {
    const entry = { ...imageEntry, logo: { ...imageLogo, contentType: 'image/gif' } }
    expect(presetFileSchema.safeParse(validBundle([entry])).success).toBe(false)
  })

  it('rejects a logo with a non-positive dimension', () => {
    const entry = { ...imageEntry, logo: { ...imageLogo, width: 0 } }
    expect(presetFileSchema.safeParse(validBundle([entry])).success).toBe(false)
  })

  it('rejects an invalid spec', () => {
    const entry = { name: 'Broken', spec: { kind: 'nonsense' } }
    expect(presetFileSchema.safeParse(validBundle([entry])).success).toBe(false)
  })
})

describe('collisionRename', () => {
  it('returns the name unchanged when it is free', () => {
    expect(collisionRename('Logo', ['Other'])).toBe('Logo')
    expect(collisionRename('Logo', [])).toBe('Logo')
  })

  it('appends the first free numeric suffix', () => {
    expect(collisionRename('Logo', ['Logo'])).toBe('Logo (2)')
    expect(collisionRename('Logo', ['Logo', 'Logo (2)'])).toBe('Logo (3)')
    expect(collisionRename('Logo', ['Logo', 'Logo (2)', 'Logo (3)'])).toBe('Logo (4)')
  })

  it('skips gaps and takes the lowest available suffix', () => {
    expect(collisionRename('Logo', ['Logo', 'Logo (3)'])).toBe('Logo (2)')
  })
})
