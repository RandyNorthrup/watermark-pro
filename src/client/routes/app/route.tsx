import { type QueryClient, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  Outlet,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AppShell } from '../../components/app-shell'
import { Alert } from '../../components/ui/alert'
import { authClient } from '../../lib/auth-client'
import { describeError } from '../../lib/errors'
import {
  activeOrganizationQueryOptions,
  organizationsQueryOptions,
  sessionQueryOptions,
} from '../../lib/queries'

const NEW_ORGANIZATION_PATH = '/app/organizations/new'

/** Starts the active-organization request; a failure is reported by the loader's own request. */
async function warmActiveOrganization(queryClient: QueryClient): Promise<void> {
  try {
    await queryClient.query(activeOrganizationQueryOptions)
  } catch {
    // Reported when the loader asks for it.
  }
}

/**
 * Authenticated area. Requires a session and, except on the organization
 * creation screen, at least one organization; the first organization becomes
 * active automatically when none is.
 */
export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context, location }) => {
    const { queryClient } = context
    // Render the app frame from the cache (the last visit's, hydrated by the
    // persister, or this session's) so it paints without waiting on the session
    // → organization fetch chain (PLAN §2); only a cold visit with no cache
    // blocks. Mutations that change these queries refresh the cache first
    // (refetchShellQueries), so a cache read here is never stale after one. A
    // background revalidation runs regardless — never awaited, and paused when
    // offline — and AppLayout redirects to /login if it later finds no session.
    const cachedSession = queryClient.getQueryData(sessionQueryOptions.queryKey)
    const session = cachedSession ?? (await queryClient.query(sessionQueryOptions))
    if (session === null) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
    const cachedOrganizations = queryClient.getQueryData(organizationsQueryOptions.queryKey)
    const organizations =
      cachedOrganizations ?? (await queryClient.query(organizationsQueryOptions))
    if (cachedSession !== undefined) {
      void queryClient.query({ ...sessionQueryOptions, staleTime: 0 })
    }
    if (cachedOrganizations !== undefined) {
      void queryClient.query({ ...organizationsQueryOptions, staleTime: 0 })
    }
    if (session.session.activeOrganizationId !== null) {
      void warmActiveOrganization(queryClient)
    }
    const isCreating = location.pathname === NEW_ORGANIZATION_PATH
    if (!isCreating && organizations.length === 0) {
      throw redirect({ to: NEW_ORGANIZATION_PATH })
    }
    const firstOrganization = organizations[0]
    if (firstOrganization !== undefined && session.session.activeOrganizationId === null) {
      await authClient.organization.setActive({ organizationId: firstOrganization.id })
      await queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey })
    }
    return { session, organizations }
  },
  loader: async ({ context }) => {
    if (context.organizations.length === 0) {
      return null
    }
    // Use the cached active organization when present (non-blocking) and
    // revalidate in the background; only a cold visit awaits the request.
    const cached = context.queryClient.getQueryData(activeOrganizationQueryOptions.queryKey)
    if (cached !== undefined) {
      void context.queryClient.query({ ...activeOrganizationQueryOptions, staleTime: 0 })
      return cached
    }
    return await context.queryClient.query(activeOrganizationQueryOptions)
  },
  component: AppLayout,
  errorComponent: AppErrorBoundary,
})

function AppErrorBoundary({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-xl p-8">
      <Alert tone="error" title={t('root.somethingWentWrong')}>
        {describeError(error)}
      </Alert>
    </main>
  )
}

function AppLayout() {
  const { session, organizations } = Route.useRouteContext()
  const navigate = useNavigate()
  // The route may have rendered from a cached session (PLAN §2); if the
  // background revalidation finds it is gone, leave for /login.
  const liveSession = useQuery(sessionQueryOptions)
  useEffect(() => {
    if (liveSession.data === null) {
      void navigate({ to: '/login' })
    }
  }, [liveSession.data, navigate])
  const initialOrganization = Route.useLoaderData()
  const { data: organization } = useQuery({
    ...activeOrganizationQueryOptions,
    initialData: initialOrganization,
    enabled: organizations.length > 0,
  })
  return (
    <AppShell session={session} organization={organization ?? null} organizations={organizations}>
      <Outlet />
    </AppShell>
  )
}
