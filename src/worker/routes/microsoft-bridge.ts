/** The MSAL callback must not load the SPA, expose its query to assets, or inherit popup-isolating headers. */
import type { AssetsEnv } from './landing'
import {
  HSTS_MAX_AGE_SECONDS,
  HTTP_STATUS,
  MICROSOFT_OAUTH_REDIRECT_PATH,
} from '../../shared/constants'

const SCRIPT_PATH = '/oauth/microsoft-bridge.js'
const DOCUMENT_PATHS = new Set([
  MICROSOFT_OAUTH_REDIRECT_PATH,
  `${MICROSOFT_OAUTH_REDIRECT_PATH}/`,
  `${MICROSOFT_OAUTH_REDIRECT_PATH}.html`,
])
const BRIDGE_MARKER = 'id="microsoft-redirect-bridge"'
const BRIDGE_CSP =
  "default-src 'none'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"

function bridgeResponse(body: BodyInit | null, status: number, headers = new Headers()): Response {
  headers.delete('Cross-Origin-Opener-Policy')
  headers.delete('Cross-Origin-Embedder-Policy')
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('Content-Security-Policy', BRIDGE_CSP)
  headers.set(
    'Strict-Transport-Security',
    `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
  )
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(body, { status, headers })
}

/** This route runs before API/service initialization, including for an anonymous popup or silent iframe. */
export async function serveMicrosoftBridge(
  request: Request,
  env: AssetsEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  const isDocument = DOCUMENT_PATHS.has(url.pathname)
  if (!isDocument && url.pathname !== SCRIPT_PATH) return null
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return bridgeResponse(null, HTTP_STATUS.methodNotAllowed, new Headers({ Allow: 'GET, HEAD' }))
  url.pathname = isDocument ? MICROSOFT_OAUTH_REDIRECT_PATH : SCRIPT_PATH
  url.search = ''
  url.hash = ''
  try {
    // A new request deliberately carries no cookies, authorization or callback query.
    const asset = await env.ASSETS.fetch(new Request(url, { redirect: 'manual' }))
    const body = await asset.text()
    const type = asset.headers.get('Content-Type') ?? ''
    const isExpectedAsset = isDocument
      ? type.includes('text/html') && body.includes(BRIDGE_MARKER)
      : /(?:text|application)\/javascript/.test(type)
    if (!isExpectedAsset || asset.status !== HTTP_STATUS.ok)
      return bridgeResponse(null, HTTP_STATUS.serviceUnavailable)
    return bridgeResponse(
      request.method === 'HEAD' ? null : body,
      HTTP_STATUS.ok,
      new Headers(asset.headers),
    )
  } catch {
    return bridgeResponse(null, HTTP_STATUS.serviceUnavailable)
  }
}
