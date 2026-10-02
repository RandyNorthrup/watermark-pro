import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ProviderLogo } from './provider-logo'
import { Turnstile } from './turnstile'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { loginSearchSchema } from '../../shared/client-search'
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
import { useCaptcha } from '../lib/use-captcha'

interface SocialAuthProps {
  invitation?: string | undefined
  mode?: 'sign-in' | 'link'
  callbackURL?: string | undefined
  /** Signup shares one challenge between its email and provider entry controls. */
  captcha?: ReturnType<typeof useCaptcha>
}

/** Provider identity and cloud-file authorization remain separate, explicit actions. */
export function SocialAuth({
  invitation,
  mode = 'sign-in',
  callbackURL = '/app',
  captcha: sharedCaptcha,
}: SocialAuthProps) {
  const { t } = useTranslation()
  const config = useQuery(publicConfigQueryOptions)
  const ownCaptcha = useCaptcha()
  const challenge = sharedCaptcha ?? ownCaptcha
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
    if (mode === 'sign-in' && !challenge.isReady) return
    setPending(provider)
    setError(null)
    const admission = invitation ?? pendingInvitation()
    if (mode === 'sign-in' && admission !== undefined) rememberInvitation(admission)
    try {
      const redirect = loginSearchSchema.parse({ redirect: callbackURL }).redirect ?? '/app'
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
                callbackURL: redirect,
                errorCallbackURL: '/login',
                requestSignUp: admission !== undefined,
              },
              {
                headers: {
                  ...challenge.headers,
                  ...(admission !== undefined && { [INVITATION_HEADER]: admission }),
                },
              },
            )
      setError(describeAuthError(result.error))
    } catch (error_) {
      setError(describeError(error_))
    } finally {
      if (mode === 'sign-in') challenge.reset()
      setPending(null)
    }
  }
  if (providers.every((provider) => !provider.enabled)) return null
  return (
    <div className="mb-6 flex flex-col gap-3">
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {mode === 'sign-in' && sharedCaptcha === undefined && challenge.siteKey !== null ? (
        <Turnstile
          key={challenge.generation}
          siteKey={challenge.siteKey}
          onToken={challenge.onToken}
        />
      ) : null}
      {providers
        .filter((provider) => provider.enabled)
        .map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="secondary"
            isPending={pending === provider.id}
            disabled={pending !== null || (mode === 'sign-in' && !challenge.isReady)}
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
