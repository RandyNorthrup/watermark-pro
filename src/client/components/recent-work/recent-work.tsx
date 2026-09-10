import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Image, LayoutGrid, List, Stamp, Table2 } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { RecentThumbnail } from './recent-thumbnail'
import type { PhotoDto } from '../../../shared/api'
import {
  DEFAULT_RECENT_VIEW,
  RECENT_VIEWS,
  recentResourceKey,
  type RecentView,
  type RecentWorkItem,
} from '../../../shared/recent-work'
import { describeError } from '../../lib/errors'
import { deletePhotos, galleryQueryKey, photoFileUrl } from '../../lib/gallery'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { captureOfflineOwner, currentOfflineUser } from '../../lib/offline-context'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { offlineStatus, subscribeOfflineStatus } from '../../lib/offline-status'
import {
  changeRecentView,
  recentItemIdentity,
  recentViewQueryOptions,
  recentWorkQueryOptions,
  subscribeRecentWork,
} from '../../lib/recent-work'
import { noteRecentWork } from '../../lib/recent-work-events'
import { recentWorkProblem } from '../../lib/recent-work-notifications'
import { canRole } from '../../lib/roles'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { buttonVariants } from '../ui/button-variants'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'

const Viewer = lazy(async () => {
  const module = await import('../gallery/gallery')
  return { default: module.GalleryLightbox }
})
const VIEW_ICONS = { thumbnails: LayoutGrid, list: List, details: Table2 }
const VIEW_LABELS = {
  thumbnails: 'recent.views.thumbnails',
  list: 'recent.views.list',
  details: 'recent.views.details',
} as const
const DETAIL_COLUMNS = [
  'recent.name',
  'recent.type',
  'recent.location',
  'recent.lastUsed',
  'recent.status',
] as const

interface RecentWorkProps {
  organizationId: string
  organizationName: string
  role: string | null | undefined
}

function itemName(item: RecentWorkItem): string {
  return item.kind === 'photo' ? item.photo.name : item.preset.name
}

/** Office-style quick access shows only this account's actual resource activity. */
export function RecentWork({ organizationId, organizationName, role }: RecentWorkProps) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const userId = currentOfflineUser()
  const historyOptions = recentWorkQueryOptions(organizationId)
  const viewOptions = recentViewQueryOptions()
  const history = useQuery(historyOptions)
  const preference = useQuery(viewOptions)
  const sync = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const [search, setSearch] = useState('')
  const [photo, setPhoto] = useState<PhotoDto | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const mode = preference.data ?? DEFAULT_RECENT_VIEW
  const locale = i18n.resolvedLanguage
  // Cold Intl initialization is expensive; loading and empty views render no dates.
  // Cache only the formatter for this locale, never account content or formatted values.
  const formatUsedAt = useMemo(() => {
    let formatter: Intl.DateTimeFormat | undefined
    return (usedAt: string) => {
      formatter ??= new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
      return formatter.format(new Date(usedAt))
    }
  }, [locale])
  useEffect(
    () =>
      subscribeRecentWork(() => {
        void client.invalidateQueries({ queryKey: recentWorkQueryOptions(organizationId).queryKey })
        void client.invalidateQueries({ queryKey: recentViewQueryOptions().queryKey })
      }),
    [client, organizationId, userId],
  )
  useEffect(() => {
    if (!sync.syncing)
      void client.invalidateQueries({ queryKey: recentWorkQueryOptions(organizationId).queryKey })
  }, [client, organizationId, userId, sync.pending, sync.syncing])
  useEffect(() => {
    const clear = () => {
      setPhoto(null)
      setOpenError(null)
      setOpening(false)
      setSearch('')
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, clear)
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, clear)
  }, [])

  const changeView = useMutation({
    networkMode: 'always',
    scope: { id: `recent-view:${String(viewOptions.queryKey[1])}` },
    mutationFn: async (input: {
      view: RecentView
      owner: ReturnType<typeof captureOfflineOwner>
    }) => {
      input.owner.assertCurrent()
      await changeRecentView(input.view)
    },
    onMutate: (input) => {
      input.owner.assertCurrent()
      client.setQueryData(viewOptions.queryKey, input.view)
    },
  })
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => deletePhotos(organizationId, [id]),
    onSuccess: () => {
      setPhoto(null)
      void client.invalidateQueries({ queryKey: historyOptions.queryKey })
      void client.invalidateQueries({ queryKey: galleryQueryKey(organizationId) })
    },
  })

  async function openPhoto(item: PhotoDto) {
    const owner = captureOfflineOwner()
    setOpening(true)
    setOpenError(null)
    try {
      await loadWorkspaceMedia(organizationId, photoFileUrl(organizationId, item.id))
      owner.assertCurrent()
      noteRecentWork(organizationId, { kind: 'photo', photo: item })
      setPhoto(item)
    } catch (error) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      setOpenError(describeError(error))
    } finally {
      try {
        owner.assertCurrent()
        setOpening(false)
      } catch {
        // The account-boundary listener already reset the outgoing UI.
      }
    }
  }

  const items = (history.isError ? [] : (history.data?.items ?? [])).filter((item) =>
    (item.kind === 'photo' ? item.photo.name : item.preset.name)
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  )
  const pending = new Set(history.data?.pendingKeys)
  function openLink(item: RecentWorkItem, content?: ReactNode, className?: string) {
    return item.kind === 'photo' ? (
      <button
        type="button"
        aria-label={itemName(item)}
        className={className ?? 'min-h-11 text-start font-medium break-words hover:underline'}
        disabled={opening}
        onClick={() => {
          void openPhoto(item.photo)
        }}
      >
        {content ?? itemName(item)}
      </button>
    ) : (
      <Link
        to="/app/library/$watermarkId"
        aria-label={itemName(item)}
        params={{ watermarkId: item.preset.id }}
        className={
          className ?? 'inline-flex min-h-11 items-center font-medium break-words hover:underline'
        }
      >
        {content ?? itemName(item)}
      </Link>
    )
  }
  function type(item: RecentWorkItem) {
    return t(item.kind === 'photo' ? 'recent.photo' : 'recent.preset')
  }
  function status(item: RecentWorkItem) {
    const key = recentResourceKey(recentItemIdentity(item))
    const state = history.data?.resourceStates[key]
    if (state === 'blocked' || state === 'conflict') return t('recent.needsAttention')
    if (state === 'pending') return t('recent.workPending')
    return t(pending.has(key) ? 'recent.pending' : 'recent.saved')
  }
  function used(item: RecentWorkItem) {
    return <time dateTime={item.usedAt}>{formatUsedAt(item.usedAt)}</time>
  }

  return (
    <section aria-labelledby="recent-work-heading" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recent-work-heading" className="text-xl font-semibold tracking-tight">
            {t('recent.heading')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t('recent.description')}</p>
        </div>
        <div
          role="group"
          aria-label={t('recent.viewLabel')}
          className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-raised p-1"
        >
          {RECENT_VIEWS.map((view) => {
            const Icon = VIEW_ICONS[view]
            return (
              <Button
                key={view}
                type="button"
                size="sm"
                variant={mode === view ? 'primary' : 'ghost'}
                aria-pressed={mode === view}
                onClick={() => changeView.mutate({ view, owner: captureOfflineOwner() })}
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(VIEW_LABELS[view])}
              </Button>
            )
          })}
        </div>
      </header>
      <Input
        type="search"
        aria-label={t('recent.search')}
        placeholder={t('recent.search')}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        className="max-w-sm"
      />
      <div className="flex min-h-36 flex-col gap-4">
        {history.isPending ? (
          <div className="flex min-h-36 items-center justify-center">
            <Spinner label={t('recent.loading')} />
          </div>
        ) : null}
        {history.isError ? (
          <Alert tone="error" title={t('recent.loadError')}>
            {describeError(history.error)}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void history.refetch()
              }}
            >
              {t('recent.retry')}
            </Button>
          </Alert>
        ) : null}
        {preference.isError || changeView.isError ? (
          <Alert tone="error">{t('recent.preferenceError')}</Alert>
        ) : null}
        {openError === null ? null : <Alert tone="error">{openError}</Alert>}
        {remove.isError ? <Alert tone="error">{describeError(remove.error)}</Alert> : null}
        {recentWorkProblem(organizationId) === null ? null : (
          <Alert tone="info">{t('recent.activityPending')}</Alert>
        )}
        {history.isSuccess && items.length === 0 ? (
          <Card className="flex min-h-36 flex-col items-start justify-center gap-3">
            <p className="text-sm text-ink-muted">
              {t(search === '' ? 'recent.empty' : 'recent.noMatches')}
            </p>
            <Link to="/app/editor" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('recent.start')}
            </Link>
          </Card>
        ) : null}
        {mode === 'details' && items.length > 0 ? (
          <div
            className="min-w-0 overflow-x-auto rounded-card border border-line bg-surface-raised"
            role="region"
            aria-label={t('recent.detailsLabel')}
            tabIndex={0}
          >
            <table className="w-full min-w-[38rem] text-start text-sm">
              <thead>
                <tr className="border-b border-line">
                  {DETAIL_COLUMNS.map((key) => (
                    <th key={key} scope="col" className="px-4 py-3 text-start font-medium">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={recentResourceKey(recentItemIdentity(item))}
                    className="border-b border-line last:border-0"
                  >
                    <td className="max-w-xs px-4 py-2">{openLink(item)}</td>
                    <td className="px-4 py-2">{type(item)}</td>
                    <td className="px-4 py-2">
                      {organizationName}
                      <span className="block text-xs text-ink-muted">
                        {t(item.kind === 'photo' ? 'recent.gallery' : 'recent.library')}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{used(item)}</td>
                    <td className="px-4 py-2">{status(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {mode !== 'details' && items.length > 0 ? (
          <ul
            aria-label={t('recent.itemsLabel')}
            className={
              mode === 'thumbnails'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                : 'flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised'
            }
          >
            {items.map((item) => {
              const Icon = item.kind === 'photo' ? Image : Stamp
              return (
                <li key={recentResourceKey(recentItemIdentity(item))}>
                  {mode === 'thumbnails' ? (
                    <Card className="flex h-full min-w-0 flex-col gap-2 p-0">
                      {openLink(
                        item,
                        <>
                          <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
                            <RecentThumbnail item={item} />
                          </span>
                          <span className="block font-medium break-words">{itemName(item)}</span>
                        </>,
                        'flex w-full min-w-0 flex-col gap-2 rounded-card p-3 text-start focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none',
                      )}
                      <div className="min-w-0 px-3 pb-3">
                        <p className="text-xs text-ink-muted">
                          {type(item)} · {status(item)}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">{used(item)}</p>
                      </div>
                    </Card>
                  ) : (
                    <div className="flex min-w-0 items-center gap-3 px-4 py-2">
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                      <div className="min-w-0 flex-1">
                        {openLink(item)}
                        <p className="text-xs text-ink-muted">
                          {type(item)} · {status(item)}
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-xs text-ink-muted sm:block">
                        {used(item)}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      {photo === null || history.isError ? null : (
        <Suspense fallback={<Spinner label={t('recent.loading')} />}>
          <Viewer
            organizationId={organizationId}
            photo={photo}
            canDelete={canRole(role, { photo: ['delete'] })}
            canShare={canRole(role, { share: ['create'] })}
            isDeleting={remove.isPending}
            onClose={() => setPhoto(null)}
            onDelete={(item) => remove.mutate(item.id)}
          />
        </Suspense>
      )}
    </section>
  )
}
