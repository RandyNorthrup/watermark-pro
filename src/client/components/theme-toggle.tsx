import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applyTheme, readTheme, type Theme } from '../lib/theme'
import { Button } from './ui/button'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const
const THEME_LABEL_KEY = {
  system: 'shell.theme.system',
  light: 'shell.theme.light',
  dark: 'shell.theme.dark',
} as const

/**
 * Cycles system → light → dark; the choice persists per browser. `data-prerender`
 * marks the landing's toggle so the prerender script (scripts/prerender.mjs) can
 * find and replace it with the no-JS language switcher on the static landing.
 */
export function ThemeToggle({
  'data-prerender': dataPrerender,
}: { 'data-prerender'?: string } = {}) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(readTheme)

  const Icon = THEME_ICON[theme]
  const label = t(THEME_LABEL_KEY[theme])
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      data-prerender={dataPrerender}
      onClick={() => {
        const next = NEXT_THEME[theme]
        applyTheme(next)
        setTheme(next)
      }}
    >
      <Icon aria-hidden="true" className="size-4" />
    </Button>
  )
}
