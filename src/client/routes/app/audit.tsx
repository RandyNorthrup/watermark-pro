import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { HTTP_STATUS } from '../../../shared/constants'
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

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
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
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <caption className="sr-only">Audit entries, newest first</caption>
        <thead className="text-left text-xs text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              When
            </th>
            <th scope="col" className="px-4 py-3">
              Who
            </th>
            <th scope="col" className="px-4 py-3">
              Action
            </th>
            <th scope="col" className="px-4 py-3">
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {query.data.entries.map((entry) => (
            <tr key={entry.id} className="border-t border-line">
              <td className="px-4 py-3 whitespace-nowrap">
                <time dateTime={entry.createdAt}>
                  {dateFormatter.format(new Date(entry.createdAt))}
                </time>
              </td>
              <td className="px-4 py-3">{entry.actorName ?? 'System'}</td>
              <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
              <td className="px-4 py-3 text-ink-muted">
                {entry.metadata === null ? '' : formatMetadata(entry.metadata)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ')
}
