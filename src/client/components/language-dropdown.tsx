import { type ReactElement, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { type Locale, SUPPORTED_LOCALES } from '../../shared/locales'
import type { ShellSession } from '../../shared/shell-cache'
import { setLocale, useLocale } from '../i18n'
import { saveLocale } from '../lib/locale-api'
import { captureOfflineGeneration } from '../lib/offline-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

/**
 * The language chooser itself, loaded by `LanguageMenu` the first time someone
 * reaches for its trigger and mounted already open. Choosing a locale applies
 * it immediately, persists it to `localStorage` and updates `<html lang>`/`dir`;
 * a signed-in caller also saves it to the account.
 */
export function LanguageDropdown({
  trigger,
  session,
  isKeyboardOpen,
}: {
  trigger: ReactElement
  session: ShellSession | null | undefined
  /** Opened from the keyboard: focus starts on the first language, as it would on later opens. */
  isKeyboardOpen: boolean
}) {
  const { t } = useTranslation()
  const active = useLocale()
  const firstItem = useRef<HTMLDivElement>(null)
  // The keypress that opened the menu happened before it existed, so it focuses
  // its content as for a pointer; hand that first focus on once. Later openings
  // track keyboard use themselves.
  const pendingKeyboardFocus = useRef(isKeyboardOpen)

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
    <DropdownMenu modal={false} defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        landmarkLabel={t('language.menuLabel')}
        onFocus={(event) => {
          if (!pendingKeyboardFocus.current || event.target !== event.currentTarget) return
          pendingKeyboardFocus.current = false
          firstItem.current?.focus()
        }}
      >
        {SUPPORTED_LOCALES.map((locale, index) => (
          <DropdownMenuItem
            key={locale.code}
            ref={index === 0 ? firstItem : undefined}
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
