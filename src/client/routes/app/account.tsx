import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { accountSearchSchema } from '../../../shared/client-search'
import { ProviderLogo } from '../../components/provider-logo'
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

function providerName(provider: string, password: string): string {
  if (provider === 'credential') return password
  if (provider === 'google') return 'Google'
  if (provider === 'microsoft') return 'Microsoft'
  return provider
}

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
          <ul className="flex flex-col gap-2 text-sm">
            {accounts.data?.map((account) => {
              const provider = account.providerId
              return (
                <li
                  key={account.id}
                  className="glass-control flex min-h-11 items-center gap-3 rounded-xl border px-3"
                >
                  {provider === 'google' || provider === 'microsoft' ? (
                    <ProviderLogo provider={provider} />
                  ) : (
                    <KeyRound aria-hidden="true" className="size-5 text-ink-muted" />
                  )}
                  <span className="font-medium">
                    {providerName(provider, t('accountAuth.password'))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <SocialAuth mode="link" />
      </Card>
    </div>
  )
}
