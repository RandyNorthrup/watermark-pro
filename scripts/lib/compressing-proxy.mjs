/**
 * A brotli-compressing reverse proxy in front of `vite preview`.
 *
 * The preview serves every byte uncompressed; production sits behind
 * Cloudflare, which serves scripts, styles and JSON with brotli. Lighthouse's
 * phone emulation (slow 4G) turns that difference into seconds of load time,
 * so the audits fetch pages through this proxy to measure what a phone
 * downloads. Everything else (status, headers, cookies) passes through
 * untouched.
 *
 * Upstream requests use one fresh connection each (`agent: false`): the
 * preview closes idle keep-alive sockets, and reusing them under a burst of
 * asset requests produced resets mid-audit.
 */
import { createServer, request as httpRequest } from 'node:http'
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
/** Length-dependent headers the proxy must set itself. */
const HEADERS_TO_DROP = new Set(['content-length', 'content-encoding', 'transfer-encoding'])
const BAD_GATEWAY = 502
/**
 * Hashed build assets are immutable, so they are compressed once at the
 * quality a CDN precompresses with and served from memory after that;
 * everything else (HTML, JSON) gets the quality a CDN uses on the fly.
 */
const ASSET_PATH = /^\/assets\//
const DYNAMIC_QUALITY = 5
const assetCache = new Map()

function isCompressible(contentType) {
  return COMPRESSIBLE_TYPES.some((type) => contentType.startsWith(type))
}

/** Fetches the upstream response in full: status, headers and body. */
function fetchUpstream(upstream, request) {
  const url = new URL(request.url ?? '/', upstream)
  return new Promise((resolve, reject) => {
    const upstreamRequest = httpRequest(
      url,
      {
        method: request.method,
        headers: { ...request.headers, host: url.host },
        agent: false,
      },
      (upstreamResponse) => {
        const chunks = []
        upstreamResponse.on('data', (chunk) => {
          chunks.push(chunk)
        })
        upstreamResponse.on('end', () => {
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

/** Everything an error has to say, including the members of an AggregateError. */
function describe(error) {
  if (error instanceof AggregateError) {
    return error.errors.map((member) => describe(member)).join(' | ')
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** One retry for safe methods: a socket the preview closed while the request was in flight. */
async function fetchUpstreamWithRetry(upstream, request) {
  try {
    return await fetchUpstream(upstream, request)
  } catch (error) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw error
    }
    console.warn(`proxy: retrying ${request.url ?? ''} after ${describe(error)}`)
    return await fetchUpstream(upstream, request)
  }
}

/** Compresses like a CDN: assets once at top quality, the rest quickly. */
function compressBody(body, isAsset) {
  const quality = isAsset ? constants.BROTLI_MAX_QUALITY : DYNAMIC_QUALITY
  return compress(body, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } })
}

function send(response, { status, headers, output }) {
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HEADERS_TO_DROP.has(name)) {
      response.setHeader(name, value)
    }
  }
  if (output.isCompressed) {
    response.setHeader('content-encoding', 'br')
    response.setHeader('vary', 'accept-encoding')
  }
  response.writeHead(status)
  response.end(output.bytes)
}

async function forward(upstream, request, response) {
  const pathname = request.url ?? '/'
  const acceptsBrotli = String(request.headers['accept-encoding'] ?? '').includes('br')
  const isAsset = ASSET_PATH.test(pathname)
  const cached = acceptsBrotli && isAsset ? assetCache.get(pathname) : undefined
  if (cached !== undefined) {
    send(response, cached)
    return
  }
  const { status, headers, body } = await fetchUpstreamWithRetry(upstream, request)
  const contentType = String(headers['content-type'] ?? '')
  const isCompressed = acceptsBrotli && isCompressible(contentType) && body.length > 0
  const entry = {
    status,
    headers,
    output: { isCompressed, bytes: isCompressed ? await compressBody(body, isAsset) : body },
  }
  if (isCompressed && isAsset) {
    assetCache.set(pathname, entry)
  }
  send(response, entry)
}

/**
 * Starts the proxy and resolves with its origin and a `close` function.
 *
 * @param {{ upstream: string; port: number }} options
 * @returns {Promise<{ origin: string; close: () => Promise<void> }>}
 */
export function startCompressingProxy({ upstream, port }) {
  const server = createServer(async (request, response) => {
    try {
      await forward(upstream, request, response)
    } catch (error) {
      // A failed upstream request must not take the proxy (and the audit) down.
      console.error(
        `proxy: ${request.method ?? ''} ${request.url ?? ''} failed: ${describe(error)}`,
      )
      if (!response.headersSent) {
        response.writeHead(BAD_GATEWAY)
      }
      response.end()
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    // Every interface, so a port already taken on IPv6 or IPv4 fails here
    // instead of letting the browser reach some other local server.
    server.listen(port, () => {
      resolve({
        origin: `http://localhost:${String(port)}`,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => {
              resolveClose()
            })
          }),
      })
    })
  })
}
