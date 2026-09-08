/**
 * The languages the client ships in (M18). Shared between the browser and the
 * Worker: the Worker validates the `locale` a user saves against this list, and
 * the client renders the picker and decides text direction from it. No DOM, no
 * imports from either side.
 *
 * `en` is the source of truth for the catalogues; the other locales are
 * translated from it. A locale that fails the translation quality process is
 * removed from this list rather than shipped half-translated (see PLAN.md §4).
 */
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'pt-BR', name: 'Português (Brasil)', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'zh-Hans', name: '简体中文', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]['code']
export type TextDirection = (typeof SUPPORTED_LOCALES)[number]['dir']

/** The language the app falls back to and the source of every catalogue. */
export const DEFAULT_LOCALE: Locale = 'en'

/** Just the codes, in display order; handy for iteration and validation. */
export const LOCALE_CODES: readonly Locale[] = SUPPORTED_LOCALES.map((locale) => locale.code)

const LOCALE_BY_CODE = new Map(SUPPORTED_LOCALES.map((locale) => [locale.code, locale]))

export function isSupportedLocale(value: string): value is Locale {
  return LOCALE_BY_CODE.has(value as Locale)
}

/**
 * First supported locale for a list of BCP-47 tags, matching a bare language to
 * its regional catalogue (`pt` → `pt-BR`, `zh` → `zh-Hans`). Returns null when
 * nothing matches. Shared by the client's detection and the Worker's landing
 * locale negotiation (`Accept-Language`).
 */
export function matchLocale(candidates: readonly string[]): Locale | null {
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) {
      return candidate
    }
    const base = candidate.split('-', 1)[0]
    const regional = SUPPORTED_LOCALES.find((locale) => locale.code.split('-', 1)[0] === base)
    if (regional !== undefined) {
      return regional.code
    }
  }
  return null
}

/** `'rtl'` for Arabic, `'ltr'` for the rest; drives `<html dir>`. */
export function localeDirection(locale: Locale): TextDirection {
  return LOCALE_BY_CODE.get(locale)?.dir ?? 'ltr'
}

export function isRtl(locale: string): boolean {
  return isSupportedLocale(locale) && localeDirection(locale) === 'rtl'
}

/** Where the client persists the chosen locale for a signed-out visitor. */
export const LOCALE_STORAGE_KEY = 'watermark-pro:locale'

/**
 * Cookie that mirrors an explicitly chosen locale (M19). Unlike `localStorage`,
 * a cookie is sent with the request, so the Worker can serve the prerendered
 * landing in the visitor's language. The name is a cookie token (no `:`).
 */
export const LOCALE_COOKIE = 'watermark-pro-locale'

/**
 * Reads a supported locale from a `Cookie` header value, or null. Pure and
 * shared: the client passes `document.cookie`, the Worker the request header.
 */
export function localeFromCookieHeader(header: string | null | undefined): Locale | null {
  if (header == null || header === '') {
    return null
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) {
      continue
    }
    if (part.slice(0, separator).trim() !== LOCALE_COOKIE) {
      continue
    }
    const value = decodeURIComponent(part.slice(separator + 1).trim())
    return isSupportedLocale(value) ? value : null
  }
  return null
}
