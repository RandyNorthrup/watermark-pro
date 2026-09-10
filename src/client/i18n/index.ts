/**
 * The i18next instance and the locale lifecycle. Browser builds fetch English
 * and the chosen catalogue as local JSON assets; static rendering and unit tests
 * supply the checked-in catalogues directly. Other catalogues load on demand. The
 * chosen locale drives `<html lang>` and `dir`, and is persisted to
 * `localStorage` (and, for a signed-in user, to their account by the caller).
 */
// `use` is aliased so it neither shadows React's `use` hook (the hooks lint rule
// keys on any `use*` name) nor reads as a default-member access.
import i18next, { changeLanguage, use as registerPlugin } from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { z } from 'zod/mini'

import { detectLocale, writeLocaleCookie } from './detect'
import {
  DEFAULT_LOCALE,
  isRtl,
  isSupportedLocale,
  type Locale,
  LOCALE_STORAGE_KEY,
} from '../../shared/locales'

const NAMESPACE = 'common'

/**
 * Every catalogue has its own local URL, including the English base. Eagerly
 * importing URLs adds no translation payload to the application boot module.
 */
const catalogueUrls = import.meta.glob<string>('../locales/*/common.json', {
  eager: true,
  query: '?url',
  import: 'default',
})
const catalogueSchema = z.record(z.string(), z.unknown())
type Catalogues = Partial<Record<Locale, Record<string, unknown>>>

function loaderKey(locale: Locale): string {
  return `../locales/${locale}/common.json`
}

function applyDocumentLocale(locale: string): void {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = locale
  document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr'
}

async function loadCatalogue(locale: Locale): Promise<void> {
  if (i18next.hasResourceBundle(locale, NAMESPACE)) {
    return
  }
  i18next.addResourceBundle(locale, NAMESPACE, await readCatalogue(locale), true, true)
}

async function readCatalogue(locale: Locale): Promise<Record<string, unknown>> {
  const url = catalogueUrls[loaderKey(locale)]
  if (url === undefined) throw new Error(`Language files are unavailable for ${locale}.`)
  const response = await fetch(url)
  if (!response.ok) throw new Error('Language files could not load. Reconnect and reload.')
  return catalogueSchema.parse(await response.json())
}

async function runInit(locale: Locale, catalogues: Catalogues): Promise<void> {
  const english = catalogues.en ?? (await readCatalogue(DEFAULT_LOCALE))
  const resources = Object.fromEntries(
    Object.entries(catalogues).map(([code, catalogue]) => [code, { [NAMESPACE]: catalogue }]),
  )
  await registerPlugin(initReactI18next).init({
    resources: { ...resources, [DEFAULT_LOCALE]: { [NAMESPACE]: english } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    ns: [NAMESPACE],
    defaultNS: NAMESPACE,
    returnNull: false,
    // React already escapes interpolated values, so i18next must not double-escape.
    interpolation: { escapeValue: false },
  })
  if (locale !== DEFAULT_LOCALE) {
    await loadCatalogue(locale)
    await changeLanguage(locale)
  }
  applyDocumentLocale(i18next.language)
}

// A property on a module object, not a reassigned top-level binding, so the
// once-only guard passes `unicorn/no-top-level-assignment-in-function`.
const initState: { promise: Promise<void> | null } = { promise: null }

/** Initialises i18next once with the English base, then switches to `locale`. */
export function initI18n(
  locale: Locale = detectLocale(),
  catalogues: Catalogues = {},
): Promise<void> {
  initState.promise ??= runInit(locale, catalogues)
  return initState.promise
}

/** Switches the active locale, loading its catalogue first, and updates `<html>`. */
export async function setLocale(locale: Locale): Promise<void> {
  await loadCatalogue(locale)
  await changeLanguage(locale)
  applyDocumentLocale(locale)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // A private window may refuse storage; the in-memory switch still applied.
  }
  // Mirror to a cookie so the Worker serves the prerendered landing in this
  // language on the next visit (localStorage is invisible to the edge).
  writeLocaleCookie(locale)
}

/** A failed optional locale may use English; a missing base catalogue must not render untranslated keys. */
export function hasInterfaceLanguage(): boolean {
  return i18next.isInitialized && i18next.hasResourceBundle(DEFAULT_LOCALE, NAMESPACE)
}

/** The active locale, narrowed to a supported one (defaults to English). */
export function useLocale(): Locale {
  const { i18n } = useTranslation()
  return isSupportedLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE
}
