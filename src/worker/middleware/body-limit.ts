/** Count bytes while the actual consumer reads, without buffering a second copy of uploads. */
import { createMiddleware } from 'hono/factory'

import { MAX_LOGO_BYTES, MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

export const API_BODY_LIMITS = {
  json: 262_144,
  multipartOverhead: 65_536,
} as const

/** Multipart allowances apply only to the two upload routes, never to authentication. */
export function requestBodyLimit(method: string, pathname: string): number {
  if (method === 'POST' && /^\/api\/orgs\/[^/]+\/photos$/.test(pathname)) {
    return MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES + API_BODY_LIMITS.multipartOverhead
  }
  if (method === 'POST' && /^\/api\/orgs\/[^/]+\/assets$/.test(pathname)) {
    return MAX_LOGO_BYTES + API_BODY_LIMITS.multipartOverhead
  }
  return API_BODY_LIMITS.json
}

/** Enforces the same cap when Content-Length is absent, false, or smaller than the actual stream. */
export const limitApiRequestBody = createMiddleware<AppContext>(async (c, next) => {
  const request = c.req.raw
  const maxBytes = requestBodyLimit(request.method, c.req.path)
  if (Number(request.headers.get('content-length')) > maxBytes) throw apiErrors.payloadTooLarge()
  const reader = request.body?.getReader()
  if (reader === undefined) {
    await next()
    return
  }
  const state = { bytes: 0, exceeded: false, released: false }
  function release() {
    if (state.released) {
      return
    }

    state.released = true
    reader?.releaseLock()
  }
  async function cancel() {
    if (!state.released) {
      try {
        await reader?.cancel()
      } finally {
        release()
      }
    }
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          release()
          controller.close()
          return
        }
        const bytes: unknown = chunk.value
        if (!(bytes instanceof Uint8Array)) {
          await cancel()
          controller.error(apiErrors.validation('Request body must contain bytes'))
          return
        }
        state.bytes += bytes.byteLength
        if (state.bytes > maxBytes) {
          state.exceeded = true
          await cancel()
          controller.error(apiErrors.payloadTooLarge())
          return
        }
        controller.enqueue(bytes)
      } catch {
        release()
        controller.error(apiErrors.validation('Unable to read request body'))
      }
    },
    cancel,
  })
  // Node's Request requires duplex for a stream. Workers ignores that compatibility option.
  const init: RequestInit & { duplex: 'half' } = { body, duplex: 'half' }
  c.req.raw = new Request(request, init)
  try {
    await next()
    // Individual parsers can convert a stream error into a generic 400. Keep the
    // size-limit response authoritative instead of losing it in that catch.
    if (state.exceeded) throw apiErrors.payloadTooLarge()
  } finally {
    await cancel()
  }
})
