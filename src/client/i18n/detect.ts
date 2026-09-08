/**
 * Choosing the interface language (M18), kept apart from the i18next runtime in
 * `index.ts` so the precedence logic is unit-tested directly: a saved preference
 * wins, then the browser's languages, then English.
 */
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type Locale,
  LOCALE_COOKIE,
  localeFromCookieHeader,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from '../../shared/locales'

const COOKIE_MAX_AGE_SECONDS = 31_536_000

/**
 * First supported locale for a list of BCP-47 tags, matching a bare language to
 * its regional catalogue (`pt` → `pt-BR`, `zh` → `zh-Hans`). Returns null when
 * nothing matches so the caller can fall back to English.
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

/** The locale saved by a previous visit, or null when unset or unsupported. */
export function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored !== null && isSupportedLocale(stored) ? stored : null
  } catch {
    return null
  }
}

/** The locale mirrored to a cookie by a previous explicit choice, or null. */
export function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') {
    return null
  }
  return localeFromCookieHeader(document.cookie)
}

/**
 * Mirrors an explicit choice to the {@link LOCALE_COOKIE} so the Worker can
 * serve the prerendered landing in the same language on the next visit.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') {
    return
  }
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${String(COOKIE_MAX_AGE_SECONDS)}; SameSite=Lax${secure}`
}

/** Saved preference (storage or cookie) → browser languages → English. */
export function detectLocale(
  navigatorLanguages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages,
): Locale {
  return (
    readStoredLocale() ?? readLocaleCookie() ?? matchLocale(navigatorLanguages) ?? DEFAULT_LOCALE
  )
}
