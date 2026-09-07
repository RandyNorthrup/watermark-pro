import { describe, expect, it } from 'vitest'

import { EMPTY_PHOTO_METADATA, type PhotoMetadata } from './metadata'
import { resolveTextTokens, type TextTokenContext, tidyResolvedText } from './watermark'

const META: PhotoMetadata = {
  takenAt: new Date('2026-07-15T14:30:00'),
  camera: 'Canon EOS R6',
  lens: 'RF24-70mm F2.8 L IS USM',
  iso: 400,
  aperture: 2.8,
  shutter: 1 / 250,
  focalLength: 50,
  location: { latitude: 51.5074, longitude: -0.1278 },
  orientation: 1,
  density: null,
  exif: null,
  xmp: null,
}

const CONTEXT: TextTokenContext = {
  date: new Date('2020-01-01T00:00:00'),
  fileName: 'shot',
  metadata: META,
  index: 3,
  count: 9,
  output: { width: 1200, height: 900 },
}

describe('resolveTextTokens', () => {
  it('formats every camera and layout token', () => {
    expect(resolveTextTokens('{camera}', CONTEXT)).toBe('Canon EOS R6')
    expect(resolveTextTokens('{lens}', CONTEXT)).toBe('RF24-70mm F2.8 L IS USM')
    expect(resolveTextTokens('{iso}', CONTEXT)).toBe('ISO 400')
    expect(resolveTextTokens('{aperture}', CONTEXT)).toBe('f/2.8')
    expect(resolveTextTokens('{shutter}', CONTEXT)).toBe('1/250 s')
    expect(resolveTextTokens('{focal}', CONTEXT)).toBe('50 mm')
    expect(resolveTextTokens('{location}', CONTEXT)).toBe('51.5074° N, 0.1278° W')
    expect(resolveTextTokens('{index}/{count}', CONTEXT)).toBe('3/9')
    expect(resolveTextTokens('{width}x{height}', CONTEXT)).toBe('1200x900')
    expect(resolveTextTokens('{taken}', CONTEXT)).not.toBe('')
  })

  it('formats a slow shutter as whole seconds', () => {
    expect(resolveTextTokens('{shutter}', { ...CONTEXT, metadata: { ...META, shutter: 2 } })).toBe(
      '2 s',
    )
  })

  it('{date} prefers the capture date over the file time', () => {
    const withCapture = resolveTextTokens('{date}', CONTEXT)
    const noCapture = resolveTextTokens('{date}', {
      ...CONTEXT,
      metadata: { ...META, takenAt: null },
    })
    expect(withCapture).not.toBe(noCapture)
  })

  it('leaves a token empty when its field is missing', () => {
    const none: TextTokenContext = {
      date: new Date(),
      fileName: 'x',
      metadata: EMPTY_PHOTO_METADATA,
    }
    expect(resolveTextTokens('{camera}', none)).toBe('')
    expect(resolveTextTokens('{taken}', none)).toBe('')
    expect(resolveTextTokens('{iso}', none)).toBe('')
  })

  it('tidies separators left by an empty token', () => {
    const noLens: TextTokenContext = { ...CONTEXT, metadata: { ...META, lens: null } }
    expect(resolveTextTokens('{camera} · {lens}', noLens)).toBe('Canon EOS R6')
    expect(resolveTextTokens('{lens} · {camera}', noLens)).toBe('Canon EOS R6')
    expect(resolveTextTokens('{camera} · {lens} · {iso}', noLens)).toBe('Canon EOS R6 · ISO 400')
  })

  it('does not touch a hyphen inside a word', () => {
    expect(resolveTextTokens('{lens}', CONTEXT)).toContain('RF24-70mm')
  })
})

describe('tidyResolvedText', () => {
  it('collapses doubled and dangling separators', () => {
    expect(tidyResolvedText('A ·  · B')).toBe('A · B')
    expect(tidyResolvedText('A · ')).toBe('A')
    expect(tidyResolvedText(' · A')).toBe('A')
    expect(tidyResolvedText('A  B')).toBe('A B')
  })
})
