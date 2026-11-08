import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NavigationMenuTrigger } from './shell-triggers'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'

/**
 * The phone navigation sheet, loaded by the app shell the first time someone
 * reaches for the menu button and mounted already open. `children` receives a
 * close callback for in-sheet navigation.
 */
export function MobileMenuSheet({ children }: { children: (close: () => void) => ReactNode }) {
  const { t } = useTranslation()
  // Keep an inactive link mounted until the router commits its destination.
  // Synchronously closing the sheet can cancel a WebKit link navigation; the
  // location-keyed shell remounts it closed after the router commits.
  const [isOpen, setIsOpen] = useState(true)
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <NavigationMenuTrigger />
      </SheetTrigger>
      <SheetContent
        title={t('shell.menu')}
        description={t('shell.menuDescription')}
        isDescriptionHidden
      >
        {children(() => {
          setIsOpen(false)
        })}
      </SheetContent>
    </Sheet>
  )
}
