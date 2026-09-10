import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Spinner } from './ui/spinner'
import { accountStatsQueryOptions } from '../lib/accounts'
import { describeError } from '../lib/errors'

const METRICS = ['users', 'verifiedUsers', 'pendingInvitations', 'acceptedInvitations'] as const
const METRIC_LABELS = {
  users: 'accountStats.users',
  verifiedUsers: 'accountStats.verifiedUsers',
  pendingInvitations: 'accountStats.pendingInvitations',
  acceptedInvitations: 'accountStats.acceptedInvitations',
} as const

/** Counts are returned by a platform-admin-only API and never requested by other users. */
export function AccountStatistics() {
  const { t } = useTranslation()
  const stats = useQuery(accountStatsQueryOptions)
  if (stats.isError) return <Alert tone="error">{describeError(stats.error)}</Alert>
  return (
    <dl aria-busy={stats.isPending} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {METRICS.map((metric) => (
        <div key={metric} className="rounded-card border border-line bg-surface-raised p-4">
          <dt className="text-sm text-ink-muted">{t(METRIC_LABELS[metric])}</dt>
          <dd className="mt-2 flex h-9 items-center text-3xl font-semibold tabular-nums">
            {stats.isPending ? (
              <Spinner className="size-6" label={t(METRIC_LABELS[metric])} />
            ) : (
              stats.data[metric]
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
