import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { HTTP_STATUS } from '../../../shared/constants'
import { AuditTable } from '../../components/audit-table'
import { Alert } from '../../components/ui/alert'
import { Card } from '../../components/ui/card'
import { Spinner } from '../../components/ui/spinner'
import { ApiRequestError } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { auditQueryOptions } from '../../lib/queries'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/audit')({
  component: AuditPage,
})

function useAuditQuery(organizationId: string) {
  return useQuery({ ...auditQueryOptions(organizationId), enabled: organizationId !== '' })
}

function AuditPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const query = useAuditQuery(organization?.id ?? '')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('audit.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('audit.description', { name: organization?.name ?? t('audit.thisOrganization') })}
        </p>
      </header>
      <AuditBody query={query} />
    </div>
  )
}

function AuditBody({ query }: { query: ReturnType<typeof useAuditQuery> }) {
  const { t } = useTranslation()
  if (query.isPending) {
    return <Spinner className="size-6" label={t('audit.loading')} />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title={t('audit.loadErrorTitle')}>
        {query.error instanceof ApiRequestError && query.error.status === HTTP_STATUS.forbidden
          ? t('audit.noAccess')
          : describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.entries.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t('audit.empty')}</p>
      </Card>
    )
  }
  return (
    <AuditTable
      caption={t('audit.tableCaption')}
      entries={query.data.entries}
      detailHeading={t('audit.detailsHeading')}
      renderDetail={(entry) => (
        <td className="px-4 py-3 text-ink-muted">
          {entry.metadata === null ? '' : formatMetadata(entry.metadata)}
        </td>
      )}
    />
  )
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ')
}
