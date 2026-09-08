import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Download, Share2, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { PublicShare } from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'
import { BrandMark } from '../components/brand-mark'
import { ThemeToggle } from '../components/theme-toggle'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { buttonVariants } from '../components/ui/button-variants'
import { Spinner } from '../components/ui/spinner'
import { ApiRequestError } from '../lib/api'
import { describeError } from '../lib/errors'
import { publicShareQueryOptions, sharedPhotoUrl, shareLink } from '../lib/shares'

/**
 * Public album page: no session, nothing but the token. The API refuses
 * expired, revoked and tampered tokens alike, so the page shows one neutral
 * message for every failure.
 */
export const Route = createFileRoute('/share/$token')({
  component: SharePage,
})

type SharedPhoto = PublicShare['photos'][number]

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

function SharePage() {
  const { t } = useTranslation()
  const { token } = Route.useParams()
  const share = useQuery(publicShareQueryOptions(token))
  const [open, setOpen] = useState<SharedPhoto | null>(null)
  const [outcome, setOutcome] = useState<'copied' | 'shared' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  async function offer(title: string) {
    try {
      setOutcome(await shareLink(title, location.href))
      setShareError(null)
    } catch (error_) {
      setShareError(describeError(error_))
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-raised/80 px-4 py-3 backdrop-blur md:px-8">
        <BrandMark to="/" />
        <ThemeToggle />
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:px-8"
      >
        {share.isPending ? <Spinner className="size-6" label={t('share.loading')} /> : null}
        {share.isError ? (
          <div className="flex flex-col items-start gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">{t('share.unavailableTitle')}</h1>
            <p className="max-w-prose text-ink-muted">
              {share.error instanceof ApiRequestError && share.error.status === HTTP_STATUS.notFound
                ? t('share.unavailableBody')
                : describeError(share.error)}
            </p>
            <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
              {t('share.about')}
            </Link>
          </div>
        ) : null}
        {share.isSuccess ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{share.data.title}</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {t('share.photoCount', { count: share.data.photos.length })}
                  {share.data.expiresAt === null
                    ? ''
                    : t('share.availableUntil', {
                        date: dateFormatter.format(new Date(share.data.expiresAt)),
                      })}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void offer(share.data.title)
                }}
              >
                <Share2 aria-hidden="true" className="size-4" />
                {t('share.shareLink')}
              </Button>
            </div>
            {outcome === null ? null : (
              <p className="text-xs text-ink-muted" role="status">
                {t(outcome === 'copied' ? 'share.linkCopied' : 'share.linkShared')}
              </p>
            )}
            {shareError === null ? null : <Alert tone="error">{shareError}</Alert>}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {share.data.photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    aria-label={t('share.openPhoto', { name: photo.name })}
                    onClick={() => {
                      setOpen(photo)
                    }}
                    className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface-raised p-1.5 text-start focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
                  >
                    <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                      <img
                        src={sharedPhotoUrl(token, photo.id, 'thumbnail')}
                        alt=""
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </span>
                    <span className="truncate px-1 text-xs font-medium">{photo.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
      <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-muted">
        <Trans
          i18nKey="share.footer"
          components={{ home: <Link to="/" className="font-medium underline" /> }}
        />
      </footer>
      <Dialog.Root
        open={open !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content className="fixed inset-4 z-50 flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-card md:inset-10">
            {open === null ? null : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="truncate text-lg font-semibold">
                      {open.name}
                    </Dialog.Title>
                    <Dialog.Description className="text-xs text-ink-muted">
                      {t('share.dimensions', { width: open.width, height: open.height })}
                    </Dialog.Description>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={sharedPhotoUrl(token, open.id, 'file')}
                      download={open.name}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      <Download aria-hidden="true" className="size-4" />
                      {t('share.download')}
                    </a>
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('share.close')}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </Dialog.Close>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                  <img
                    src={sharedPhotoUrl(token, open.id, 'file')}
                    alt={open.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
