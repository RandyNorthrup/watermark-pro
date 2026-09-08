import { afterEach, describe, expect, it } from 'vitest'

import { detectLocale, readLocaleCookie, readStoredLocale, writeLocaleCookie } from './detect'
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, matchLocale } from '../../shared/locales'

afterEach(() => {
  localStorage.clear()
  document.cookie = `${LOCALE_COOKIE}=; Max-Age=0; Path=/`
})

describe('matchLocale', () => {
  it('takes an exact supported tag', () => {
    expect(matchLocale(['de', 'en'])).toBe('de')
  })

  it('matches a bare language to its regional catalogue', () => {
    expect(matchLocale(['pt'])).toBe('pt-BR')
    expect(matchLocale(['zh'])).toBe('zh-Hans')
    expect(matchLocale(['en-US'])).toBe('en')
  })

  it('skips unsupported tags and keeps looking', () => {
    expect(matchLocale(['xx', 'yy', 'fr'])).toBe('fr')
  })

  it('returns null when nothing matches', () => {
    expect(matchLocale(['xx', 'klingon'])).toBeNull()
  })
})

describe('readStoredLocale', () => {
  it('returns a stored supported locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ja')
    expect(readStoredLocale()).toBe('ja')
  })

  it('ignores an unset or unsupported stored value', () => {
    expect(readStoredLocale()).toBeNull()
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon')
    expect(readStoredLocale()).toBeNull()
  })
})

describe('locale cookie', () => {
  it('round-trips a chosen locale through the cookie', () => {
    writeLocaleCookie('ar')
    expect(readLocaleCookie()).toBe('ar')
  })

  it('reads null when the cookie is unset or unsupported', () => {
    expect(readLocaleCookie()).toBeNull()
    document.cookie = `${LOCALE_COOKIE}=klingon; Path=/`
    expect(readLocaleCookie()).toBeNull()
  })
})

describe('detectLocale', () => {
  it('prefers a saved locale over the browser languages', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko')
    expect(detectLocale(['fr', 'en'])).toBe('ko')
  })

  it('uses the cookie when nothing is stored, but storage wins over the cookie', () => {
    writeLocaleCookie('ja')
    expect(detectLocale(['fr', 'en'])).toBe('ja')
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko')
    expect(detectLocale(['fr', 'en'])).toBe('ko')
  })

  it('falls back to the browser languages, then to English', () => {
    expect(detectLocale(['fr', 'en'])).toBe('fr')
    expect(detectLocale(['xx'])).toBe('en')
  })
})
