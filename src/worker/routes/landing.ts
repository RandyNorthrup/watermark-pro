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
import { HTTP_STATUS } from '../../shared/constants'
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
const SESSION_COOKIE_NAME = 'better-auth.session_token'

function localeCookie(locale: Locale, isSecure: boolean): string {
  const attributes = `Path=/; Max-Age=${String(LOCALE_COOKIE_MAX_AGE_SECONDS)}; SameSite=Lax`
  return `${LOCALE_COOKIE}=${locale}; ${attributes}${isSecure ? '; Secure' : ''}`
}

/** Ordered language tags from an `Accept-Language` header (q-values dropped). */
function acceptLanguageTags(header: string | null): string[] {
  if (header === null) {
    return []
  }
  return header
    .split(',')
    .map((part) => (part.split(';', 1)[0] ?? '').trim())
    .filter((tag) => tag.length > 0 && tag !== '*')
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
  return (request.headers.get('cookie') ?? '').includes(SESSION_COOKIE_NAME)
}

/**
 * Serves the prerendered landing for `GET /`, or returns null so the API app
 * handles the request. Never throws for a missing prerender: it falls back to
 * the SPA shell.
 */
export async function serveLanding(request: Request, env: AssetsEnv): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null
  }
  const url = new URL(request.url)
  if (url.pathname !== '/') {
    return null
  }
  const isSecure = url.protocol === 'https:'

  const requestedLang = url.searchParams.get('lang')
  if (requestedLang !== null) {
    const locale = isSupportedLocale(requestedLang) ? requestedLang : DEFAULT_LOCALE
    return new Response(null, {
      status: HTTP_STATUS.found,
      headers: { location: '/', 'set-cookie': localeCookie(locale, isSecure) },
    })
  }

  if (hasSessionCookie(request)) {
    return new Response(null, { status: HTTP_STATUS.found, headers: { location: '/app' } })
  }

  const locale = negotiateLocale(request)
  const landing = await env.ASSETS.fetch(
    new Request(new URL(`/landing/${locale}.html`, url.origin)),
  )
  if (landing.status === HTTP_STATUS.notFound) {
    return await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)))
  }
  return landing
}
