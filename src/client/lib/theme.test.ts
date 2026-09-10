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

  it('resolves system to the media query, persists the preference and tints the browser chrome', () => {
    const metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((media) => {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.media = media
      document.head.append(meta)
      return meta
    })
    try {
      stubMatchMedia(true)
      applyTheme('system')
      expect(document.documentElement.dataset['theme']).toBe('dark')
      expect(readTheme()).toBe('system')
      expect(metas.map((meta) => meta.content)).toEqual(['#211d21', '#211d21'])

      applyTheme('light')
      expect(document.documentElement.dataset['theme']).toBe('light')
      expect(readTheme()).toBe('light')
      expect(metas.map((meta) => meta.content)).toEqual(['#ffffff', '#ffffff'])
    } finally {
      for (const meta of metas) {
        meta.remove()
      }
    }
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

  it('uses the selected picture theme even when it differs from the operating system', () => {
    const source = document.createElement('source')
    source.dataset['themePicture'] = 'dark'
    source.media = '(prefers-color-scheme: dark)'
    document.body.append(source)
    try {
      stubMatchMedia(true)
      applyTheme('light')
      expect(source.media).toBe('not all')
      applyTheme('dark')
      expect(source.media).toBe('all')
      stubMatchMedia(false)
      applyTheme('system')
      expect(source.media).toBe('not all')
    } finally {
      source.remove()
    }
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
