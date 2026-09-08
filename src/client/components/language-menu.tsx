import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SUPPORTED_LOCALES } from '../../shared/locales'
import { setLocale, useLocale } from '../i18n'
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
 * account. Reached from the app chrome and the signed-out landing/auth pages.
 */
export function LanguageMenu() {
  const { t } = useTranslation()
  const active = useLocale()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('language.menuLabel')}>
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale.code}
            onSelect={() => void setLocale(locale.code)}
            aria-current={locale.code === active}
          >
            {locale.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
