import { useQuery } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { type ButtonHTMLAttributes, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { sessionQueryOptions } from '../lib/queries'
import { Button } from './ui/button'
import { deferredComponent, useDeferredOverlay } from './ui/deferred-overlay'

const { Component: LanguageDropdown, preload: preloadDropdown } = deferredComponent(async () => {
  const { LanguageDropdown: dropdown } = await import('./language-dropdown')
  return dropdown
})

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
 * menu itself loads when someone first reaches for the trigger
 * (`useDeferredOverlay`); a closed menu had cost every sign-in page 32 kB gzip
 * of route code (PLAN.md §5.5).
 */
export function LanguageMenu() {
  const { data: session } = useQuery(sessionQueryOptions)
  const { opening, triggerProps } = useDeferredOverlay(preloadDropdown, 'menu')

  if (opening === null) return <LanguageTrigger {...triggerProps} />
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
