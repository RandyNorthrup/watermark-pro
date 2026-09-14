import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Share2, XCircle } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ShareDto } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { dateTimeFormatter } from '../../lib/format-date'
import {
  copyLink,
  revokeShare,
  shareLink,
  sharesQueryKey,
  sharesQueryOptions,
} from '../../lib/shares'
import { Alert } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Spinner } from '../ui/spinner'

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

/** Manage existing image links from the image collection without a separate page. */
export function ManageLinksDialog({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const shares = useQuery({ ...sharesQueryOptions(organizationId), enabled: isOpen })
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) setNow(Date.now())
      }}
    >
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary">
          <Share2 aria-hidden="true" className="size-4" />
          {t('shares.heading')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="glass-popover app-scroll-region fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[85svh] max-w-2xl -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-line p-5">
          <Dialog.Title className="text-xl font-semibold">{t('shares.heading')}</Dialog.Title>
          <Dialog.Description className="text-sm text-ink-muted">
            {t('shares.description', { name: t('gallery.heading') })}
          </Dialog.Description>
          {shares.isPending ? <Spinner label={t('shares.loading')} /> : null}
          {shares.isError ? (
            <Alert tone="error" title={t('shares.loadErrorTitle')}>
              {describeError(shares.error)}
            </Alert>
          ) : null}
          {shares.isSuccess && shares.data.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('shares.empty')}</p>
          ) : null}
          {shares.isSuccess && shares.data.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {shares.data.map((share) => (
                <ShareRow key={share.id} share={share} organizationId={organizationId} now={now} />
              ))}
            </ul>
          ) : null}
          <div className="flex justify-center">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                {t('gallery.close')}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
          <div className="flex flex-wrap justify-center gap-2">
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
