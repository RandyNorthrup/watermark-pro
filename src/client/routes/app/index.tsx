import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { Images, Layers, PencilRuler, ScrollText, Stamp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { RecentWork } from '../../components/recent-work/recent-work'
import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { readActiveMemberRole } from '../../lib/queries'

const appRoute = getRouteApi('/app')

const TOOLS = [
  {
    to: '/app/library',
    labelKey: 'dashboard.tools.library.label',
    bodyKey: 'dashboard.tools.library.body',
    icon: Stamp,
  },
  {
    to: '/app/editor',
    labelKey: 'dashboard.tools.editor.label',
    bodyKey: 'dashboard.tools.editor.body',
    icon: PencilRuler,
  },
  {
    to: '/app/bulk',
    labelKey: 'dashboard.tools.bulk.label',
    bodyKey: 'dashboard.tools.bulk.body',
    icon: Layers,
  },
  {
    to: '/app/gallery',
    labelKey: 'dashboard.tools.gallery.label',
    bodyKey: 'dashboard.tools.gallery.body',
    icon: Images,
  },
] as const

export const Route = createFileRoute('/app/')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const memberCount = organization?.members.length ?? 0
  const pendingCount =
    organization?.invitations.filter((invitation) => invitation.status === 'pending').length ?? 0

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">
          {t('dashboard.signedInAs', { email: session.user.email })}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {organization?.name ?? t('dashboard.yourWorkspace')}
        </h1>
        {membership === null ? null : (
          <p className="text-sm">
            {t('dashboard.yourRole')} <Badge>{membership.role}</Badge>
          </p>
        )}
      </header>
      {organization === null ? null : (
        <RecentWork
          organizationId={organization.id}
          organizationName={organization.name}
          role={membership?.role}
        />
      )}
      <section aria-labelledby="tools-heading" className="flex flex-col gap-3">
        <h2 id="tools-heading" className="text-xl font-semibold tracking-tight">
          {t('dashboard.toolsHeading')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOOLS.map(({ to, labelKey, bodyKey, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/20"
              >
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{t(labelKey)}</span>
                  <span className="text-sm text-ink-muted">{t(bodyKey)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="overview-heading" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <h2 id="overview-heading" className="sr-only">
          {t('dashboard.overviewHeading')}
        </h2>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Users aria-hidden="true" className="size-4" />
            {t('dashboard.members')}
          </div>
          <p className="text-3xl font-semibold">{memberCount}</p>
          <p className="text-sm text-ink-muted">
            {pendingCount === 0
              ? t('dashboard.noPendingInvitations')
              : t('dashboard.pendingInvitations', { count: pendingCount })}
          </p>
          <Link
            to="/app/members"
            className="text-sm font-medium text-brand-600 dark:text-brand-300"
          >
            {t('dashboard.manageMembers')}
          </Link>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <ScrollText aria-hidden="true" className="size-4" />
            {t('dashboard.auditLog')}
          </div>
          <p className="text-sm text-ink-muted">{t('dashboard.auditDescription')}</p>
          <Link to="/app/audit" className="text-sm font-medium text-brand-600 dark:text-brand-300">
            {t('dashboard.viewAuditLog')}
          </Link>
        </Card>
      </section>
    </div>
  )
}
