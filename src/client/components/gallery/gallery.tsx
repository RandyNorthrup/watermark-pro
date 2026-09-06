import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckSquare, Download, Images, Search, Share2, Square, Trash2, X } from 'lucide-react'
import { AlertDialog, Dialog } from 'radix-ui'
import { useDeferredValue, useId, useMemo, useState } from 'react'

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
import { canRole } from '../../lib/roles'
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
  'h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

/**
 * Stored photos for the organization: thumbnail grid with search and preset
 * filter, cursor pagination, multi-select with bulk delete, and a lightbox
 * for the full-size image.
 */
export function Gallery({ organizationId, role }: GalleryProps) {
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
      {usage.data === undefined ? null : (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span data-testid="usage-summary">
              {`${String(usage.data.count)} photo${usage.data.count === 1 ? '' : 's'} · ${formatBytes(usage.data.bytes)} of ${formatBytes(usage.data.maxBytes)}`}
            </span>
            <span className="text-xs text-ink-muted">
              Up to {String(usage.data.maxCount)} photos per organization
            </span>
          </div>
          <progress
            aria-label="Storage used"
            max={usage.data.maxBytes}
            value={usage.data.bytes}
            className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
          />
          <p className="sr-only">
            {String(Math.round((usage.data.bytes / usage.data.maxBytes) * PERCENT))}% of storage
            used
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor={searchId} className="text-sm font-medium">
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={search}
              placeholder="Photo name"
              className="pl-9"
              onChange={(event) => {
                setSearch(event.currentTarget.value)
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={presetId} className="text-sm font-medium">
            Preset
          </label>
          <select
            id={presetId}
            value={presetFilter}
            onChange={(event) => {
              setPresetFilter(event.currentTarget.value)
            }}
            className={selectClassName}
          >
            <option value="">All presets</option>
            {(presets.data ?? []).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        {(canDelete || canShare) && items.length > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelected(
                  selected.size === items.length ? new Set() : new Set(items.map((p) => p.id)),
                )
              }}
            >
              {selected.size === items.length ? (
                <CheckSquare aria-hidden="true" className="size-4" />
              ) : (
                <Square aria-hidden="true" className="size-4" />
              )}
              {selected.size === items.length ? 'Clear selection' : 'Select all'}
            </Button>
            {canShare ? (
              <ShareDialog
                organizationId={organizationId}
                photoIds={[...selected]}
                defaultTitle={`${String(selected.size)} photo${selected.size === 1 ? '' : 's'}`}
                trigger={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={selected.size === 0}
                  >
                    <Share2 aria-hidden="true" className="size-4" />
                    Share {selected.size === 0 ? '' : String(selected.size)}
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
        <Alert tone="error" title="Could not delete">
          {describeError(remove.error)}
        </Alert>
      ) : null}

      {photos.isPending ? <Spinner className="size-6" label="Loading photos" /> : null}
      {photos.isError ? (
        <Alert tone="error" title="Could not load the gallery">
          {describeError(photos.error)}
        </Alert>
      ) : null}
      {photos.isSuccess && items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <Images aria-hidden="true" className="size-8 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            {isFiltering
              ? 'No photos match these filters.'
              : 'No photos yet. Save one from the editor or a whole batch from the bulk tool.'}
          </p>
          {isFiltering ? null : (
            <Link to="/app/editor" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Open the editor
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
                  aria-label={`Open ${photo.name}`}
                  onClick={() => {
                    setOpen(photo)
                  }}
                  className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface-raised p-1.5 text-left focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                    <img
                      src={photoThumbnailUrl(organizationId, photo.id)}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="truncate px-1 text-xs font-medium">{photo.name}</span>
                  <span className="truncate px-1 text-xs text-ink-muted">
                    {String(photo.width)} × {String(photo.height)}
                    {photo.presetName === null ? '' : ` · ${photo.presetName}`}
                  </span>
                </button>
                {canDelete || canShare ? (
                  <label className="absolute top-2.5 left-2.5 flex size-6 cursor-pointer items-center justify-center rounded-md border border-line bg-surface-raised shadow">
                    <input
                      type="checkbox"
                      aria-label={`Select ${photo.name}`}
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
          Load more
        </Button>
      ) : null}

      <Lightbox
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

interface DeleteDialogProps {
  count: number
  isPending: boolean
  onConfirm: () => void
}

function DeleteDialog({ count, isPending, onConfirm }: DeleteDialogProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant="danger" size="sm" disabled={count === 0 || isPending}>
          <Trash2 aria-hidden="true" className="size-4" />
          Delete {count === 0 ? '' : String(count)}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface-raised p-6 shadow-card">
          <AlertDialog.Title className="text-lg font-semibold">
            Delete {String(count)} photo{count === 1 ? '' : 's'}?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
            The files and thumbnails are removed from storage. This cannot be undone.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant="danger" onClick={onConfirm}>
                Delete
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

function Lightbox({
  organizationId,
  photo,
  canDelete,
  canShare,
  isDeleting,
  onClose,
  onDelete,
}: LightboxProps) {
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
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-lg font-semibold">
                    {photo.name}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-ink-muted">
                    {String(photo.width)} × {String(photo.height)} · {formatBytes(photo.size)}
                    {photo.presetName === null ? '' : ` · ${photo.presetName}`} ·{' '}
                    {dateTimeFormatter.format(new Date(photo.createdAt))}
                  </Dialog.Description>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={photoFileUrl(organizationId, photo.id)}
                    download={photo.name}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Download
                  </a>
                  {canShare ? (
                    <ShareDialog
                      organizationId={organizationId}
                      photoIds={[photo.id]}
                      defaultTitle={photo.name}
                      trigger={
                        <Button type="button" variant="secondary" size="sm">
                          <Share2 aria-hidden="true" className="size-4" />
                          Share
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
                      Delete
                    </Button>
                  ) : null}
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="Close">
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </Dialog.Close>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                <img
                  src={photoFileUrl(organizationId, photo.id)}
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
