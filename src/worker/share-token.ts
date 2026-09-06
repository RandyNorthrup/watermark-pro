/**
 * Share-link tokens: `<shareId>.<expiresAt>.<signature>` where the signature
 * is an HMAC-SHA-256 over the first two parts with a key derived from the
 * application secret. The token carries its own expiry so a public request
 * can be rejected before touching the database; revocation is a database
 * check on the id. Tokens are deterministic for a share, so the link can be
 * shown again later without storing it.
 */
import { MILLISECONDS_PER_SECOND } from '../shared/constants'

const TOKEN_PARTS = 3
/** `expiresAt` of 0 means the link never expires. */
export const NEVER_EXPIRES = 0
const SIGNATURE_BYTES = 32
/** Base64 encodes three bytes as four characters; padding fills the last group. */
const BASE64_GROUP = 4
const ID_PATTERN = /^[\w-]{1,64}$/

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[\w-]+$/.test(text)) {
    return null
  }
  try {
    const padding = '='.repeat((BASE64_GROUP - (text.length % BASE64_GROUP)) % BASE64_GROUP)
    const padded = text.replaceAll('-', '+').replaceAll('_', '/') + padding
    return Uint8Array.from(atob(padded), (character) => character.codePointAt(0) ?? 0)
  } catch {
    return null
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`share-token:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export interface ShareClaims {
  id: string
  /** Unix seconds, or NEVER_EXPIRES. */
  expiresAt: number
}

export async function signShareToken(secret: string, claims: ShareClaims): Promise<string> {
  if (
    !ID_PATTERN.test(claims.id) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt < 0
  ) {
    throw new RangeError('invalid share claims')
  }
  const payload = `${claims.id}.${String(claims.expiresAt)}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  )
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * Returns the claims when the signature is valid and the token has not
 * expired at `now` (unix seconds); null otherwise. The signature check is
 * done by Web Crypto, which compares in constant time.
 */
export async function verifyShareToken(
  secret: string,
  token: string,
  now = Math.floor(Date.now() / MILLISECONDS_PER_SECOND),
): Promise<ShareClaims | null> {
  const parts = token.split('.')
  if (parts.length !== TOKEN_PARTS) {
    return null
  }
  const [id, expiresText, signatureText] = parts
  if (id === undefined || expiresText === undefined || signatureText === undefined) {
    return null
  }
  const expiresAt = Number(expiresText)
  if (!ID_PATTERN.test(id) || !/^\d+$/.test(expiresText) || !Number.isSafeInteger(expiresAt)) {
    return null
  }
  const signature = fromBase64Url(signatureText)
  if (signature?.byteLength !== SIGNATURE_BYTES) {
    return null
  }
  const isValid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(`${id}.${expiresText}`),
  )
  if (!isValid) {
    return null
  }
  if (expiresAt !== NEVER_EXPIRES && expiresAt <= now) {
    return null
  }
  return { id, expiresAt }
}
