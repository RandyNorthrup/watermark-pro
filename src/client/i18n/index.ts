/**
 * The i18next instance and the locale lifecycle (M18). English is bundled with
 * the app so the first paint never waits on a network fetch; the other twelve
 * catalogues are code-split and loaded on demand when the user switches. The
 * chosen locale drives `<html lang>` and `dir`, and is persisted to
 * `localStorage` (and, for a signed-in user, to their account by the caller).
 */
// `use` is aliased so it neither shadows React's `use` hook (the hooks lint rule
// keys on any `use*` name) nor reads as a default-member access.
import i18next, { changeLanguage, use as registerPlugin } from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

import { detectLocale } from './detect'
import {
  DEFAULT_LOCALE,
  isRtl,
  isSupportedLocale,
  type Locale,
  LOCALE_STORAGE_KEY,
} from '../../shared/locales'
import en from '../locales/en/common.json'

const NAMESPACE = 'common'

/**
 * Every non-English catalogue, code-split; the key is the module path. English
 * is excluded because it is statically imported and bundled with the app.
 */
const catalogueLoaders = import.meta.glob<{ default: Record<string, unknown> }>([
  '../locales/*/common.json',
  '!../locales/en/common.json',
])

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
  if (locale === DEFAULT_LOCALE || i18next.hasResourceBundle(locale, NAMESPACE)) {
    return
  }
  const loader = catalogueLoaders[loaderKey(locale)]
  if (loader === undefined) {
    return
  }
  const module = await loader()
  i18next.addResourceBundle(locale, NAMESPACE, module.default, true, true)
}

async function runInit(locale: Locale): Promise<void> {
  await registerPlugin(initReactI18next).init({
    resources: { [DEFAULT_LOCALE]: { [NAMESPACE]: en } },
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

/** Initialises i18next once with English bundled, then switches to `locale`. */
export function initI18n(locale: Locale = detectLocale()): Promise<void> {
  initState.promise ??= runInit(locale)
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
}

/** The active locale, narrowed to a supported one (defaults to English). */
export function useLocale(): Locale {
  const { i18n } = useTranslation()
  return isSupportedLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE
}
