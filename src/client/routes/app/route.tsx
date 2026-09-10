import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { AppShell } from '../../components/app-shell'
import { Alert } from '../../components/ui/alert'
import { describeError } from '../../lib/errors'
import { OfflineAccessError } from '../../lib/offline-access'
import { ACCOUNT_CHANGED_EVENT, lockOfflineAccount } from '../../lib/offline-account'
import { currentOfflineUser } from '../../lib/offline-context'
import { clearPendingInvitation } from '../../lib/pending-invitation'
import { activeOrganizationQueryOptions, sessionQueryOptions } from '../../lib/queries'

function subscribeAccount(listener: () => void): () => void {
  window.addEventListener(ACCOUNT_CHANGED_EVENT, listener)
  return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, listener)
}

/**
 * Authenticated area. Online bootstrap verifies the session and ensures a
 * personal workspace, preserving an explicitly selected valid collaboration.
 * Unselected accounts default to personal; revoked selections require recovery.
 */
export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context, location }) => {
    const { loadAppContext } = await import('../../lib/app-bootstrap')
    return await loadAppContext(context.queryClient, location.pathname)
  },
  loader: async ({ context }) => {
    const { loadAppOrganization } = await import('../../lib/app-bootstrap')
    return await loadAppOrganization(context)
  },
  component: AppLayout,
  errorComponent: AppErrorBoundary,
})

function AppErrorBoundary({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  if (error instanceof OfflineAccessError) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
        <Alert title={t('offline.connectionRequired')}>
          {t(error.reason === 'not-prepared' ? 'offline.connectOnce' : 'offline.onlineOnly')}
        </Alert>
        <Link
          to="/app/editor"
          className="min-h-11 py-3 text-brand-700 underline dark:text-brand-300"
        >
          {t('shell.nav.editor')}
        </Link>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-xl p-8">
      <Alert tone="error" title={t('root.somethingWentWrong')}>
        {describeError(error)}
      </Alert>
    </main>
  )
}

function AppLayout() {
  const { t } = useTranslation()
  const { session, organizations, selectionRequired } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeAccount = useSyncExternalStore(subscribeAccount, currentOfflineUser)
  // Online navigation validates the live account before private content paints.
  // Keep checking on focus/reconnect; a prepared offline display snapshot never
  // overrides an authoritative sign-out discovered by these observers.
  const liveSession = useQuery({
    ...sessionQueryOptions,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  useEffect(() => {
    if (liveSession.data === null) {
      lockOfflineAccount(queryClient)
      void navigate({ to: '/login' })
    } else if (liveSession.data !== undefined && liveSession.data.user.id !== session.user.id) {
      queryClient.clear()
      window.location.assign('/app')
    } else if (liveSession.data !== undefined) {
      clearPendingInvitation()
    }
  }, [liveSession.data, navigate, queryClient, session.user.id])
  const initialOrganization = Route.useLoaderData()
  const { data: organization } = useQuery({
    ...activeOrganizationQueryOptions,
    initialData: initialOrganization,
    enabled: organizations.length > 0 && !selectionRequired,
  })
  // Do not paint the old account while a cookie change is being reconciled.
  if (
    activeAccount !== session.user.id ||
    liveSession.data === null ||
    (liveSession.data !== undefined && liveSession.data.user.id !== session.user.id)
  ) {
    return null
  }
  const displayedOrganization =
    selectionRequired || organization?.id !== session.session.activeOrganizationId
      ? null
      : organization
  return (
    <AppShell session={session} organization={displayedOrganization} organizations={organizations}>
      {selectionRequired ? <Alert tone="info">{t('shell.chooseOrganization')}</Alert> : <Outlet />}
    </AppShell>
  )
}
