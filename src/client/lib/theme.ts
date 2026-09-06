export const THEMES = ['system', 'light', 'dark'] as const

/** What the user chose; `system` follows the operating system. */
export type Theme = (typeof THEMES)[number]

type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'watermark-pro.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** Reads the stored preference; storage may be unavailable in private modes. */
export function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== 'system') {
    return theme
  }
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Applies a preference to the document and persists it when storage allows.
 * `data-theme` always carries the resolved value so CSS never has to reason
 * about the system setting itself.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = resolve(theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage is a convenience; the theme still applies for this page view.
  }
}

function reapplySystemTheme(): void {
  if (readTheme() === 'system') {
    applyTheme('system')
  }
}

/** Keeps a `system` preference in sync when the operating system switches. */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', reapplySystemTheme)
  return () => {
    media.removeEventListener('change', reapplySystemTheme)
  }
}
