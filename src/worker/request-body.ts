/** Bounded JSON parsing counts received bytes even when Content-Length is absent or false. */
import { apiErrors } from './errors'

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw apiErrors.payloadTooLarge()
  }
  const reader = request.body?.getReader()
  if (reader === undefined) {
    throw apiErrors.validation('request body must be JSON')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      const value: unknown = result.value
      if (!(value instanceof Uint8Array)) {
        await reader.cancel()
        throw apiErrors.validation('request body must contain bytes')
      }
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw apiErrors.payloadTooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
}
