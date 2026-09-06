import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

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
  const organization = appRoute.useLoaderData()
  const query = useAuditQuery(organization?.id ?? '')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The most recent changes in {organization?.name ?? 'this organization'}. Owners and admins
          can view this page.
        </p>
      </header>
      <AuditBody query={query} />
    </div>
  )
}

function AuditBody({ query }: { query: ReturnType<typeof useAuditQuery> }) {
  if (query.isPending) {
    return <Spinner className="size-6" label="Loading audit log" />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title="Could not load the audit log">
        {query.error instanceof ApiRequestError && query.error.status === HTTP_STATUS.forbidden
          ? 'Your role does not include audit access.'
          : describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.entries.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
      </Card>
    )
  }
  return (
    <AuditTable
      caption="Audit entries, newest first"
      entries={query.data.entries}
      detailHeading="Details"
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
