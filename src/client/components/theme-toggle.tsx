import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { applyTheme, readTheme, type Theme } from '../lib/theme'
import { Button } from './ui/button'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theme: follows system. Switch to light',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to system',
}

/** Cycles system → light → dark; the choice persists per browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const Icon = THEME_ICON[theme]
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={THEME_LABEL[theme]}
      title={THEME_LABEL[theme]}
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
