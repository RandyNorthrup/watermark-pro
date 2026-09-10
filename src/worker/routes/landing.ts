/**
 * The front door (GET /). The landing is prerendered to a static, per-locale
 * page (scripts/prerender.mjs) so a first visit paints instantly and downloads
 * no application JavaScript (PLAN.md §5.5 §1). This handler picks the language
 * and serves the matching static file:
 *
 * - `?lang=xx` persists an explicit choice in the `watermark-pro-locale` cookie
 *   and reloads `/` (the static links in the no-JS language switcher use this).
 * - A visitor who already has a session cookie is sent to the app.
 * - Otherwise the locale is negotiated from the cookie, then `Accept-Language`,
 *   then English, and the prerendered `dist/client/landing/<locale>.html` is
 *   served. When no prerender is present (local dev, CI) the SPA shell is served
 *   instead, so the app still works without the prerender step.
 *
 * Runs before the Hono API app (src/worker/index.ts) and its locked-down API
 * CSP, so the landing keeps the SPA response headers from public/_headers.
 */
import { AUTH_COOKIE_PREFIX, HSTS_MAX_AGE_SECONDS, HTTP_STATUS } from '../../shared/constants'
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type Locale,
  LOCALE_COOKIE,
  localeFromCookieHeader,
  matchLocale,
} from '../../shared/locales'

/** The `ASSETS` binding (wrangler.jsonc `assets.binding`); minimal shape for testing. */
export interface AssetsEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const LOCALE_COOKIE_MAX_AGE_SECONDS = 31_536_000
/** Better Auth's session cookie, with or without the production `__Secure-` prefix. */
const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`

function localeCookie(locale: Locale, isSecure: boolean): string {
  const attributes = `Path=/; Max-Age=${String(LOCALE_COOKIE_MAX_AGE_SECONDS)}; SameSite=Lax`
  return `${LOCALE_COOKIE}=${locale}; ${attributes}${isSecure ? '; Secure' : ''}`
}

/** Honor weighted preferences; a q=0 language is explicitly unacceptable. */
function acceptLanguageTags(header: string | null): string[] {
  if (header === null) {
    return []
  }
  return header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';')
      const quality = parameters.find((parameter) => parameter.trimStart().startsWith('q='))
      return {
        tag: tag?.trim() ?? '',
        weight: quality === undefined ? 1 : Number(quality.trim().slice(2)),
      }
    })
    .filter(
      ({ tag, weight }) =>
        tag.length > 0 && tag !== '*' && Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .toSorted((first, second) => second.weight - first.weight)
    .map(({ tag }) => tag)
}

/** Cookie → `Accept-Language` → English. */
function negotiateLocale(request: Request): Locale {
  const fromCookie = localeFromCookieHeader(request.headers.get('cookie'))
  if (fromCookie !== null) {
    return fromCookie
  }
  return matchLocale(acceptLanguageTags(request.headers.get('accept-language'))) ?? DEFAULT_LOCALE
}

function hasSessionCookie(request: Request): boolean {
  return (request.headers.get('cookie') ?? '').split(';').some((part) => {
    const [name, ...value] = part.trim().split('=')
    return (
      (name === SESSION_COOKIE_NAME || name === `__Secure-${SESSION_COOKIE_NAME}`) &&
      value.join('=').trim().length > 0
    )
  })
}

/** Dynamic locale/cookie decisions cannot be reused for another visitor by an HTTP cache. */
function landingResponse(response: Response, isHead = false): Response {
  // Headers iteration normalizes names to lowercase. Apply all security
  // overrides after the copied asset headers, so duplicate casing cannot
  // merge a weaker inherited value into the final policy.
  const headers = new Headers({
    ...Object.fromEntries(response.headers),
    'cache-control': 'no-store',
    vary: 'Cookie, Accept-Language',
    'strict-transport-security': `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
    ...(response.status === HTTP_STATUS.found && {
      'content-security-policy':
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    }),
  })
  return new Response(isHead ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Serves the prerendered landing for `GET /`, or returns null so the API app
 * handles the request. Never throws for a missing prerender: it falls back to
 * the SPA shell.
 */
export async function serveLanding(request: Request, env: AssetsEnv): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null
  }
  const url = new URL(request.url)
  if (!['/', '/privacy', '/terms'].includes(url.pathname)) {
    return null
  }
  const isSecure = url.protocol === 'https:'

  const requestedLang = url.searchParams.get('lang')
  if (requestedLang !== null) {
    const locale = isSupportedLocale(requestedLang) ? requestedLang : DEFAULT_LOCALE
    return landingResponse(
      new Response(null, {
        status: HTTP_STATUS.found,
        headers: { location: url.pathname, 'set-cookie': localeCookie(locale, isSecure) },
      }),
    )
  }

  if (url.pathname === '/' && hasSessionCookie(request)) {
    return landingResponse(
      new Response(null, { status: HTTP_STATUS.found, headers: { location: '/app' } }),
    )
  }

  const locale = negotiateLocale(request)
  const prefix = url.pathname === '/' ? '' : `${url.pathname.slice(1)}-`
  const landing = await env.ASSETS.fetch(
    new Request(new URL(`/landing/${prefix}${locale}.html`, url.origin)),
  )
  if (landing.status === HTTP_STATUS.notFound) {
    const shellRequest = new Request(new URL('/index.html', url.origin))
    const shell = await env.ASSETS.fetch(shellRequest)
    return landingResponse(shell, request.method === 'HEAD')
  }
  return landingResponse(landing, request.method === 'HEAD')
}
