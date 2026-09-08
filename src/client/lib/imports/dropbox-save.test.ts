import { describe, expect, it } from 'vitest'

import {
  base64UrlFromBytes,
  buildAuthorizeUrl,
  deriveCodeChallenge,
  dropboxApiArg,
  escapeNonAscii,
  readAuthorizationCode,
} from './dropbox-save'
import {
  CLOUD_SAVE_FOLDER,
  DROPBOX_OAUTH_AUTHORIZE_URL,
  DROPBOX_WRITE_SCOPES,
} from '../../../shared/constants'

describe('base64UrlFromBytes', () => {
  it('uses the URL-safe alphabet and strips padding', () => {
    // 0xFF -> standard "/w==", so the "/" must become "_" and padding must drop.
    expect(base64UrlFromBytes(new Uint8Array([255]))).toBe('_w')
    // 0xFB,0xFF exercises both "+"->"-" and "/"->"_" in one value.
    expect(base64UrlFromBytes(new Uint8Array([251, 255]))).toBe('-_8')
    expect(base64UrlFromBytes(new Uint8Array([1, 2, 3]))).toBe('AQID')
  })

  it('encodes an empty input as an empty string', () => {
    expect(base64UrlFromBytes(new Uint8Array([]))).toBe('')
  })
})

describe('deriveCodeChallenge', () => {
  it('matches the RFC 7636 Appendix B PKCE test vector', async () => {
    // verifier and expected challenge are the worked example from RFC 7636 §B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    await expect(deriveCodeChallenge(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('buildAuthorizeUrl', () => {
  it('targets the Dropbox authorize endpoint with the PKCE query', () => {
    const url = new URL(
      buildAuthorizeUrl({
        appKey: 'app-key-123',
        codeChallenge: 'challenge-xyz',
        redirectUri: 'https://app.example.com/oauth/dropbox',
      }),
    )
    expect(`${url.origin}${url.pathname}`).toBe(DROPBOX_OAUTH_AUTHORIZE_URL)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app-key-123',
      response_type: 'code',
      code_challenge: 'challenge-xyz',
      code_challenge_method: 'S256',
      redirect_uri: 'https://app.example.com/oauth/dropbox',
      scope: DROPBOX_WRITE_SCOPES,
      token_access_type: 'online',
    })
  })
})

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
      path: `/${CLOUD_SAVE_FOLDER}/sunset.jpg`,
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
    expect(parsed).toMatchObject({ path: `/${CLOUD_SAVE_FOLDER}/café.png` })
  })
})

describe('readAuthorizationCode', () => {
  it('returns the code from the redirect query', () => {
    expect(readAuthorizationCode('?code=abc123&state=x')).toBe('abc123')
  })

  it('throws with the error description when Dropbox denied the request', () => {
    expect(() =>
      readAuthorizationCode('?error=access_denied&error_description=User+said+no'),
    ).toThrow('User said no')
  })

  it('falls back to the error code when no description is present', () => {
    expect(() => readAuthorizationCode('?error=access_denied')).toThrow('access_denied')
  })

  it('throws when neither a code nor an error is present', () => {
    expect(() => readAuthorizationCode('')).toThrow('did not return an authorization code')
  })
})
