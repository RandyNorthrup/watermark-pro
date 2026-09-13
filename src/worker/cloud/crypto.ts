import { CLOUD_OAUTH, type CloudProvider } from '../../shared/cloud-connections'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const ENVELOPE_VERSION = 'v1'
const ENVELOPE_SPLIT_LIMIT = 4

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('Invalid encrypted cloud credential')
  return Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    (character) => character.codePointAt(0) ?? 0,
  )
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ])
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(CLOUD_OAUTH.keyContext),
      info: encoder.encode(ENVELOPE_VERSION),
    },
    material,
    { name: 'AES-GCM', length: CLOUD_OAUTH.encryptionBits },
    false,
    ['encrypt', 'decrypt'],
  )
}

function associatedData(
  userId: string,
  provider: CloudProvider,
  purpose: string,
): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(
    JSON.stringify([CLOUD_OAUTH.keyContext, userId, provider, purpose]),
  )
  return new Uint8Array(encoded)
}

/** Random state and PKCE values contain no account or provider identity. */
export function cloudNonce(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(CLOUD_OAUTH.randomBytes)))
}

/** SHA-256 serves OAuth state lookup and the S256 PKCE challenge without retaining raw state. */
export async function cloudDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return base64Url(new Uint8Array(digest))
}

/** AEAD binds the cipher to its account, provider, and purpose; copied rows cannot cross those boundaries. */
export async function encryptCloudValue(
  secret: string,
  userId: string,
  provider: CloudProvider,
  purpose: string,
  value: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(CLOUD_OAUTH.ivBytes))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(userId, provider, purpose) },
    await encryptionKey(secret),
    encoder.encode(value),
  )
  return `${ENVELOPE_VERSION}.${base64Url(iv)}.${base64Url(new Uint8Array(cipher))}`
}

/** Authentication failure stays an error; no plaintext or empty-token fallback is permitted. */
export async function decryptCloudValue(
  secret: string,
  userId: string,
  provider: CloudProvider,
  purpose: string,
  envelope: string,
): Promise<string> {
  const [version, nonce, cipher, extra] = envelope.split('.', ENVELOPE_SPLIT_LIMIT)
  if (
    version !== ENVELOPE_VERSION ||
    nonce === undefined ||
    cipher === undefined ||
    extra !== undefined
  )
    throw new Error('Invalid encrypted cloud credential')
  const iv = fromBase64Url(nonce)
  if (iv.byteLength !== CLOUD_OAUTH.ivBytes) throw new Error('Invalid encrypted cloud credential')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(userId, provider, purpose) },
    await encryptionKey(secret),
    fromBase64Url(cipher),
  )
  return decoder.decode(plaintext)
}
