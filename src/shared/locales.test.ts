import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  isRtl,
  isSupportedLocale,
  LOCALE_CODES,
  localeDirection,
  localeFromCookieHeader,
  SUPPORTED_LOCALES,
} from './locales'

describe('supported locales', () => {
  it('offers twelve locales including exactly one right-to-left', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(12)
    expect(
      SUPPORTED_LOCALES.filter((locale) => locale.dir === 'rtl').map((locale) => locale.code),
    ).toEqual(['ar'])
  })

  it('starts from English as the source locale', () => {
    expect(DEFAULT_LOCALE).toBe('en')
    expect(LOCALE_CODES[0]).toBe('en')
  })

  it('gives every locale a non-empty native name', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.name.length).toBeGreaterThan(0)
    }
  })

  it('recognises supported codes and rejects others', () => {
    expect(isSupportedLocale('pt-BR')).toBe(true)
    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('pt')).toBe(false)
    expect(isSupportedLocale('klingon')).toBe(false)
  })

  it('reports direction, right-to-left only for Arabic', () => {
    expect(localeDirection('ar')).toBe('rtl')
    expect(localeDirection('en')).toBe('ltr')
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('de')).toBe(false)
    expect(isRtl('not-a-locale')).toBe(false)
  })
})

describe('localeFromCookieHeader', () => {
  it('reads a supported locale from among several cookies', () => {
    expect(localeFromCookieHeader('theme=dark; watermark-pro-locale=pt-BR; other=1')).toBe('pt-BR')
  })

  it('returns null for a missing, empty or unsupported cookie', () => {
    expect(localeFromCookieHeader(null)).toBeNull()
    expect(localeFromCookieHeader('')).toBeNull()
    expect(localeFromCookieHeader('theme=dark')).toBeNull()
    expect(localeFromCookieHeader('watermark-pro-locale=klingon')).toBeNull()
  })
})
