export const THEMES = ['system', 'light', 'dark'] as const

/** What the user chose; `system` follows the operating system. */
export type Theme = (typeof THEMES)[number]

type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'watermark-pro.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/**
 * Browser chrome colour (the iPhone status bar, Android's toolbar) per
 * resolved theme: the raised surface colour from src/client/styles/app.css,
 * as sRGB hex because the meta tag takes no oklch.
 */
const CHROME_COLOURS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#26242f' }

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
  const resolved = resolve(theme)
  document.documentElement.dataset['theme'] = resolved
  // index.html ships one theme-color per system scheme for the first paint;
  // once the app decides, both carry the resolved colour so a manual choice
  // wins over the system setting in the browser chrome too.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', CHROME_COLOURS[resolved])
  }
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
