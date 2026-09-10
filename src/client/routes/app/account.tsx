import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { accountSearchSchema } from '../../../shared/client-search'
import { SocialAuth } from '../../components/social-auth'
import { Alert } from '../../components/ui/alert'
import { Card } from '../../components/ui/card'
import { ApiRequestError } from '../../lib/api'
import { authClient } from '../../lib/auth-client'
import { describeError } from '../../lib/errors'

export const Route = createFileRoute('/app/account')({
  validateSearch: accountSearchSchema,
  component: AccountPage,
})

function AccountPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const { error } = Route.useSearch()
  const accounts = useQuery({
    queryKey: ['linked-accounts', session.user.id],
    queryFn: async () => {
      const result = await authClient.listAccounts()
      if (result.error !== null)
        throw new ApiRequestError(
          '/api/auth/list-accounts',
          result.error.status,
          result.error.message,
        )
      return result.data
    },
  })
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold">{t('accountAuth.heading')}</h1>
        <p className="mt-2 text-ink-muted">{session.user.email}</p>
      </header>
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-xl font-semibold">{t('accountAuth.connected')}</h2>
        {error === undefined ? null : <Alert tone="error">{t('accountAuth.linkError')}</Alert>}
        {accounts.isError ? <Alert tone="error">{describeError(accounts.error)}</Alert> : null}
        {accounts.isPending ? (
          <p role="status">{t('accountAuth.loading')}</p>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {accounts.data?.map((account) => (
              <li key={account.id}>
                {account.providerId === 'credential'
                  ? t('accountAuth.password')
                  : account.providerId}
              </li>
            ))}
          </ul>
        )}
        <SocialAuth mode="link" />
      </Card>
    </div>
  )
}
