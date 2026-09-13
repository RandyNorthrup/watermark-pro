import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { WorkspaceAccess } from '../../components/workspace-access'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'

export const Route = createFileRoute('/app/members')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: MembersPage,
})

function MembersPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const organization = useActiveOrganization()
  if (organization === null) return <Alert tone="info">{t('members.orgRequired')}</Alert>
  return <WorkspaceAccess organization={organization} userId={session.user.id} />
}
