/** Brotli edge model with optional HTTP/2 TLS; forwarding preserves origin, response and cookie boundaries. */
import { createServer, request as httpRequest } from 'node:http'
import { createSecureServer } from 'node:http2'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'

const compress = promisify(brotliCompress)
const COMPRESSIBLE_TYPES = [
  'text/',
  'application/javascript',
  'application/json',
  'application/manifest+json',
  'image/svg+xml',
]
const HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
const RESPONSE_LENGTH_HEADERS = new Set(['content-length', 'content-encoding'])
const BAD_REQUEST = 400
const BAD_GATEWAY = 502
const OK = 200
const ASSET_PATH = /^\/assets\//
const DYNAMIC_QUALITY = 5
const CLOSE_TIMEOUT_MS = 1000

class ProxyTargetError extends Error {}

/** Strip transport-only fields while preserving ordinary headers and repeated cookie values. */
export function forwardedHeaders(headers) {
  const nominated = new Set(
    String(headers.connection ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !name.startsWith(':') && !HOP_HEADERS.has(name) && !nominated.has(name),
    ),
  )
}

function targetUrl(upstream, requestUrl) {
  let target
  try {
    target = new URL(requestUrl ?? '/', upstream)
  } catch {
    throw new ProxyTargetError('Audit proxy received an invalid request target.')
  }
  if (
    target.origin !== upstream.origin ||
    target.username !== '' ||
    target.password !== '' ||
    target.hash !== ''
  )
    throw new ProxyTargetError('Audit request target must remain on the configured upstream.')
  return target
}

function acceptsBrotli(header) {
  return String(header ?? '')
    .split(',')
    .some((part) => {
      const [name, ...parameters] = part.trim().split(';')
      const quality = parameters.find((parameter) => parameter.trimStart().startsWith('q='))
      const weight = quality === undefined ? 1 : Number(quality.trim().slice(2))
      return name === 'br' && Number.isFinite(weight) && weight > 0 && weight <= 1
    })
}

/** Identity upstream bytes avoid double compression; only this proxy's exact Origin is rewritten. */
function fetchUpstream(context, target, request) {
  const headers = forwardedHeaders(request.headers)
  const origin = headers.origin === context.origin ? context.upstream.origin : headers.origin
  return new Promise((resolve, reject) => {
    const upstreamRequest = httpRequest(
      target,
      {
        method: request.method,
        headers: {
          ...headers,
          host: target.host,
          'accept-encoding': 'identity',
          ...(origin !== undefined && { origin }),
        },
        agent: false,
      },
      (upstreamResponse) => {
        const chunks = []
        upstreamResponse.on('data', (chunk) => {
          chunks.push(chunk)
        })
        upstreamResponse.on('end', () => {
          const encoding = upstreamResponse.headers['content-encoding']
          if (encoding !== undefined && encoding !== 'identity') {
            reject(new Error('Audit upstream ignored the identity encoding request.'))
            return
          }
          resolve({
            status: upstreamResponse.statusCode ?? BAD_GATEWAY,
            headers: upstreamResponse.headers,
            body: Buffer.concat(chunks),
          })
        })
        upstreamResponse.on('error', reject)
      },
    )
    upstreamRequest.on('error', reject)
    request.pipe(upstreamRequest)
  })
}

function describe(error) {
  if (error instanceof AggregateError)
    return error.errors.map((member) => describe(member)).join(' | ')
  return error instanceof Error ? error.name + ': ' + error.message : String(error)
}

/** Only safe requests may be retried after a transport failure; posted bodies are never replayed. */
async function fetchUpstreamWithRetry(context, target, request) {
  try {
    return await fetchUpstream(context, target, request)
  } catch (error) {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw error
    console.warn('proxy: retrying safe upstream request after ' + describe(error))
    return await fetchUpstream(context, target, request)
  }
}

function compressBody(body, isAsset) {
  const quality = isAsset ? constants.BROTLI_MAX_QUALITY : DYNAMIC_QUALITY
  return compress(body, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } })
}

function send(response, { status, headers, output }) {
  const fields = Object.entries(forwardedHeaders(headers))
  for (const [name, value] of fields) {
    if (value !== undefined && !RESPONSE_LENGTH_HEADERS.has(name)) response.setHeader(name, value)
  }
  if (output.isCompressed) {
    response.setHeader('content-encoding', 'br')
    const vary = new Set(
      String(headers.vary ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    )
    vary.add('Accept-Encoding')
    response.setHeader('vary', [...vary].join(', '))
  }
  response.writeHead(status)
  response.end(output.bytes)
}

async function forward(context, request, response) {
  const target = targetUrl(context.upstream, request.url)
  const pathname = target.pathname + target.search
  const brotli = acceptsBrotli(request.headers['accept-encoding'])
  const isAsset = ASSET_PATH.test(target.pathname)
  const isCacheableRequest = request.method === 'GET' && brotli && isAsset
  const cached = isCacheableRequest ? context.cache.get(pathname) : undefined
  if (cached !== undefined) {
    send(response, cached)
    return
  }
  const { status, headers, body } = await fetchUpstreamWithRetry(context, target, request)
  const contentType = String(headers['content-type'] ?? '')
  const isCompressed =
    brotli && COMPRESSIBLE_TYPES.some((type) => contentType.startsWith(type)) && body.length > 0
  const entry = {
    status,
    headers,
    output: { isCompressed, bytes: isCompressed ? await compressBody(body, isAsset) : body },
  }
  if (
    isCacheableRequest &&
    isCompressed &&
    status === OK &&
    headers['set-cookie'] === undefined &&
    !/\b(?:private|no-store)\b/i.test(String(headers['cache-control'] ?? ''))
  )
    context.cache.set(pathname, entry)
  send(response, entry)
}

/** HTTP/2 sessions are owned by this proxy and must close before the browser-profile cleanup. */
function closeProxy(server, sessions) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      for (const session of sessions) session.destroy()
      server.closeAllConnections?.()
    }, CLOSE_TIMEOUT_MS)
    server.close(() => {
      clearTimeout(timeout)
      resolve()
    })
    for (const session of sessions) session.close()
  })
}

/** Bind only loopback; TLS callers provide an ephemeral certificate and pin it in their owned browser. */
export function startCompressingProxy({ upstream, port, tls }) {
  const target = new URL(upstream)
  if (target.protocol !== 'http:' || target.username !== '' || target.password !== '')
    throw new Error('The audit upstream must be an HTTP origin without embedded credentials.')
  const context = { upstream: target, origin: '', cache: new Map() }
  const sessions = new Set()
  const handler = async (request, response) => {
    try {
      await forward(context, request, response)
    } catch (error) {
      if (response.destroyed) return
      // Targets can contain private path/query values; diagnostics omit them.
      console.error('proxy: upstream forwarding failed: ' + describe(error))
      if (!response.headersSent)
        response.writeHead(error instanceof ProxyTargetError ? BAD_REQUEST : BAD_GATEWAY)
      response.end()
    }
  }
  const server =
    tls === undefined
      ? createServer(handler)
      : createSecureServer({ key: tls.key, cert: tls.cert, allowHTTP1: false }, handler)
  server.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, 'localhost', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('The audit proxy did not bind a TCP port.'))
        return
      }
      context.origin =
        (tls === undefined ? 'http' : 'https') + '://localhost:' + String(address.port)
      resolve({
        origin: context.origin,
        close: () => closeProxy(server, sessions),
      })
    })
  })
}
