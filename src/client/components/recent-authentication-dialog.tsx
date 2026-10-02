import { ShieldCheck } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { Button } from './ui/button'
import { buttonVariants } from './ui/button-variants'
import { loginSearchSchema } from '../../shared/client-search'
import { dismissRecentAuthentication } from '../lib/recent-authentication'

/** A fresh sign-in returns to a bounded internal page; the user chooses whether to retry. */
export function RecentAuthenticationDialog() {
  const { t } = useTranslation()
  const destination = loginSearchSchema.safeParse({
    redirect: `${window.location.pathname}${window.location.search}`,
  })
  const href =
    destination.success && destination.data.redirect !== undefined
      ? `/login?redirect=${encodeURIComponent(destination.data.redirect)}`
      : '/login'
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) dismissRecentAuthentication()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 top-[max(1rem,20dvh)] z-50 mx-auto flex max-h-[75dvh] max-w-md flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-surface-raised p-6 shadow-card focus:outline-none">
          <div className="flex items-center gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="size-6 shrink-0 text-brand-700 dark:text-brand-300"
            />
            <Dialog.Title className="text-lg font-semibold">{t('auth.recent.title')}</Dialog.Title>
          </div>
          <Dialog.Description className="text-sm leading-relaxed text-ink-muted">
            {t('auth.recent.body')}
          </Dialog.Description>
          <div className="flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="secondary">{t('auth.recent.cancel')}</Button>
            </Dialog.Close>
            <a href={href} onClick={dismissRecentAuthentication} className={buttonVariants()}>
              {t('auth.recent.signIn')}
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
