import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CheckSquare,
  Download,
  FileSearch,
  Images,
  Search,
  Share2,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { AlertDialog, Dialog } from 'radix-ui'
import { useDeferredValue, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ShareDialog } from './share-dialog'
import type { PhotoDto } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { dateTimeFormatter } from '../../lib/format-date'
import {
  deletePhotos,
  galleryQueryKey,
  photoFileUrl,
  photosQueryOptions,
  photoThumbnailUrl,
  storageUsageQueryOptions,
} from '../../lib/gallery'
import { watermarksQueryOptions } from '../../lib/library'
import { noteRecentWork } from '../../lib/recent-work-events'
import { canRole } from '../../lib/roles'
import { useWorkspaceMedia } from '../../lib/use-workspace-media'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { buttonVariants } from '../ui/button-variants'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'

interface GalleryProps {
  organizationId: string
  role: string | null | undefined
}

const PERCENT = 100
const selectClassName =
  'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

/**
 * Stored photos for the organization: thumbnail grid with search and preset
 * filter, cursor pagination, multi-select with bulk delete, and a lightbox
 * for the full-size image.
 */
export function Gallery({ organizationId, role }: GalleryProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const searchId = useId()
  const presetId = useId()
  const [search, setSearch] = useState('')
  const [presetFilter, setPresetFilter] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState<PhotoDto | null>(null)
  const deferredSearch = useDeferredValue(search)
  const filters = useMemo(
    () => ({ presetId: presetFilter || undefined, search: deferredSearch.trim() || undefined }),
    [presetFilter, deferredSearch],
  )
  const photos = useInfiniteQuery(photosQueryOptions(organizationId, filters))
  const usage = useQuery(storageUsageQueryOptions(organizationId))
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const canDelete = canRole(role, { photo: ['delete'] })
  const canShare = canRole(role, { share: ['create'] })

  const remove = useMutation({
    networkMode: 'always',
    mutationFn: (ids: readonly string[]) => deletePhotos(organizationId, ids),
    onSuccess: async (_deleted, ids) => {
      setSelected((previous) => new Set([...previous].filter((id) => !ids.includes(id))))
      if (open !== null && ids.includes(open.id)) {
        setOpen(null)
      }
      await queryClient.invalidateQueries({ queryKey: galleryQueryKey(organizationId) })
    },
  })

  const items = photos.data?.pages.flatMap((page) => page.photos) ?? []
  const isFiltering = filters.presetId !== undefined || filters.search !== undefined
  const hasAllSelected = items.length > 0 && selected.size === items.length
  let usageCaption: string
  if (usage.isError) usageCaption = describeError(usage.error)
  else if (usage.data === undefined) usageCaption = t('gallery.loadingPhotos')
  else usageCaption = t('gallery.maxCount', { count: usage.data.maxCount })

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card aria-busy={usage.isPending} className="flex flex-col gap-2 p-4">
        <div className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
          <span data-testid="usage-summary" className="min-h-5">
            {usage.data === undefined
              ? t('gallery.storageUsed')
              : t('gallery.usage', {
                  count: usage.data.count,
                  used: formatBytes(usage.data.bytes),
                  max: formatBytes(usage.data.maxBytes),
                })}
          </span>
          <span
            role={usage.isError ? 'alert' : undefined}
            className="min-h-4 text-xs text-ink-muted"
          >
            {usageCaption}
          </span>
        </div>
        <progress
          aria-label={t('gallery.storageUsed')}
          max={usage.data?.maxBytes}
          value={usage.data?.bytes}
          className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
        />
        {usage.data === undefined ? null : (
          <p className="sr-only">
            {t('gallery.storagePercent', {
              percent: Math.round((usage.data.bytes / usage.data.maxBytes) * PERCENT),
            })}
          </p>
        )}
      </Card>

      <div className="flex justify-end">
        <Link to="/app/verify" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <FileSearch aria-hidden="true" className="size-4" />
          {t('gallery.checkPhoto')}
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:min-w-56 sm:flex-1">
          <label htmlFor={searchId} className="text-sm font-medium">
            {t('gallery.search')}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={search}
              placeholder={t('gallery.searchPlaceholder')}
              className="ps-9"
              onChange={(event) => {
                setSearch(event.currentTarget.value)
              }}
            />
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-56">
          <label htmlFor={presetId} className="text-sm font-medium">
            {t('gallery.preset')}
          </label>
          <select
            id={presetId}
            value={presetFilter}
            onChange={(event) => {
              setPresetFilter(event.currentTarget.value)
            }}
            className={selectClassName}
          >
            <option value="">{t('gallery.allPresets')}</option>
            {(presets.data ?? []).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        {canDelete || canShare ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                setSelected(hasAllSelected ? new Set() : new Set(items.map((p) => p.id)))
              }}
            >
              {hasAllSelected ? (
                <CheckSquare aria-hidden="true" className="size-4" />
              ) : (
                <Square aria-hidden="true" className="size-4" />
              )}
              {t(hasAllSelected ? 'gallery.clearSelection' : 'gallery.selectAll')}
            </Button>
            {canShare ? (
              <ShareDialog
                organizationId={organizationId}
                photoIds={[...selected]}
                defaultTitle={t('gallery.photoCount', { count: selected.size })}
                trigger={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={selected.size === 0}
                  >
                    <Share2 aria-hidden="true" className="size-4" />
                    {t('gallery.share')} {selected.size === 0 ? '' : String(selected.size)}
                  </Button>
                }
              />
            ) : null}
            {canDelete ? (
              <DeleteDialog
                count={selected.size}
                isPending={remove.isPending}
                onConfirm={() => {
                  remove.mutate([...selected])
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {remove.isError ? (
        <Alert tone="error" title={t('gallery.deleteErrorTitle')}>
          {describeError(remove.error)}
        </Alert>
      ) : null}

      {photos.isPending ? <Spinner className="size-6" label={t('gallery.loadingPhotos')} /> : null}
      {photos.isError ? (
        <Alert tone="error" title={t('gallery.loadErrorTitle')}>
          {describeError(photos.error)}
        </Alert>
      ) : null}
      {photos.isSuccess && items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <Images aria-hidden="true" className="size-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            {t(isFiltering ? 'gallery.emptyFiltered' : 'gallery.empty')}
          </p>
          {isFiltering ? null : (
            <Link to="/app/editor" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              {t('gallery.openEditor')}
            </Link>
          )}
        </Card>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => {
            const isSelected = selected.has(photo.id)
            return (
              <li key={photo.id} className="relative">
                <button
                  type="button"
                  aria-label={t('gallery.openPhoto', { name: photo.name })}
                  onClick={() => {
                    noteRecentWork(organizationId, { kind: 'photo', photo })
                    setOpen(photo)
                  }}
                  className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface-raised p-1.5 text-start focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                    <GalleryThumbnail
                      organizationId={organizationId}
                      photo={photo}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="truncate px-1 text-xs font-medium">{photo.name}</span>
                  <span className="truncate px-1 text-xs text-ink-muted">
                    {photo.presetName === null
                      ? t('gallery.dimensions', { width: photo.width, height: photo.height })
                      : t('gallery.dimensionsWithPreset', {
                          width: photo.width,
                          height: photo.height,
                          preset: photo.presetName,
                        })}
                  </span>
                </button>
                {canDelete || canShare ? (
                  <label className="absolute start-2.5 top-2.5 flex size-6 cursor-pointer items-center justify-center rounded-md border border-line bg-surface-raised shadow">
                    <input
                      type="checkbox"
                      aria-label={t('gallery.selectPhoto', { name: photo.name })}
                      checked={isSelected}
                      onChange={() => {
                        toggle(photo.id)
                      }}
                      className="accent-brand-600"
                    />
                  </label>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {photos.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          isPending={photos.isFetchingNextPage}
          className="self-center"
          onClick={() => {
            void photos.fetchNextPage()
          }}
        >
          {t('gallery.loadMore')}
        </Button>
      ) : null}

      <GalleryLightbox
        organizationId={organizationId}
        photo={open}
        canDelete={canDelete}
        canShare={canShare}
        isDeleting={remove.isPending}
        onClose={() => {
          setOpen(null)
        }}
        onDelete={(photo) => {
          remove.mutate([photo.id])
        }}
      />
    </div>
  )
}

function GalleryThumbnail({
  organizationId,
  photo,
  ...props
}: {
  organizationId: string
  photo: PhotoDto
  alt: string
  className: string
  loading?: 'lazy' | 'eager'
}) {
  const src = useWorkspaceMedia(organizationId, photoThumbnailUrl(organizationId, photo.id))
  return <img {...props} src={src} />
}

interface DeleteDialogProps {
  count: number
  isPending: boolean
  onConfirm: () => void
}

function DeleteDialog({ count, isPending, onConfirm }: DeleteDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant="danger" size="sm" disabled={count === 0 || isPending}>
          <Trash2 aria-hidden="true" className="size-4" />
          {t('gallery.delete')} {count === 0 ? '' : String(count)}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <AlertDialog.Content
          // physical: geometry: the delete-confirm dialog is centred — left-1/2 pairs with -translate-x-1/2
          className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface-raised p-6 shadow-card"
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {t('gallery.deleteConfirmTitle', { count })}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
            {t('gallery.deleteConfirmBody')}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary">
                {t('gallery.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant="danger" onClick={onConfirm}>
                {t('gallery.delete')}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

interface LightboxProps {
  organizationId: string
  photo: PhotoDto | null
  canDelete: boolean
  canShare: boolean
  isDeleting: boolean
  onClose: () => void
  onDelete: (photo: PhotoDto) => void
}

export function GalleryLightbox({
  organizationId,
  photo,
  canDelete,
  canShare,
  isDeleting,
  onClose,
  onDelete,
}: LightboxProps) {
  const { t } = useTranslation()
  const photoUrl = useWorkspaceMedia(
    organizationId,
    photo === null ? null : photoFileUrl(organizationId, photo.id),
  )
  return (
    <Dialog.Root
      open={photo !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed inset-4 z-50 flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-card md:inset-10">
          {photo === null ? null : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="truncate text-lg font-semibold">
                    {photo.name}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-ink-muted">
                    {photo.presetName === null
                      ? t('gallery.lightboxMeta', {
                          width: photo.width,
                          height: photo.height,
                          size: formatBytes(photo.size),
                          date: dateTimeFormatter.format(new Date(photo.createdAt)),
                        })
                      : t('gallery.lightboxMetaWithPreset', {
                          width: photo.width,
                          height: photo.height,
                          size: formatBytes(photo.size),
                          preset: photo.presetName,
                          date: dateTimeFormatter.format(new Date(photo.createdAt)),
                        })}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label={t('gallery.close')}>
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </Dialog.Close>
              </div>
              {/* Actions on their own row so a long file name never squeezes them, or vice versa, on a phone. */}
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={photoUrl}
                  download={photo.name}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {t('gallery.download')}
                </a>
                {canShare ? (
                  <ShareDialog
                    organizationId={organizationId}
                    photoIds={[photo.id]}
                    defaultTitle={photo.name}
                    trigger={
                      <Button type="button" variant="secondary" size="sm">
                        <Share2 aria-hidden="true" className="size-4" />
                        {t('gallery.share')}
                      </Button>
                    }
                  />
                ) : null}
                {canDelete ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    isPending={isDeleting}
                    onClick={() => {
                      onDelete(photo)
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t('gallery.delete')}
                  </Button>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                <img
                  src={photoUrl}
                  alt={photo.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
