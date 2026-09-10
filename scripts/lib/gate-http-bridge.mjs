/** Loopback HTTP transport for the SDK harness; each client owns only its request lifetime. */
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { forwardedHeaders } from './compressing-proxy.mjs'

const BAD_REQUEST = 400
const BAD_GATEWAY = 502
const UNAVAILABLE = 503
const BODYLESS_METHODS = new Set(['GET', 'HEAD'])
const TRANSPORT_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ERR_INVALID_ARG_TYPE',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
  'UND_ERR_SOCKET',
])

class GateRequestError extends Error {
  constructor(status) {
    super('The gate request cannot be forwarded.')
    this.status = status
  }
}

function requestTarget(request, origin) {
  const target = request.url
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//'))
    throw new GateRequestError(BAD_REQUEST)
  const url = new URL(target, origin)
  if (url.origin !== origin || url.hash !== '' || request.headers.host !== url.host)
    throw new GateRequestError(BAD_REQUEST)
  return url
}

function requestHeaders(request) {
  const headers = new Headers()
  const entries = Object.entries(forwardedHeaders(request.headers))
  for (const [name, value] of entries) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else if (value !== undefined) headers.set(name, value)
  }
  // SDK fetch can decode an encoded response. Ask for identity and reject a
  // contrary response so decoded bytes cannot retain gzip/br labels or lengths.
  headers.set('accept-encoding', 'identity')
  return headers
}

function responseHeaders(result, response) {
  const encoding = result.headers.get('content-encoding')
  if (encoding !== null && encoding !== 'identity')
    throw new Error('The gate Worker ignored identity response encoding.')
  const headers = forwardedHeaders(Object.fromEntries(result.headers))
  for (const [name, value] of Object.entries(headers))
    if (name !== 'set-cookie') response.setHeader(name, value)
  const cookies = result.headers.getSetCookie()
  if (cookies.length > 0) response.setHeader('set-cookie', cookies)
}

function failureCode(error) {
  for (const value of [error, error?.cause]) {
    if (typeof value?.code === 'string' && TRANSPORT_CODES.has(value.code)) return value.code
  }
  if (error instanceof GateRequestError) return 'request_rejected'
  if (error instanceof Error && error.message === 'Network connection lost.')
    return 'network_connection_lost'
  if (error instanceof TypeError) return 'type_error'
  return 'unclassified'
}

function failRequest(response, error, signal, stage) {
  const failure = signal.aborted ? 'client_disconnected' : 'forwarding_failed'
  // Only finite classifications leave this boundary; SDK error text can carry
  // request/configuration data and must never become a console diagnostic.
  console.error(`Gate request failed (${failure}; ${stage}; ${failureCode(error)}).`)
  if (response.destroyed) return
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(error instanceof GateRequestError ? error.status : BAD_GATEWAY, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  })
  response.end('{"error":"gate_request_failed"}')
}

/** Reserve a loopback port; requests fail with 503 until the migrated SDK dispatcher is ready. */
export async function createGateBridge(port) {
  const state = { dispatch: null, origin: '' }
  const controllers = new Set()
  const server = createServer(async (request, response) => {
    const controller = new AbortController()
    controllers.add(controller)
    const abort = () => controller.abort()
    request.once('aborted', abort)
    request.once('error', abort)
    response.once('error', abort)
    response.once('close', () => {
      if (!response.writableFinished) abort()
    })
    let stage = 'request_validation'
    try {
      const url = requestTarget(request, state.origin)
      const headers = requestHeaders(request)
      const hasBody = !BODYLESS_METHODS.has(request.method)
      if (
        !hasBody &&
        (request.headers['transfer-encoding'] !== undefined ||
          Number(request.headers['content-length'] ?? 0) > 0)
      )
        throw new GateRequestError(BAD_REQUEST)
      if (state.dispatch === null) throw new GateRequestError(UNAVAILABLE)
      stage = 'sdk_dispatch'
      const result = await state.dispatch(url, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
        ...(hasBody && { body: Readable.toWeb(request), duplex: 'half' }),
      })
      stage = 'response_headers'
      responseHeaders(result, response)
      response.writeHead(result.status, result.statusText)
      stage = 'response_stream'
      if (result.body === null) response.end()
      else await pipeline(Readable.fromWeb(result.body), response)
    } catch (error) {
      failRequest(response, error, controller.signal, stage)
    } finally {
      controllers.delete(controller)
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('The gate bridge did not bind an IP port.')
  }
  state.origin = `http://localhost:${String(address.port)}`
  let closing
  return {
    origin: state.origin,
    ready(dispatch) {
      if (state.dispatch !== null) throw new Error('The gate dispatcher is already initialized.')
      state.dispatch = dispatch
    },
    close() {
      closing ??= new Promise((resolve, reject) => {
        for (const controller of controllers) controller.abort()
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
      return closing
    },
  }
}
