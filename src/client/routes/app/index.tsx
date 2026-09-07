import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { Images, Layers, PencilRuler, ScrollText, Stamp, Users } from 'lucide-react'

import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { activeMemberRoleQueryOptions } from '../../lib/queries'

const appRoute = getRouteApi('/app')

const TOOLS = [
  {
    to: '/app/library',
    label: 'Library',
    icon: Stamp,
    body: 'Design text, symbol and logo watermarks once and keep them as presets.',
  },
  {
    to: '/app/editor',
    label: 'Editor',
    icon: PencilRuler,
    body: 'Watermark one photo by hand: place, crop, resize and export.',
  },
  {
    to: '/app/bulk',
    label: 'Bulk',
    icon: Layers,
    body: 'Apply a preset to a whole shoot and download the results as a ZIP.',
  },
  {
    to: '/app/gallery',
    label: 'Gallery',
    icon: Images,
    body: 'Browse what the team has saved, then share albums with a link.',
  },
] as const

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
      <section aria-labelledby="tools-heading" className="flex flex-col gap-3">
        <h2 id="tools-heading" className="text-xl font-semibold tracking-tight">
          Tools
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOOLS.map(({ to, label, icon: Icon, body }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20"
              >
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{label}</span>
                  <span className="text-sm text-ink-muted">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="overview-heading" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </div>
  )
}
