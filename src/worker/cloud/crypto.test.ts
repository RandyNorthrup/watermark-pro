import { describe, expect, it } from 'vitest'

import { cloudDigest, cloudNonce, decryptCloudValue, encryptCloudValue } from './crypto'

const SECRET = 'fixture-cloud-encryption-secret-32-characters'

describe('account-bound cloud credential encryption', () => {
  it('round trips without plaintext and authenticates account, provider, purpose, key and ciphertext', async () => {
    const first = await encryptCloudValue(
      SECRET,
      'account-a',
      'google',
      'refresh',
      'fixture-refresh-token',
    )
    const second = await encryptCloudValue(
      SECRET,
      'account-a',
      'google',
      'refresh',
      'fixture-refresh-token',
    )
    expect(first).not.toContain('fixture-refresh-token')
    expect(first).not.toBe(second)
    expect(await decryptCloudValue(SECRET, 'account-a', 'google', 'refresh', first)).toBe(
      'fixture-refresh-token',
    )
    for (const [key, user, provider, purpose, cipher] of [
      [SECRET, 'account-b', 'google', 'refresh', first],
      [SECRET, 'account-a', 'dropbox', 'refresh', first],
      [SECRET, 'account-a', 'google', 'access', first],
      ['different-secret-with-sufficient-entropy', 'account-a', 'google', 'refresh', first],
      [SECRET, 'account-a', 'google', 'refresh', `${first}.extra`],
      [SECRET, 'account-a', 'google', 'refresh', 'v2.invalid.invalid'],
      [SECRET, 'account-a', 'google', 'refresh', 'v1.@@.invalid'],
      [SECRET, 'account-a', 'google', 'refresh', 'v1.AAAA.invalid'],
    ] as const)
      await expect(decryptCloudValue(key, user, provider, purpose, cipher)).rejects.toThrow()
  })

  it('uses cryptographic 32-byte nonces and the independently specified S256 PKCE vector', async () => {
    const first = cloudNonce()
    expect(first).toMatch(/^[\w-]{43}$/)
    expect(first).not.toBe(cloudNonce())
    expect(await cloudDigest('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})
