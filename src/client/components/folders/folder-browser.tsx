import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Folder, FolderInput, Pencil, Trash2 } from 'lucide-react'
import { AlertDialog, Dialog } from 'radix-ui'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FolderPicker } from './folder-picker'
import { NewFolderDialog } from './new-folder-dialog'
import {
  FOLDER_POLICY,
  folderNameKey,
  folderNameSchema,
  type FolderDto,
  type FolderKind,
} from '../../../shared/folders'
import { describeError } from '../../lib/errors'
import { folderPath } from '../../lib/folder-tree'
import { deleteFolder, foldersQueryOptions, updateFolder } from '../../lib/folders'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

/** The same compact location bar serves Library and Gallery at desktop and phone widths. */
export function FolderBrowser({
  organizationId,
  kind,
  folderId,
  canManage,
  onNavigate,
}: {
  organizationId: string
  kind: FolderKind
  folderId: string | null
  canManage: boolean
  onNavigate: (folderId: string | null) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [account] = useState(captureOfflineOwner)
  const folders = useQuery(foldersQueryOptions(organizationId, kind))
  const path = folderPath(folders.data ?? [], folderId)
  const current = folders.data?.find((folder) => folder.id === folderId)
  const [deleting, setDeleting] = useState<FolderDto | null>(null)
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: async (folder: FolderDto) => {
      account.assertCurrent()
      await deleteFolder(folder)
      account.assertCurrent()
    },
    onSuccess: async (_value, folder) => {
      account.assertCurrent()
      await onNavigate(folder.parentId)
      await queryClient.invalidateQueries({ queryKey: ['organization', organizationId] })
    },
  })
  const rootName = t(kind === 'photo' ? 'folders.rootPhoto' : 'folders.rootPreset')
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface-raised/45 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full min-w-0 sm:w-56">
          <FolderPicker
            organizationId={organizationId}
            kind={kind}
            value={folderId}
            onChange={(next) => {
              void onNavigate(next)
            }}
            label={t('folders.heading')}
          />
        </div>
        <nav aria-label={t('folders.path')} className="min-w-0 flex-1 self-center">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void onNavigate(null)
                }}
                aria-current={folderId === null ? 'page' : undefined}
              >
                {rootName}
              </Button>
            </li>
            {path?.map((folder) => (
              <li key={folder.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 rtl:rotate-180" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-44"
                  onClick={() => {
                    void onNavigate(folder.id)
                  }}
                  aria-current={folderId === folder.id ? 'page' : undefined}
                >
                  <span className="truncate">{folder.name}</span>
                </Button>
              </li>
            ))}
          </ol>
        </nav>
        {canManage && (folderId === null || current !== undefined) ? (
          <div className="flex flex-wrap items-center gap-2">
            <NewFolderDialog
              key={`${organizationId}-${folderId ?? 'root'}`}
              organizationId={organizationId}
              kind={kind}
              parentId={folderId}
              onCreated={(folder) => onNavigate(folder.id)}
            />
            {current === undefined ? null : (
              <>
                <EditFolderDialog
                  key={`${current.id}-rename`}
                  folder={current}
                  folders={folders.data ?? []}
                  mode="rename"
                />
                <EditFolderDialog
                  key={`${current.id}-move`}
                  folder={current}
                  folders={folders.data ?? []}
                  mode="move"
                />
                <AlertDialog.Root
                  open={deleting !== null}
                  onOpenChange={(open) => setDeleting(open ? current : null)}
                >
                  <AlertDialog.Trigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('folders.delete')}
                      disabled={current.childCount > 0 || current.itemCount > 0}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
                    <AlertDialog.Content className="glass-popover fixed inset-x-4 top-1/3 z-50 mx-auto max-w-sm rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
                      <AlertDialog.Title className="font-semibold">
                        {t('folders.deleteTitle', { name: deleting?.name ?? current.name })}
                      </AlertDialog.Title>
                      <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
                        {t('folders.deleteHint')}
                      </AlertDialog.Description>
                      <div className="mt-4 flex justify-center gap-2">
                        <AlertDialog.Cancel asChild>
                          <Button variant="secondary">{t('folders.cancel')}</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <Button
                            variant="danger"
                            isPending={remove.isPending}
                            onClick={() => {
                              if (deleting !== null) remove.mutate(deleting)
                            }}
                          >
                            {t('folders.delete')}
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              </>
            )}
          </div>
        ) : null}
      </div>
      {(folders.data ?? []).some((folder) => folder.parentId === folderId) ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {folders.data
            ?.filter((folder) => folder.parentId === folderId)
            .map((folder) => (
              <li key={folder.id} className="min-w-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  aria-label={t('folders.open', { name: folder.name })}
                  onClick={() => {
                    void onNavigate(folder.id)
                  }}
                >
                  <Folder aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </Button>
              </li>
            ))}
        </ul>
      ) : null}
      {folders.isError ? <Alert tone="error">{t('folders.loadError')}</Alert> : null}
      {path === null && folderId !== null && folders.isSuccess ? (
        <Alert tone="error">{t('folders.unavailable')}</Alert>
      ) : null}
      {remove.error === null ? null : <Alert tone="error">{describeError(remove.error)}</Alert>}
    </div>
  )
}

function EditFolderDialog({
  folder,
  folders,
  mode,
}: {
  folder: FolderDto
  folders: FolderDto[]
  mode: 'rename' | 'move'
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [account] = useState(captureOfflineOwner)
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(folder)
  const [name, setName] = useState(folder.name)
  const [parent, setParent] = useState(folder.parentId)
  const [validation, setValidation] = useState<string | undefined>()
  const save = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      account.assertCurrent()
      await updateFolder(snapshot, name, parent)
      account.assertCurrent()
    },
    onSuccess: async () => {
      account.assertCurrent()
      await queryClient.invalidateQueries({ queryKey: ['organization', folder.organizationId] })
      account.assertCurrent()
      setOpen(false)
    },
  })
  function show(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen) {
      setSnapshot(folder)
      setName(folder.name)
      setParent(folder.parentId)
      setValidation(undefined)
      save.reset()
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={show}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(mode === 'rename' ? 'folders.rename' : 'folders.moveFolder')}
        >
          {mode === 'rename' ? (
            <Pencil aria-hidden="true" className="size-4" />
          ) : (
            <FolderInput aria-hidden="true" className="size-4" />
          )}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="glass-popover fixed inset-x-4 top-[min(15dvh,6rem)] z-50 mx-auto max-h-[85dvh] max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
          <Dialog.Title className="text-lg font-semibold">
            {t(mode === 'rename' ? 'folders.rename' : 'folders.moveFolder')}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            {t('folders.renameHint')}
          </Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!folderNameSchema.safeParse(name).success) {
                setValidation(t('folders.invalidName'))
                return
              }
              if (
                folders.some(
                  (candidate) =>
                    candidate.id !== folder.id &&
                    candidate.parentId === parent &&
                    folderNameKey(candidate.name) === folderNameKey(name.trim()),
                )
              ) {
                setValidation(t('folders.nameTaken'))
                return
              }
              setValidation(undefined)
              save.mutate()
            }}
          >
            {mode === 'rename' ? (
              <Field label={t('folders.name')} error={validation}>
                {(control) => (
                  <Input
                    {...control}
                    value={name}
                    maxLength={FOLDER_POLICY.nameLength}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                )}
              </Field>
            ) : null}
            <FolderPicker
              organizationId={folder.organizationId}
              kind={folder.kind}
              value={parent}
              onChange={setParent}
              excludedId={folder.id}
            />
            {save.error === null ? null : <Alert tone="error">{describeError(save.error)}</Alert>}
            <div className="flex justify-center gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">{t('folders.cancel')}</Button>
              </Dialog.Close>
              <Button
                type="submit"
                isPending={save.isPending}
                disabled={name.trim() === folder.name && parent === folder.parentId}
              >
                {t('folders.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** One destination picker moves the exact selected items; no implicit recursive content move. */
export function MoveItemsDialog({
  organizationId,
  kind,
  count,
  initialFolderId,
  onMove,
  disabled = false,
  label,
  isIconOnly = false,
}: {
  organizationId: string
  kind: FolderKind
  count: number
  initialFolderId: string | null
  onMove: (folderId: string | null) => Promise<void>
  disabled?: boolean
  label?: string
  isIconOnly?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState(initialFolderId)
  const [account] = useState(captureOfflineOwner)
  const moveSnapshot = useRef(onMove)
  const move = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      account.assertCurrent()
      await moveSnapshot.current(destination)
      account.assertCurrent()
    },
    onSuccess: () => setOpen(false),
  })
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) {
          moveSnapshot.current = onMove
          setDestination(initialFolderId)
          move.reset()
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant={isIconOnly ? 'ghost' : 'secondary'}
          size={isIconOnly ? 'icon' : 'sm'}
          disabled={disabled || count === 0}
          aria-label={label}
          title={label}
        >
          <FolderInput aria-hidden="true" className="size-4" />
          {isIconOnly ? null : t('folders.moveItems')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="glass-popover fixed inset-x-4 top-[min(15dvh,6rem)] z-50 mx-auto max-h-[85dvh] max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
          <Dialog.Title className="text-lg font-semibold">{t('folders.moveItems')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            {t('folders.selection', { count })}
          </Dialog.Description>
          <div className="mt-4 flex flex-col gap-3">
            <FolderPicker
              organizationId={organizationId}
              kind={kind}
              value={destination}
              onChange={setDestination}
              canCreate
            />
            {move.error === null ? null : <Alert tone="error">{describeError(move.error)}</Alert>}
            <div className="flex justify-center gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">{t('folders.cancel')}</Button>
              </Dialog.Close>
              <Button
                isPending={move.isPending}
                disabled={destination === initialFolderId}
                onClick={() => move.mutate()}
              >
                {t('folders.moveHere')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
