import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DocumentsTool } from '../../components/documents/documents-tool'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

export const Route = createFileRoute('/app/documents')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: DocumentsPage,
})

function DocumentsPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">{t('documents.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('documents.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('documents.description')}</p>
      </header>
      <DocumentsTool
        key={organization.id}
        organizationId={organization.id}
        canCreatePresets={canRole(membership?.role, { watermark: ['create'] })}
      />
    </div>
  )
}
