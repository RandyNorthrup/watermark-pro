import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { Check, Copy, Share2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ShareDto } from '../../../shared/api'
import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { buttonVariants } from '../../components/ui/button-variants'
import { Card } from '../../components/ui/card'
import { Spinner } from '../../components/ui/spinner'
import { describeError } from '../../lib/errors'
import { dateTimeFormatter } from '../../lib/format-date'
import { activeMemberRoleQueryOptions } from '../../lib/queries'
import { canRole } from '../../lib/roles'
import {
  copyLink,
  revokeShare,
  shareLink,
  sharesQueryKey,
  sharesQueryOptions,
} from '../../lib/shares'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/shares')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: SharesPage,
})

type ShareStatus = 'active' | 'expired' | 'revoked'

/** Catalogue keys for each share status; translated where the badge is drawn. */
const STATUS_LABELS = {
  active: 'shares.status.active',
  expired: 'shares.status.expired',
  revoked: 'shares.status.revoked',
} as const satisfies Record<ShareStatus, string>

function statusOf(share: ShareDto, now: number): ShareStatus {
  if (share.revokedAt !== null) {
    return 'revoked'
  }
  if (share.expiresAt !== null && Date.parse(share.expiresAt) <= now) {
    return 'expired'
  }
  return 'active'
}

function SharesPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const organizationId = organization?.id ?? ''
  const shares = useQuery({ ...sharesQueryOptions(organizationId), enabled: organizationId !== '' })
  // Captured once per load so the status badges are pure during render.
  const [now] = useState(() => Date.now())
  if (organization === null) {
    return <Alert tone="info">{t('shares.orgRequired')}</Alert>
  }
  if (!canRole(membership?.role, { share: ['create'] })) {
    return <Alert tone="error">{t('shares.noPermission')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('shares.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('shares.description', { name: organization.name })}
        </p>
      </header>
      {shares.isPending ? <Spinner className="size-6" label={t('shares.loading')} /> : null}
      {shares.isError ? (
        <Alert tone="error" title={t('shares.loadErrorTitle')}>
          {describeError(shares.error)}
        </Alert>
      ) : null}
      {shares.isSuccess && shares.data.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">{t('shares.empty')}</p>
          <Link to="/app/gallery" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {t('shares.openGallery')}
          </Link>
        </Card>
      ) : null}
      {shares.isSuccess && shares.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shares.data.map((share) => (
            <ShareRow key={share.id} share={share} organizationId={organization.id} now={now} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const STATUS_STYLES: Record<ShareStatus, string> = {
  active: '',
  expired: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  revoked: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100',
}

function ShareRow({
  share,
  organizationId,
  now,
}: {
  share: ShareDto
  organizationId: string
  now: number
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [outcome, setOutcome] = useState<'copied' | 'shared' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = statusOf(share, now)
  const revoke = useMutation({
    mutationFn: () => revokeShare(organizationId, share.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey(organizationId) })
    },
  })

  async function offer(how: 'share' | 'copy') {
    try {
      setOutcome(
        how === 'share' ? await shareLink(share.title, share.url) : await copyLink(share.url),
      )
      setError(null)
    } catch (error_) {
      setError(describeError(error_))
    }
  }

  return (
    <li>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{share.title}</h2>
            <p className="text-sm text-ink-muted">
              {t('shares.rowCreated', {
                count: share.photoCount,
                created: dateTimeFormatter.format(new Date(share.createdAt)),
              })}
              {share.expiresAt === null
                ? t('shares.neverExpires')
                : t('shares.expiresOn', {
                    expires: dateTimeFormatter.format(new Date(share.expiresAt)),
                  })}
            </p>
          </div>
          <Badge className={STATUS_STYLES[status]}>{t(STATUS_LABELS[status])}</Badge>
        </div>
        <p className="truncate font-mono text-xs text-ink-muted">{share.url}</p>
        {status === 'active' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void offer('copy')
              }}
            >
              {outcome === 'copied' ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {t('shares.copyLink')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void offer('share')
              }}
            >
              <Share2 aria-hidden="true" className="size-4" />
              {t('shares.shareEllipsis')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isPending={revoke.isPending}
              aria-label={t('shares.revoke', { title: share.title })}
              onClick={() => {
                revoke.mutate()
              }}
            >
              <XCircle aria-hidden="true" className="size-4" />
              {t('shares.revokeButton')}
            </Button>
          </div>
        ) : null}
        {outcome === null ? null : (
          <p className="text-xs text-ink-muted" role="status">
            {t(outcome === 'copied' ? 'shares.linkCopied' : 'shares.linkShared')}
          </p>
        )}
        {revoke.isError ? <Alert tone="error">{describeError(revoke.error)}</Alert> : null}
        {error === null ? null : <Alert tone="error">{error}</Alert>}
      </Card>
    </li>
  )
}
