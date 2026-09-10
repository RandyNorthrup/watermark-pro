import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ProviderLogo } from './provider-logo'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { INVITATION_HEADER } from '../../shared/invitation'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { ACCOUNT_CHANGED_EVENT } from '../lib/offline-account'
import {
  clearPendingInvitation,
  pendingInvitation,
  rememberInvitation,
} from '../lib/pending-invitation'
import { publicConfigQueryOptions } from '../lib/queries'

interface SocialAuthProps {
  invitation?: string | undefined
  mode?: 'sign-in' | 'link'
}

/** Provider identity and cloud-file authorization remain separate, explicit actions. */
export function SocialAuth({ invitation, mode = 'sign-in' }: SocialAuthProps) {
  const { t } = useTranslation()
  const config = useQuery(publicConfigQueryOptions)
  const [pending, setPending] = useState<'google' | 'microsoft' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.addEventListener(ACCOUNT_CHANGED_EVENT, clearPendingInvitation)
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, clearPendingInvitation)
  }, [])
  const providers = [
    { id: 'google', enabled: config.data?.googleAuthEnabled === true, name: 'Google' },
    { id: 'microsoft', enabled: config.data?.microsoftAuthEnabled === true, name: 'Microsoft' },
  ] as const
  async function start(provider: 'google' | 'microsoft') {
    setPending(provider)
    setError(null)
    const admission = invitation ?? pendingInvitation()
    if (mode === 'sign-in' && admission !== undefined) rememberInvitation(admission)
    try {
      const result =
        mode === 'link'
          ? await authClient.linkSocial({
              provider,
              callbackURL: '/app/account',
              errorCallbackURL: '/app/account',
            })
          : await authClient.signIn.social(
              {
                provider,
                callbackURL: '/app',
                errorCallbackURL: '/login',
                requestSignUp: admission !== undefined,
              },
              { headers: admission === undefined ? {} : { [INVITATION_HEADER]: admission } },
            )
      setError(describeAuthError(result.error))
    } catch (error_) {
      setError(describeError(error_))
    } finally {
      setPending(null)
    }
  }
  if (providers.every((provider) => !provider.enabled)) return null
  return (
    <div className="mb-6 flex flex-col gap-3">
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {providers
        .filter((provider) => provider.enabled)
        .map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="secondary"
            isPending={pending === provider.id}
            disabled={pending !== null}
            onClick={() => void start(provider.id)}
          >
            <ProviderLogo provider={provider.id} />
            {t(mode === 'link' ? 'accountAuth.linkProvider' : 'accountAuth.continueProvider', {
              provider: provider.name,
            })}
          </Button>
        ))}
      <p className="text-sm text-ink-muted">
        {t(mode === 'link' ? 'accountAuth.linkHelp' : 'accountAuth.identityOnly')}
      </p>
    </div>
  )
}
