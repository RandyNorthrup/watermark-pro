import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { ScrollText, Users } from 'lucide-react'

import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { activeMemberRoleQueryOptions } from '../../lib/queries'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: DashboardPage,
})

function DashboardPage() {
  const { session } = Route.useRouteContext()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const memberCount = organization?.members.length ?? 0
  const pendingCount =
    organization?.invitations.filter((invitation) => invitation.status === 'pending').length ?? 0

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">Signed in as {session.user.email}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {organization?.name ?? 'Your workspace'}
        </h1>
        {membership === null ? null : (
          <p className="text-sm">
            Your role: <Badge>{membership.role}</Badge>
          </p>
        )}
      </header>
      <section aria-labelledby="overview-heading" className="grid gap-4 sm:grid-cols-2">
        <h2 id="overview-heading" className="sr-only">
          Overview
        </h2>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Users aria-hidden="true" className="size-4" />
            Members
          </div>
          <p className="text-3xl font-semibold">{memberCount}</p>
          <p className="text-sm text-ink-muted">
            {pendingCount === 0
              ? 'No pending invitations.'
              : `${String(pendingCount)} pending invitation${pendingCount === 1 ? '' : 's'}.`}
          </p>
          <Link
            to="/app/members"
            className="text-sm font-medium text-brand-600 dark:text-brand-300"
          >
            Manage members
          </Link>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <ScrollText aria-hidden="true" className="size-4" />
            Audit log
          </div>
          <p className="text-sm text-ink-muted">
            Every membership and organization change is recorded with who did it and when.
          </p>
          <Link to="/app/audit" className="text-sm font-medium text-brand-600 dark:text-brand-300">
            View audit log
          </Link>
        </Card>
      </section>
      <section aria-labelledby="roadmap-heading" className="flex flex-col gap-2">
        <h2 id="roadmap-heading" className="text-xl font-semibold tracking-tight">
          What is next
        </h2>
        <p className="max-w-prose text-sm text-ink-muted">
          This foundation release covers accounts, organizations and roles. The watermark engine,
          library, editor, bulk processing, storage and sharing arrive milestone by milestone; the
          plan is in the repository.
        </p>
      </section>
    </div>
  )
}
