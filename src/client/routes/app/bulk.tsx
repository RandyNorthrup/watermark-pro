import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { BulkTool } from '../../components/bulk/bulk-tool'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

export const Route = createFileRoute('/app/bulk')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: BulkPage,
})

function BulkPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">{t('bulk.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('bulk.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('bulk.description')}</p>
      </header>
      <BulkTool
        organizationId={organization.id}
        organizationName={organization.name}
        canSave={canRole(membership?.role, { photo: ['upload'] })}
      />
    </div>
  )
}
