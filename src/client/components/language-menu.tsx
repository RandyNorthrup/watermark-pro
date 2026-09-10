import { useQuery } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { type Locale, SUPPORTED_LOCALES } from '../../shared/locales'
import { setLocale, useLocale } from '../i18n'
import { saveLocale } from '../lib/locale-api'
import { captureOfflineGeneration } from '../lib/offline-context'
import { sessionQueryOptions } from '../lib/queries'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

/**
 * Picks the interface language (M18). Shows every supported locale by its
 * native name; choosing one applies immediately, persists to `localStorage`,
 * and updates `<html lang>`/`dir`. Signed-in callers additionally save it to the
 * account. Reached from the app chrome and the signed-out landing/auth pages,
 * so the account save only runs when there is a session.
 */
export function LanguageMenu() {
  const { t } = useTranslation()
  const active = useLocale()
  const { data: session } = useQuery(sessionQueryOptions)

  async function choose(locale: Locale): Promise<void> {
    // Bind the user's action before a catalogue download can yield to an
    // account change. Public/local language choices need no private owner.
    const account =
      session === undefined || session === null
        ? null
        : {
            userId: session.user.id,
            sessionId: session.session.id,
            ...captureOfflineGeneration(),
          }
    await setLocale(locale)
    if (account !== null) {
      try {
        await saveLocale(locale, account)
      } catch {
        // The language already switched locally and is saved in localStorage;
        // the account copy is best-effort and retried on the next change.
      }
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('language.menuLabel')}>
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" landmarkLabel={t('language.menuLabel')}>
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale.code}
            onSelect={() => void choose(locale.code)}
            aria-current={locale.code === active}
          >
            {locale.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
