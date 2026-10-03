import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { lazy, Suspense, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '../components/ui/button-variants'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'

const CleanupNotice = lazy(async () => {
  const module = await import('../components/account-cleanup-notice')
  return { default: module.AccountCleanupNotice }
})

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  const { accountCleanup } = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  return (
    <>
      <Outlet />
      {accountCleanup === null ? null : (
        <Suspense fallback={null}>
          <CleanupNotice />
        </Suspense>
      )}
    </>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t('root.notFound.title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('root.notFound.body')}</p>
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        {t('root.notFound.back')}
      </Link>
    </main>
  )
}
