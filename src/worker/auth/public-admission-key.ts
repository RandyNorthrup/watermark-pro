import { PUBLIC_SIGNUP_POLICY } from '../../shared/public-signup'

/** A purpose-bound HMAC prevents a stored email key from being a reusable dictionary fingerprint. */
export async function publicAdmissionEmailHash(email: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${PUBLIC_SIGNUP_POLICY.digestPurpose}:${email.toLowerCase()}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(PUBLIC_SIGNUP_POLICY.digestRadix).padStart(2, '0'))
    .join('')
}
