import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

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

/**
 * Authenticated area. Requires a session and, except on the organization
 * creation screen, at least one organization; the first organization becomes
 * active automatically when none is.
 */
export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.query(sessionQueryOptions)
    if (session === null) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
    const organizations = await context.queryClient.query(organizationsQueryOptions)
    const isCreating = location.pathname === NEW_ORGANIZATION_PATH
    if (!isCreating && organizations.length === 0) {
      throw redirect({ to: NEW_ORGANIZATION_PATH })
    }
    const firstOrganization = organizations[0]
    if (firstOrganization !== undefined && session.session.activeOrganizationId === null) {
      await authClient.organization.setActive({ organizationId: firstOrganization.id })
      await context.queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey })
    }
    return { session, organizations }
  },
  loader: async ({ context }) => {
    if (context.organizations.length === 0) {
      return null
    }
    return await context.queryClient.query(activeOrganizationQueryOptions)
  },
  component: AppLayout,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-xl p-8">
      <Alert tone="error" title="Something went wrong">
        {describeError(error)}
      </Alert>
    </main>
  ),
})

function AppLayout() {
  const { session, organizations } = Route.useRouteContext()
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
