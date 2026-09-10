import { ChevronRight, FileImage, Folder } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PublicConfig } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import {
  acquireGraphToken,
  downloadOneDriveImage,
  listOneDriveImages,
  type OneDriveFolder,
  type OneDriveImage,
  type OneDriveItem,
} from '../../lib/imports/onedrive'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { captureOfflineOwner } from '../../lib/offline-context'
import { ProviderLogo } from '../provider-logo'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

interface OneDriveDialogProps {
  config: PublicConfig
  /** Receives the downloaded images; the dialog then closes. */
  onImport: (files: File[]) => void
  trigger: ReactNode
}

/**
 * Browses the member's OneDrive through Microsoft Graph (auth via MSAL popup)
 * and hands the chosen images back through `onImport`. Folders navigate in
 * place with a breadcrumb; images are multi-selected with checkboxes and
 * downloaded through their pre-authenticated links on "Add selected". A failed
 * sign-in, listing or download is shown in an alert without closing the dialog.
 * Renders nothing when OneDrive is not configured, so it is safe to mount
 * unconditionally.
 */
export function OneDriveDialog({ config, onImport, trigger }: OneDriveDialogProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [items, setItems] = useState<OneDriveItem[]>([])
  const [path, setPath] = useState<OneDriveFolder[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const changed = () => {
      setToken(null)
      setItems([])
      setPath([])
      setSelected(new Set())
      setError(null)
      setIsOpen(false)
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed)
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed)
  }, [])

  const clientId = config.microsoftClientId
  if (clientId === null) {
    return null
  }

  function reset() {
    setToken(null)
    setItems([])
    setPath([])
    setSelected(new Set())
    setError(null)
    setIsLoading(false)
    setIsImporting(false)
  }

  async function connect() {
    if (clientId === null) {
      return
    }
    const owner = captureOfflineOwner()
    setIsLoading(true)
    setError(null)
    try {
      const acquired = await acquireGraphToken(clientId)
      owner.assertCurrent()
      const listing = await listOneDriveImages(acquired)
      owner.assertCurrent()
      setToken(acquired)
      setItems(listing)
      setPath([])
      setSelected(new Set())
    } catch (error_) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      setError(describeError(error_))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadFolder(nextPath: OneDriveFolder[]) {
    if (token === null) {
      return
    }
    const owner = captureOfflineOwner()
    setIsLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const listing = await listOneDriveImages(token, nextPath.at(-1)?.id)
      owner.assertCurrent()
      setItems(listing)
      setPath(nextPath)
    } catch (error_) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      setError(describeError(error_))
    } finally {
      setIsLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function addSelected() {
    const owner = captureOfflineOwner()
    const chosen = items.filter(
      (item): item is OneDriveImage => item.kind === 'image' && selected.has(item.id),
    )
    if (chosen.length === 0) {
      return
    }
    setIsImporting(true)
    setError(null)
    try {
      const files = await Promise.all(chosen.map((image) => downloadOneDriveImage(image)))
      owner.assertCurrent()
      onImport(files)
      setIsOpen(false)
    } catch (error_) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      setError(describeError(error_))
    } finally {
      setIsImporting(false)
    }
  }

  const selectedCount = selected.size

  function renderBody(): ReactNode {
    if (isLoading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <Spinner className="size-6 text-ink-muted" label={t('import.onedrive.loading')} />
        </div>
      )
    }
    if (items.length === 0) {
      return (
        <p className="flex h-40 items-center justify-center px-4 text-center text-sm text-ink-muted">
          {t('import.onedrive.empty')}
        </p>
      )
    }
    return (
      <ul className="divide-y divide-line">
        {items.map((item) =>
          item.kind === 'folder' ? (
            <li key={item.id}>
              <button
                type="button"
                className="hover:bg-surface-sunken flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm"
                onClick={() => {
                  void loadFolder([...path, item])
                }}
                disabled={isImporting}
              >
                <Folder aria-hidden="true" className="size-4 shrink-0 text-brand-500" />
                <span className="truncate">{item.name}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="ms-auto size-4 shrink-0 text-ink-muted rtl:-scale-x-100"
                />
              </button>
            </li>
          ) : (
            <li key={item.id}>
              <label className="hover:bg-surface-sunken flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-brand-500"
                  checked={selected.has(item.id)}
                  onChange={() => {
                    toggle(item.id)
                  }}
                  disabled={isImporting}
                />
                <FileImage aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                <span className="truncate">{item.name}</span>
              </label>
            </li>
          ),
        )}
      </ul>
    )
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        if (next) {
          reset()
          void connect()
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          // physical: geometry: the OneDrive dialog is centred — left-1/2 pairs with -translate-x-1/2
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card"
        >
          <div>
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <ProviderLogo provider="onedrive" />
              {t('import.onedrive.title')}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              {t('import.onedrive.description')}
            </Dialog.Description>
          </div>

          <nav
            aria-label={t('import.onedrive.folderPath')}
            className="flex flex-wrap items-center gap-1 text-sm"
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1 font-medium text-brand-600 hover:underline disabled:text-ink disabled:no-underline dark:text-brand-300"
              onClick={() => {
                void loadFolder([])
              }}
              disabled={path.length === 0 || isLoading}
            >
              <ProviderLogo provider="onedrive" className="size-4" />
              {t('import.onedrive.name')}
            </button>
            {path.map((folder, index) => {
              const isCurrent = index === path.length - 1
              return (
                <span key={folder.id} className="inline-flex items-center gap-1">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 text-ink-muted rtl:-scale-x-100"
                  />
                  <button
                    type="button"
                    className="rounded px-1 text-brand-600 hover:underline disabled:text-ink disabled:no-underline dark:text-brand-300"
                    onClick={() => {
                      void loadFolder(path.slice(0, index + 1))
                    }}
                    disabled={isCurrent || isLoading}
                    aria-current={isCurrent ? 'location' : undefined}
                  >
                    {folder.name}
                  </button>
                </span>
              )
            })}
          </nav>

          <div className="min-h-40 flex-1 overflow-y-auto rounded-lg border border-line">
            {renderBody()}
          </div>

          {error === null ? null : (
            <Alert tone="error" title={t('import.onedrive.errorTitle')}>
              {error}
              <div className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void connect()
                  }}
                >
                  {t('import.onedrive.tryAgain')}
                </Button>
              </div>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink-muted">
              {selectedCount === 0
                ? t('import.onedrive.noneSelected')
                : t('import.onedrive.selectedCount', { count: selectedCount })}
            </span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  {t('import.cancel')}
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                isPending={isImporting}
                disabled={selectedCount === 0}
                onClick={() => {
                  void addSelected()
                }}
              >
                {t('import.onedrive.addSelected')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
