import { describe, expect, it } from 'vitest'

import { NEVER_EXPIRES, signShareToken, verifyShareToken } from './share-token'

const secret = 'a-test-secret-that-is-long-enough-for-hmac'
const NOW = 1_800_000_000

describe('share tokens', () => {
  it('round-trips claims and is deterministic for a share', async () => {
    const token = await signShareToken(secret, { id: 'share_1', expiresAt: NOW + 60 })
    expect(token.split('.')).toHaveLength(3)
    expect(await signShareToken(secret, { id: 'share_1', expiresAt: NOW + 60 })).toBe(token)
    expect(await verifyShareToken(secret, token, NOW)).toEqual({
      id: 'share_1',
      expiresAt: NOW + 60,
    })
    const forever = await signShareToken(secret, { id: 'share-2', expiresAt: NEVER_EXPIRES })
    expect(await verifyShareToken(secret, forever, NOW * 2)).toEqual({
      id: 'share-2',
      expiresAt: NEVER_EXPIRES,
    })
  })

  it('rejects expired, tampered, foreign-secret and malformed tokens', async () => {
    const token = await signShareToken(secret, { id: 'share_1', expiresAt: NOW + 60 })
    expect(await verifyShareToken(secret, token, NOW + 60)).toBeNull()
    expect(await verifyShareToken('another-secret-of-sufficient-length', token, NOW)).toBeNull()
    const [id = '', expiresAt = '', signature = ''] = token.split('.', 3)
    expect(await verifyShareToken(secret, `share_2.${expiresAt}.${signature}`, NOW)).toBeNull()
    expect(
      await verifyShareToken(secret, `${id}.${String(NOW + 9999)}.${signature}`, NOW),
    ).toBeNull()
    expect(
      await verifyShareToken(secret, `${id}.${expiresAt}.${signature.slice(1)}x`, NOW),
    ).toBeNull()
    expect(await verifyShareToken(secret, `${id}.${expiresAt}.${signature}.extra`, NOW)).toBeNull()
    expect(await verifyShareToken(secret, `${id}.abc.${signature}`, NOW)).toBeNull()
    expect(await verifyShareToken(secret, `../etc.${expiresAt}.${signature}`, NOW)).toBeNull()
    expect(await verifyShareToken(secret, `${id}.${expiresAt}.not*base64`, NOW)).toBeNull()
    expect(await verifyShareToken(secret, '', NOW)).toBeNull()
  })

  it('refuses to sign malformed claims', async () => {
    await expect(signShareToken(secret, { id: 'has space', expiresAt: 1 })).rejects.toThrow(
      RangeError,
    )
    await expect(signShareToken(secret, { id: 'ok', expiresAt: -1 })).rejects.toThrow(RangeError)
    await expect(signShareToken(secret, { id: 'ok', expiresAt: 1.5 })).rejects.toThrow(RangeError)
  })
})
