import { describe, expect, it } from 'vitest'

import { dropboxApiArg, escapeNonAscii } from './dropbox-save'

describe('escapeNonAscii', () => {
  it('leaves printable ASCII untouched', () => {
    const ascii = 'plain-name_01.png/{}"add"'
    expect(escapeNonAscii(ascii)).toBe(ascii)
  })

  it('backslash-u escapes an accented character', () => {
    expect(escapeNonAscii('café')).toBe(String.raw`caf\u00e9`)
  })

  it('escapes an astral emoji as its two UTF-16 code units', () => {
    // A surrogate pair must stay as two \uXXXX escapes so the JSON is still valid.
    expect(escapeNonAscii('a\u{1F600}b')).toBe(String.raw`a\ud83d\ude00b`)
  })

  it('produces an ASCII-only string for non-Latin input', () => {
    const escaped = escapeNonAscii('日本語 café 😀')
    expect(/^[ -~]*$/.test(escaped)).toBe(true)
  })
})

describe('dropboxApiArg', () => {
  it('places the file in the save folder with a non-overwriting mode', () => {
    const parsed: unknown = JSON.parse(dropboxApiArg('sunset.jpg'))
    expect(parsed).toEqual({
      path: `/sunset.jpg`,
      mode: 'add',
      autorename: true,
      mute: true,
    })
  })

  it('returns a header-safe (ASCII-only) value even for a non-ASCII name', () => {
    const header = dropboxApiArg('café.png')
    expect(/^[ -~]*$/.test(header)).toBe(true)
    // The escaped JSON still parses back to the original, accented path.
    const parsed: unknown = JSON.parse(header)
    expect(parsed).toMatchObject({ path: `/café.png` })
  })
})
