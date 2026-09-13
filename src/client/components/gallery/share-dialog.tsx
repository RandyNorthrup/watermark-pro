import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { SHARE_EXPIRY_DAYS } from '../../../shared/constants'
import { describeError } from '../../lib/errors'
import { captureOfflineOwner } from '../../lib/offline-context'
import { offlineStatus, subscribeOfflineStatus } from '../../lib/offline-status'
import { photoShareReadiness } from '../../lib/photo-share-readiness'
import { copyLink, createShare, shareLink, sharesQueryKey } from '../../lib/shares'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { ChoiceGroup } from '../ui/choice-group'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

interface ShareDialogProps {
  organizationId: string
  photoIds: readonly string[]
  /** Suggested title, for example the photo's name. */
  defaultTitle: string
  trigger: ReactNode
}

type ExpiryChoice = 'never' | `${(typeof SHARE_EXPIRY_DAYS)[number]}`

function isExpiryDays(value: number): value is (typeof SHARE_EXPIRY_DAYS)[number] {
  return (SHARE_EXPIRY_DAYS as readonly number[]).includes(value)
}

/**
 * Creates a share link for the given photos, then offers the link through
 * the platform share sheet or the clipboard.
 */
export function ShareDialog(props: ShareDialogProps) {
  return <ShareDialogSession key={props.organizationId} {...props} />
}

function ShareDialogSession({ organizationId, photoIds, defaultTitle, trigger }: ShareDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const account = useMemo(
    () => ({ owner: captureOfflineOwner(), organizationId }),
    [organizationId],
  )
  const version = useRef(0)
  useEffect(
    () => () => {
      version.current += 1
    },
    [account],
  )
  const status = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const expiryChoices: readonly { value: ExpiryChoice; label: string }[] = [
    ...SHARE_EXPIRY_DAYS.map((days) => ({
      value: String(days) as ExpiryChoice,
      label: t('gallery.expiry.days', { count: days }),
    })),
    { value: 'never', label: t('gallery.expiry.never') },
  ]
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [expiry, setExpiry] = useState<ExpiryChoice>('7')
  const [outcome, setOutcome] = useState<'shared' | 'copied' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const readiness = useQuery({
    queryKey: [
      'photo-share-readiness',
      account.owner.userId,
      organizationId,
      photoIds.toSorted((first, second) => first.localeCompare(second)),
    ],
    queryFn: async () => {
      account.owner.assertCurrent()
      const state = await photoShareReadiness(organizationId, photoIds)
      account.owner.assertCurrent()
      return state
    },
    enabled: isOpen,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
  })
  const refreshReadiness = readiness.refetch
  useEffect(() => {
    if (isOpen) void refreshReadiness()
  }, [isOpen, refreshReadiness, status.pending, status.blocked, status.isOnline])

  const create = useMutation({
    mutationFn: async () => {
      const request = version.current
      const assertCurrent = () => {
        account.owner.assertCurrent()
        if (request !== version.current) throw new Error('The sharing workspace or dialog changed.')
      }
      assertCurrent()
      const ready = await photoShareReadiness(organizationId, photoIds)
      assertCurrent()
      if (ready !== 'ready')
        throw new Error(
          t(ready === 'blocked' ? 'gallery.shareSyncBlocked' : 'gallery.shareSyncPending'),
        )
      if (!offlineStatus().isOnline) throw new Error(t('offline.connectionRequired'))
      const days = expiry === 'never' ? undefined : Number(expiry)
      const result = await createShare(organizationId, {
        title: title.trim() || defaultTitle,
        photoIds: [...photoIds],
        ...(days !== undefined && isExpiryDays(days) && { expiresInDays: days }),
      })
      assertCurrent()
      return result
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey(organizationId) })
    },
    onError: () => {
      void refreshReadiness()
    },
  })

  async function offer(url: string, how: 'share' | 'copy') {
    try {
      setOutcome(
        how === 'share' ? await shareLink(title.trim() || defaultTitle, url) : await copyLink(url),
      )
      setShareError(null)
    } catch (error_) {
      setShareError(describeError(error_))
    }
  }

  let readinessMessage: string | null = null
  if (!status.isOnline) readinessMessage = t('offline.connectionRequired')
  else if (readiness.data === 'pending') readinessMessage = t('gallery.shareSyncPending')
  else if (readiness.data === 'blocked') readinessMessage = t('gallery.shareSyncBlocked')

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        version.current += 1
        setIsOpen(next)
        if (next) {
          setTitle(defaultTitle)
          setOutcome(null)
          setShareError(null)
          create.reset()
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          // physical: geometry: the share dialog is centred — left-1/2 pairs with -translate-x-1/2
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card"
        >
          <div>
            <Dialog.Title className="text-lg font-semibold">
              {t('gallery.shareTitle', { count: photoIds.length })}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              {t('gallery.shareDescription')}
            </Dialog.Description>
          </div>
          {create.data === undefined ? (
            <>
              <Field label={t('gallery.title')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={title}
                    maxLength={200}
                    onChange={(event) => {
                      setTitle(event.currentTarget.value)
                    }}
                  />
                )}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t('gallery.expiresAfter')}</span>
                <ChoiceGroup
                  label={t('gallery.linkExpiry')}
                  value={expiry}
                  choices={expiryChoices}
                  onChange={setExpiry}
                />
              </div>
              {create.isError ? (
                <Alert tone="error" title={t('gallery.createErrorTitle')}>
                  {describeError(create.error)}
                </Alert>
              ) : null}
              {readiness.error === null ? null : (
                <Alert tone="error">{describeError(readiness.error)}</Alert>
              )}
              {readinessMessage === null ? null : (
                <p role="status" className="text-sm text-ink-muted">
                  {readinessMessage}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    {t('gallery.cancel')}
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  isPending={create.isPending}
                  disabled={
                    !status.isOnline ||
                    readiness.data !== 'ready' ||
                    readiness.isFetching ||
                    readiness.error !== null
                  }
                  onClick={() => {
                    create.mutate()
                  }}
                >
                  <Link2 aria-hidden="true" className="size-4" />
                  {t('gallery.createLink')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Field label={t('gallery.link')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    readOnly
                    value={create.data.url}
                    onFocus={(event) => {
                      event.currentTarget.select()
                    }}
                  />
                )}
              </Field>
              <p className="text-xs text-ink-muted">
                {create.data.expiresAt === null
                  ? t('gallery.noExpiry')
                  : t('gallery.expires', {
                      when: new Date(create.data.expiresAt).toLocaleString(),
                    })}{' '}
                {t('gallery.manageLinks')}
              </p>
              {outcome === null ? null : (
                <Alert tone="success">
                  {t(outcome === 'copied' ? 'gallery.linkCopied' : 'gallery.linkShared')}
                </Alert>
              )}
              {shareError === null ? null : <Alert tone="error">{shareError}</Alert>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void offer(create.data.url, 'copy')
                  }}
                >
                  {outcome === 'copied' ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <Copy aria-hidden="true" className="size-4" />
                  )}
                  {t('gallery.copyLink')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void offer(create.data.url, 'share')
                  }}
                >
                  <Share2 aria-hidden="true" className="size-4" />
                  {t('gallery.shareEllipsis')}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
