import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DocumentsTool } from '../../components/documents/documents-tool'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'

export const Route = createFileRoute('/app/documents')({
  component: DocumentsPage,
})

function DocumentsPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  if (organization === null) {
    return <Alert tone="info">{t('documents.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('documents.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('documents.description')}</p>
      </header>
      <DocumentsTool organizationId={organization.id} />
    </div>
  )
}
