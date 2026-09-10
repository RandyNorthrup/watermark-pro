import { contentDigest } from './sync'

const HEX_RADIX = 16

/** Stable per-owner link token is regenerated from a server secret and a rotatable nonce. */
export async function referralToken(
  secret: string,
  userId: string,
  nonce: string,
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`lumafoil-referral:${userId}:${nonce}`),
  )
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(HEX_RADIX).padStart(2, '0'))
    .join('')
}

/** One email-bound reservation per reusable invitation prevents duplicate quota claims. */
export async function referralAdmissionHash(tokenHash: string, email: string): Promise<string> {
  const bytes = new TextEncoder().encode(`referral:${tokenHash}:${email.toLowerCase()}`)
  return await contentDigest(new Uint8Array(bytes).buffer)
}
