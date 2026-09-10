import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { accountSearchSchema } from '../../../shared/client-search'
import { SITE_ROLE } from '../../../shared/site-roles'
import { ProviderLogo } from '../../components/provider-logo'
import { SocialAuth } from '../../components/social-auth'
import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
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

function siteRoleName(role: unknown, t: TFunction): string {
  if (role === SITE_ROLE.owner) return t('siteRoles.owner')
  if (role === SITE_ROLE.admin) return t('siteRoles.admin')
  return t('siteRoles.user')
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
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex items-center gap-4">
        <Avatar
          name={session.user.name}
          image={session.user.image}
          className="size-16 text-lg shadow-card"
        />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{t('accountAuth.heading')}</h1>
          <p className="mt-1 truncate text-ink-muted">{session.user.name}</p>
        </div>
      </header>
      <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-4">
            <Avatar
              name={session.user.name}
              image={session.user.image}
              className="size-14 text-base"
            />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{session.user.name}</h2>
              <p className="truncate text-sm text-ink-muted">{session.user.email}</p>
            </div>
          </div>
          <dl className="grid gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t('auth.fields.emailLabel')}
              </dt>
              <dd className="mt-1 break-all">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t('siteInvites.role')}
              </dt>
              <dd className="mt-2">
                <Badge>{siteRoleName(session.user.role, t)}</Badge>
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="flex flex-col gap-4 p-6">
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
    </div>
  )
}
