import type { TFunction } from 'i18next'
import { ExternalLink } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CloudConsentNote } from './import/cloud-consent-note'
import { ProviderLogo } from './provider-logo'
import { cloudProviderLogo } from './provider-logo-id'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { buttonVariants } from './ui/button-variants'
import { Card } from './ui/card'
import { Spinner } from './ui/spinner'
import {
  CLOUD_PROVIDERS,
  type CloudConnectionDto,
  type CloudProvider,
} from '../../shared/cloud-connections'
import { CLOUD_CONNECTION_CHANGED_EVENT } from '../lib/cloud-connection-context'
import {
  cloudConnections,
  connectCloudProvider,
  disconnectCloudProvider,
} from '../lib/cloud-connections'
import { describeError } from '../lib/errors'
import { PROVIDER_LABELS } from '../lib/imports/source'
import { ACCOUNT_CHANGED_EVENT } from '../lib/offline-account'
import { captureOfflineOwner } from '../lib/offline-context'

const PERMISSIONS = {
  google: 'https://myaccount.google.com/connections',
  dropbox: 'https://www.dropbox.com/account/connected_apps',
  onedrive: 'https://account.live.com/consent/Manage',
} as const

function connectionNotice(connection: CloudConnectionDto, t: TFunction): string {
  if (!connection.isConfigured) return t('cloudStorage.unavailable')
  if (connection.status === 'connected') return t('cloudStorage.connected')
  return '\u{A0}'
}

/** Public provider controls define the same row geometry before private status arrives. */
function CloudPermissions({ provider }: { provider: CloudProvider }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      <a
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        href={PERMISSIONS[provider]}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink className="size-3" />
        {t('cloudStorage.managePermissions')}
        {provider === 'onedrive' ? <> · {t('cloudStorage.personalAccount')}</> : null}
      </a>
      {provider === 'onedrive' ? (
        <a
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          href="https://myapplications.microsoft.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="size-3" />
          {t('cloudStorage.workAccount')}
        </a>
      ) : null}
    </div>
  )
}

/** Reserve known provider structure without exposing or inventing connection status. */
function PendingConnections() {
  const { t } = useTranslation()
  return (
    <div className="relative">
      <div className="invisible flex flex-col gap-3" aria-hidden="true">
        {CLOUD_PROVIDERS.map((provider) => (
          <div
            key={provider}
            className="glass-control flex flex-col gap-3 rounded-xl border border-line p-4"
          >
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-center gap-3">
                <ProviderLogo provider={cloudProviderLogo(provider)} className="size-6" />
                <div className="min-w-0">
                  <p className="font-semibold">{PROVIDER_LABELS[provider]}</p>
                  <p className="truncate text-sm text-ink-muted">{t('cloudStorage.loading')}</p>
                </div>
              </div>
              <Button
                className="justify-self-start"
                size="sm"
                variant="secondary"
                disabled
                tabIndex={-1}
              >
                {t('cloudStorage.connect', { provider: PROVIDER_LABELS[provider] })}
              </Button>
            </div>
            <p className="text-xs text-ink-muted">{t('cloudStorage.unavailable')}</p>
            <CloudConsentNote provider={provider} />
            <CloudPermissions provider={provider} />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="size-6" label={t('cloudStorage.loading')} />
      </div>
    </div>
  )
}

/** Storage grants remain separate from sign-in accounts and never follow shared workspace membership. */
export function CloudConnectionsCard({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<CloudConnectionDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<CloudProvider | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const refreshRevision = useRef(0)

  async function refresh() {
    const owner = captureOfflineOwner()
    if (owner.userId !== userId) throw new Error('The signed-in account changed.')
    const revision = ++refreshRevision.current
    const result = await cloudConnections()
    owner.assertCurrent()
    if (mounted.current && refreshRevision.current === revision) setConnections(result.connections)
  }

  function requestRefresh() {
    void refresh().catch((error_: unknown) => {
      if (mounted.current) setError(describeError(error_))
    })
  }
  const onRefresh = useEffectEvent(requestRefresh)
  useEffect(() => {
    mounted.current = true
    const changed = () => onRefresh()
    onRefresh()
    const accountChanged = () => {
      refreshRevision.current += 1
      setConnections(null)
      setError(null)
      setNotice(null)
      controller.current?.abort()
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, accountChanged)
    window.addEventListener(CLOUD_CONNECTION_CHANGED_EVENT, changed)
    window.addEventListener('online', changed)
    return () => {
      mounted.current = false
      refreshRevision.current += 1
      controller.current?.abort()
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, accountChanged)
      window.removeEventListener(CLOUD_CONNECTION_CHANGED_EVENT, changed)
      window.removeEventListener('online', changed)
    }
  }, [])

  async function change(connection: CloudConnectionDto) {
    const owner = captureOfflineOwner()
    const request = new AbortController()
    controller.current = request
    setPending(connection.provider)
    setError(null)
    setNotice(null)
    try {
      if (owner.userId !== userId) throw new Error('The signed-in account changed.')
      if (connection.status === 'connected') {
        const result = await disconnectCloudProvider(connection.provider)
        if (!result.providerRevoked && mounted.current) setNotice(t('cloudStorage.revocationHint'))
      } else await connectCloudProvider(connection.provider, request.signal)
      owner.assertCurrent()
      if (mounted.current) await refresh()
    } catch (error_) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      if (mounted.current && !(error_ instanceof DOMException && error_.name === 'AbortError'))
        setError(describeError(error_))
    } finally {
      if (controller.current === request) controller.current = null
      if (mounted.current) setPending(null)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header>
        <h2 className="text-xl font-semibold">{t('cloudStorage.heading')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('cloudStorage.description')}</p>
      </header>
      {error === null ? null : (
        <Alert tone="error">
          {error}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError(null)
              requestRefresh()
            }}
          >
            {t('cloudStorage.retry')}
          </Button>
        </Alert>
      )}
      {notice === null ? null : <Alert>{notice}</Alert>}
      {connections === null ? (
        <PendingConnections />
      ) : (
        <ul className="flex flex-col gap-3">
          {connections.map((connection) => (
            <li
              key={connection.provider}
              className="glass-control flex flex-col gap-3 rounded-xl border border-line p-4"
            >
              <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo
                    provider={cloudProviderLogo(connection.provider)}
                    className="size-6"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">{PROVIDER_LABELS[connection.provider]}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {connection.accountLabel ??
                        t(
                          connection.status === 'reconnect'
                            ? 'cloudStorage.reconnect'
                            : 'cloudStorage.notConnected',
                        )}
                    </p>
                  </div>
                </div>
                <Button
                  className="justify-self-start"
                  size="sm"
                  variant="secondary"
                  disabled={!connection.isConfigured || pending !== null}
                  isPending={pending === connection.provider}
                  onClick={() => {
                    void change(connection)
                  }}
                >
                  {connection.status === 'connected'
                    ? t('cloudStorage.disconnect')
                    : t('cloudStorage.connect', { provider: PROVIDER_LABELS[connection.provider] })}
                </Button>
              </div>
              <p className="text-xs text-ink-muted">{connectionNotice(connection, t)}</p>
              <CloudConsentNote provider={connection.provider} />
              {pending === connection.provider && connection.status !== 'connected' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-ink-muted">{t('cloudStorage.waiting')}</p>
                  <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>
                    {t('import.cancel')}
                  </Button>
                </div>
              ) : null}
              <CloudPermissions provider={connection.provider} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
