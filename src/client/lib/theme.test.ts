import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, readTheme, watchSystemTheme } from './theme'

function stubMatchMedia(isDark: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: isDark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    media,
    listeners,
    fire: () => {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset['theme']
})

describe('theme', () => {
  it('defaults to system when nothing is stored or the value is garbage', () => {
    expect(readTheme()).toBe('system')
    window.localStorage.setItem('watermark-pro.theme', 'sepia')
    expect(readTheme()).toBe('system')
  })

  it('resolves system to the media query and persists the preference', () => {
    stubMatchMedia(true)
    applyTheme('system')
    expect(document.documentElement.dataset['theme']).toBe('dark')
    expect(readTheme()).toBe('system')

    applyTheme('light')
    expect(document.documentElement.dataset['theme']).toBe('light')
    expect(readTheme()).toBe('light')
  })

  it('follows system changes only while the preference is system', () => {
    const stub = stubMatchMedia(false)
    applyTheme('system')
    expect(document.documentElement.dataset['theme']).toBe('light')
    const stop = watchSystemTheme()
    stub.media.matches = true
    stub.fire()
    expect(document.documentElement.dataset['theme']).toBe('dark')

    applyTheme('light')
    stub.media.matches = false
    stub.fire()
    expect(document.documentElement.dataset['theme']).toBe('light')
    stop()
    expect(stub.listeners.size).toBe(0)
  })

  it('survives storage being unavailable', () => {
    stubMatchMedia(false)
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTheme()).toBe('system')
    expect(() => {
      applyTheme('dark')
    }).not.toThrow()
    expect(document.documentElement.dataset['theme']).toBe('dark')
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
