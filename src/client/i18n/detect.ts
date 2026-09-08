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
  matchLocale,
} from '../../shared/locales'

const COOKIE_MAX_AGE_SECONDS = 31_536_000

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
