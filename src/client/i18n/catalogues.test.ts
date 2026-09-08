/**
 * Keeps every shipped translation complete and correct against the English
 * source (M18). For each locale catalogue that exists it checks: the same key
 * set as English (allowing each locale's own plural categories), no empty
 * strings, every `{{placeholder}}` and `<Trans>` tag preserved, and — for
 * plural groups — exactly the plural forms `Intl.PluralRules` requires for that
 * locale. A missing key, a dropped placeholder or an incomplete plural fails
 * here rather than rendering a blank or a broken interpolation to a user.
 */
import { describe, expect, it } from 'vitest'

import { isSupportedLocale, type Locale } from '../../shared/locales'
import en from '../locales/en/common.json'

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'] as const

type Catalogue = Record<string, unknown>

const catalogueModules = import.meta.glob<Catalogue>('../locales/*/common.json', {
  eager: true,
  import: 'default',
})

/** locale code -> catalogue, for every non-English catalogue file present. */
const translations = new Map<Locale, Catalogue>()
for (const [path, catalogue] of Object.entries(catalogueModules)) {
  const code = path.split('/').at(-2)
  if (code !== undefined && code !== 'en' && isSupportedLocale(code)) {
    translations.set(code, catalogue)
  }
}

/** All leaf paths (dot-joined) with their string values. */
function flatten(object: Catalogue, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(object)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value !== null && typeof value === 'object') {
      for (const [innerPath, innerValue] of flatten(value as Catalogue, path)) {
        out.set(innerPath, innerValue)
      }
    }
  }
  return out
}

function pluralParts(path: string): { base: string; suffix: string } | null {
  for (const suffix of PLURAL_SUFFIXES) {
    if (path.endsWith(suffix)) {
      return { base: path.slice(0, -suffix.length), suffix }
    }
  }
  return null
}

/** `{{name}}` interpolations and `<tag>`/`</tag>` markers, as a comparable set. */
function tokensOf(value: string): Set<string> {
  const tokens = new Set<string>()
  for (const match of value.matchAll(/\{\{[^}]+\}\}/g)) {
    tokens.add(match[0])
  }
  for (const match of value.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
    tokens.add(match[0])
  }
  return tokens
}

const enFlat = flatten(en)
/** Non-plural English keys, and the set of plural bases. */
const enSingular = new Map<string, string>()
const enPluralBases = new Map<string, string>()
for (const [path, value] of enFlat) {
  const plural = pluralParts(path)
  if (plural === null) {
    enSingular.set(path, value)
  } else if (plural.suffix === '_other') {
    enPluralBases.set(plural.base, value)
  }
}

function pluralCategories(locale: Locale): string[] {
  return [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories]
}

const byText = (a: string, b: string): number => a.localeCompare(b)

describe('translation catalogues', () => {
  it('has at least one translation to check', () => {
    // A guard so this file is never silently a no-op if the glob breaks.
    expect(translations.size).toBeGreaterThan(0)
  })

  for (const [locale, catalogue] of translations) {
    describe(locale, () => {
      const flat = flatten(catalogue)

      it('translates every singular English key, non-empty', () => {
        for (const [path] of enSingular) {
          const value = flat.get(path)
          expect(value, `${locale} missing ${path}`).toBeDefined()
          expect((value ?? '').trim().length, `${locale} empty ${path}`).toBeGreaterThan(0)
        }
      })

      it('preserves every placeholder and tag of the singular keys', () => {
        for (const [path, enValue] of enSingular) {
          const value = flat.get(path) ?? ''
          expect([...tokensOf(value)].toSorted(byText), `${locale} tokens ${path}`).toEqual(
            [...tokensOf(enValue)].toSorted(byText),
          )
        }
      })

      it('supplies the plural forms this locale requires', () => {
        const categories = pluralCategories(locale)
        for (const [base, enOther] of enPluralBases) {
          for (const category of categories) {
            const value = flat.get(`${base}_${category}`)
            expect(value, `${locale} missing ${base}_${category}`).toBeDefined()
            expect(
              (value ?? '').trim().length,
              `${locale} empty ${base}_${category}`,
            ).toBeGreaterThan(0)
          }
          // The `other` form carries the count in English; the translation's
          // must too (the singular forms may spell a literal number instead).
          const other = flat.get(`${base}_other`) ?? ''
          for (const token of tokensOf(enOther)) {
            expect(tokensOf(other).has(token), `${locale} ${base}_other dropped ${token}`).toBe(
              true,
            )
          }
        }
      })

      it('adds no key English does not have', () => {
        for (const path of flat.keys()) {
          const plural = pluralParts(path)
          const isKnown = plural === null ? enSingular.has(path) : enPluralBases.has(plural.base)
          expect(isKnown, `${locale} unexpected key ${path}`).toBe(true)
        }
      })
    })
  }
})
