import { useQuery } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { type ButtonHTMLAttributes, lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { sessionQueryOptions } from '../lib/queries'
import { Button } from './ui/button'

async function loadDropdown() {
  return await import('./language-dropdown')
}

function preloadDropdown(): void {
  void loadDropdown()
}

const LanguageDropdown = lazy(async () => {
  const { LanguageDropdown: dropdown } = await loadDropdown()
  return { default: dropdown }
})

/** Keys that open a menu button, as the loaded menu's own trigger handles them. */
const OPENING_KEYS = new Set(['Enter', ' ', 'ArrowDown'])

function LanguageTrigger(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('language.menuLabel')}
      {...props}
    >
      <Languages aria-hidden />
    </Button>
  )
}

/**
 * Picks the interface language (M18), from the app chrome and the signed-out
 * landing/auth pages; the account save only runs when there is a session. The
 * menu's focus, positioning and dismissal code loads when someone first
 * reaches for the trigger (hover, focus or press) rather than with the page:
 * evaluating it for a closed menu was 40 % of the sign-in page's route-code task
 * on a phone (PLAN.md §5.5).
 */
export function LanguageMenu() {
  const { data: session } = useQuery(sessionQueryOptions)
  const [opening, setOpening] = useState<{ isKeyboardOpen: boolean } | null>(null)

  if (opening === null) {
    return (
      <LanguageTrigger
        aria-haspopup="menu"
        aria-expanded={false}
        onPointerEnter={preloadDropdown}
        onFocus={preloadDropdown}
        onPointerDown={(event) => {
          if (event.button === 0 && !event.ctrlKey) setOpening({ isKeyboardOpen: false })
        }}
        onKeyDown={(event) => {
          if (!OPENING_KEYS.has(event.key)) return
          event.preventDefault()
          setOpening({ isKeyboardOpen: true })
        }}
      />
    )
  }
  return (
    <Suspense fallback={<LanguageTrigger aria-haspopup="menu" aria-expanded={false} aria-busy />}>
      <LanguageDropdown
        trigger={<LanguageTrigger />}
        session={session}
        isKeyboardOpen={opening.isKeyboardOpen}
      />
    </Suspense>
  )
}
