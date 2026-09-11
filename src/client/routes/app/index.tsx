import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ScrollText, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { canManageSite } from '../../../shared/site-role-values'
import { AccountStatistics } from '../../components/account-statistics'
import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'

export const Route = createFileRoute('/app/')({
  beforeLoad: ({ context }) => {
    if (!canManageSite(context.session.user.role))
      throw redirect({ to: '/app/editor', replace: true })
  },
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const organization = useActiveOrganization()
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
        <h1 className="text-3xl font-semibold tracking-tight">{t('dashboard.overviewHeading')}</h1>
        {membership === null ? null : (
          <p className="text-sm">
            {t('dashboard.yourRole')} <Badge>{membership.role}</Badge>
          </p>
        )}
      </header>
      <AccountStatistics />
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
