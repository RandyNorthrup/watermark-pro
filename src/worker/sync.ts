/** Offline replay identity is validated at the boundary; authorization still runs per request. */
import { apiErrors } from './errors'
import { SYNC_OPERATION_HEADER, syncOperationIdSchema } from '../shared/sync'

/** The client-generated operation UUID becomes a stable create id within the existing tenant checks. */
export function syncOperationId(request: Request): string | null {
  const value = request.headers.get(SYNC_OPERATION_HEADER)
  if (value === null) {
    return null
  }
  const result = syncOperationIdSchema.safeParse(value)
  if (!result.success) {
    throw apiErrors.validation('Invalid synchronization operation id')
  }
  return result.data
}

const HEX_RADIX = 16

/** Content-addressed keys keep a conflicting replay from overwriting a committed upload. */
export async function contentDigest(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((byte) => byte.toString(HEX_RADIX).padStart(2, '0')).join('')
}

/** A stable receipt binds replay metadata to the already validated payload. */
export async function payloadFingerprint(value: unknown): Promise<string> {
  const serialized = JSON.stringify(value)
  const bytes = new TextEncoder().encode(serialized)
  return await contentDigest(new Uint8Array(bytes).buffer)
}
