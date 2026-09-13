import { Check, ChevronRight, FileImage, FileText, Film, Folder, FolderPlus, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CloudConsentNote } from './cloud-consent-note'
import type { PublicConfig } from '../../../shared/api'
import type { CloudConnectionDto, CloudProvider } from '../../../shared/cloud-connections'
import { cloudConnections, connectCloudProvider } from '../../lib/cloud-connections'
import { describeError } from '../../lib/errors'
import {
  CLOUD_ROOT_FOLDER,
  cloudTargetToken,
  createCloudFolder,
  downloadCloudFile,
  listCloudFolder,
  type CloudBrowserItem,
  type CloudFolder,
  type CloudSaveTarget,
} from '../../lib/imports/cloud-folders'
import {
  cloudMediaKind,
  DEFAULT_CLOUD_MEDIA_KINDS,
  type CloudMediaKind,
} from '../../lib/imports/cloud-media'
import { pickFromGoogleDrive, pickGoogleDriveFolder } from '../../lib/imports/google-picker'
import { PROVIDER_LABELS } from '../../lib/imports/source'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { captureOfflineOwner } from '../../lib/offline-context'
import { ProviderLogo } from '../provider-logo'
import { cloudProviderLogo } from '../provider-logo-id'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'

type CloudBrowserDialogProps = {
  provider: CloudProvider
  config: PublicConfig
  mediaKinds?: readonly CloudMediaKind[]
  onClose: () => void
  onError: (message: string) => void
} & (
  | { mode: 'open'; onImport: (files: File[]) => void }
  | { mode: 'save'; onDestination: (target: CloudSaveTarget) => void }
)

const MAX_FOLDER_NAME_LENGTH = 255
function isCurrentOwner(owner: ReturnType<typeof captureOfflineOwner>): boolean {
  try {
    owner.assertCurrent()
    return true
  } catch {
    return false
  }
}

/** One browser for persistent account connections, folder navigation, and explicit destinations. */
export function CloudBrowserDialog(props: CloudBrowserDialogProps) {
  const { t } = useTranslation()
  const { provider, onClose } = props
  const mediaKinds = props.mediaKinds ?? DEFAULT_CLOUD_MEDIA_KINDS
  const [connection, setConnection] = useState<CloudConnectionDto | null>(null)
  const [path, setPath] = useState<CloudFolder[]>([])
  const [items, setItems] = useState<CloudBrowserItem[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isNativePickerOpen, setIsNativePickerOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const requestRevision = useRef(0)
  const folder = path.at(-1) ?? CLOUD_ROOT_FOLDER
  const label = PROVIDER_LABELS[provider]

  async function load(nextPath: CloudFolder[], current: CloudConnectionDto) {
    const owner = captureOfflineOwner()
    const revision = ++requestRevision.current
    setIsLoading(true)
    setSelected(new Set())
    setError(null)
    try {
      if (current.providerAccountId === null)
        throw new Error('The cloud account has not been connected.')
      const token = await cloudTargetToken(
        provider,
        { providerAccountId: current.providerAccountId, generation: current.generation },
        lifetime.current?.signal,
      )
      owner.assertCurrent()
      const listing = await listCloudFolder(
        provider,
        token.accessToken,
        nextPath.at(-1) ?? CLOUD_ROOT_FOLDER,
        mediaKinds,
        lifetime.current?.signal,
      )
      owner.assertCurrent()
      if (!mounted.current || revision !== requestRevision.current) return
      setItems(listing)
      setPath(nextPath)
    } catch (error_) {
      if (!isCurrentOwner(owner)) return
      if (mounted.current && revision === requestRevision.current) setError(describeError(error_))
    } finally {
      if (mounted.current && revision === requestRevision.current) setIsLoading(false)
    }
  }

  async function refresh() {
    const owner = captureOfflineOwner()
    const status = await cloudConnections(lifetime.current?.signal)
    owner.assertCurrent()
    const current = status.connections.find((item) => item.provider === provider)
    if (current === undefined) throw new Error('The cloud connection status is unavailable.')
    if (!mounted.current) return
    setConnection(current)
    if (current.status === 'connected') await load([], current)
    else setIsLoading(false)
  }

  const initialize = useEffectEvent(() => {
    const signal = lifetime.current?.signal
    void refresh().catch((error_: unknown) => {
      if (!mounted.current || signal?.aborted === true) {
        return
      }

      setError(describeError(error_))
      setIsLoading(false)
    })
  })
  const accountChanged = useEffectEvent(() => {
    setConnection(null)
    setItems([])
    setPath([])
    onClose()
  })
  useEffect(() => {
    mounted.current = true
    lifetime.current = new AbortController()
    const changed = () => accountChanged()
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed)
    initialize()
    return () => {
      mounted.current = false
      lifetime.current?.abort()
      controller.current?.abort()
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed)
    }
  }, [])

  async function connect() {
    const owner = captureOfflineOwner()
    const pending = new AbortController()
    controller.current = pending
    setIsConnecting(true)
    setError(null)
    try {
      await connectCloudProvider(provider, pending.signal)
      owner.assertCurrent()
      if (mounted.current) await refresh()
    } catch (error_) {
      if (!isCurrentOwner(owner)) return
      if (mounted.current) setError(describeError(error_))
      else props.onError(describeError(error_))
    } finally {
      if (controller.current === pending) controller.current = null
      if (mounted.current) setIsConnecting(false)
    }
  }

  async function complete() {
    const owner = captureOfflineOwner()
    setError(null)
    setIsImporting(true)
    try {
      if (connection?.providerAccountId == null)
        throw new Error('Connect the cloud account before choosing files.')
      const target = {
        folder,
        providerAccountId: connection.providerAccountId,
        generation: connection.generation,
      }
      const token = await cloudTargetToken(provider, target, lifetime.current?.signal)
      owner.assertCurrent()
      if (props.mode === 'save') {
        owner.assertCurrent()
        if (!mounted.current) return
        props.onDestination(target)
      } else {
        const files: File[] = []
        for (const item of items) {
          if (item.kind !== 'file' || !selected.has(item.id)) continue
          files.push(
            await downloadCloudFile(
              provider,
              token.accessToken,
              item,
              mediaKinds,
              lifetime.current?.signal,
            ),
          )
          owner.assertCurrent()
        }
        if (files.length === 0) throw new Error('Choose at least one file to open.')
        if (!mounted.current) return
        props.onImport(files)
      }
      onClose()
    } catch (error_) {
      if (!isCurrentOwner(owner)) return
      if (mounted.current) setError(describeError(error_))
    } finally {
      if (mounted.current) setIsImporting(false)
    }
  }

  async function createFolder() {
    const owner = captureOfflineOwner()
    setError(null)
    setIsCreating(true)
    try {
      if (connection?.providerAccountId == null)
        throw new Error('Connect the cloud account before creating a folder.')
      const token = await cloudTargetToken(
        provider,
        { providerAccountId: connection.providerAccountId, generation: connection.generation },
        lifetime.current?.signal,
      )
      owner.assertCurrent()
      const created = await createCloudFolder(
        provider,
        token.accessToken,
        folder,
        folderName,
        lifetime.current?.signal,
      )
      owner.assertCurrent()
      setFolderName('')
      await load([...path, created], connection)
    } catch (error_) {
      if (!isCurrentOwner(owner)) return
      if (mounted.current) setError(describeError(error_))
    } finally {
      if (mounted.current) setIsCreating(false)
    }
  }

  async function browseGoogle() {
    const owner = captureOfflineOwner()
    setError(null)
    setIsNativePickerOpen(true)
    try {
      if (connection?.providerAccountId == null) throw new Error('Connect Google Drive first.')
      const expected = {
        providerAccountId: connection.providerAccountId,
        generation: connection.generation,
      }
      owner.assertCurrent()
      if (props.mode === 'save') {
        const destination = await pickGoogleDriveFolder(
          props.config,
          expected,
          lifetime.current?.signal,
        )
        owner.assertCurrent()
        if (destination !== null && mounted.current) {
          props.onDestination(destination)
          onClose()
        }
      } else {
        const files = await pickFromGoogleDrive(
          props.config,
          mediaKinds,
          expected,
          lifetime.current?.signal,
        )
        owner.assertCurrent()
        if (files.length > 0 && mounted.current) {
          props.onImport(files)
          onClose()
        }
      }
    } catch (error_) {
      if (isCurrentOwner(owner) && mounted.current) setError(describeError(error_))
    } finally {
      if (mounted.current) setIsNativePickerOpen(false)
    }
  }

  const isBusy = isLoading || isConnecting || isImporting || isCreating
  return (
    <Dialog.Root
      open={!isNativePickerOpen}
      onOpenChange={(open) => {
        if (!open && !isNativePickerOpen) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="glass-popover fixed inset-x-3 top-[max(1rem,6dvh)] z-50 mx-auto flex max-h-[88dvh] w-auto max-w-xl flex-col overflow-hidden rounded-2xl border border-line shadow-card outline-none">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
                <ProviderLogo provider={cloudProviderLogo(provider)} />
                {label}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {t(
                  props.mode === 'save'
                    ? 'cloudStorage.chooseDestination'
                    : 'cloudStorage.chooseFiles',
                )}
              </Dialog.Description>
              {connection?.accountLabel == null ? null : (
                <p className="mt-1 truncate text-xs text-ink-muted">{connection.accountLabel}</p>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('gallery.close')}>
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </header>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
            {error === null ? null : <Alert tone="error">{error}</Alert>}
            {isLoading ? (
              <div role="status" className="flex min-h-32 items-center justify-center">
                <Spinner label={t('cloudStorage.loading')} />
              </div>
            ) : null}
            {!isLoading && connection?.status === 'connected' ? (
              <>
                {connection.accessScope === 'app_folder' ? (
                  <p className="text-xs text-ink-muted">{t('cloudStorage.dropboxScope')}</p>
                ) : null}
                {provider === 'google' ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-ink-muted">{t('cloudStorage.googleScope')}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void browseGoogle()
                      }}
                      disabled={isBusy}
                    >
                      {t('cloudStorage.browseGoogle')}
                    </Button>
                  </div>
                ) : null}
                <nav
                  aria-label={t('cloudStorage.location')}
                  className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => {
                      void load([], connection)
                    }}
                  >
                    {t(
                      connection.accessScope === 'app_folder'
                        ? 'cloudStorage.appFolder'
                        : 'cloudStorage.root',
                    )}
                  </Button>
                  {path.map((item, index) => (
                    <span key={item.id} className="inline-flex max-w-full items-center">
                      <ChevronRight className="size-3 shrink-0 rtl:-scale-x-100" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="max-w-full truncate normal-case"
                        disabled={isBusy}
                        onClick={() => {
                          void load(path.slice(0, index + 1), connection)
                        }}
                      >
                        {item.name}
                      </Button>
                    </span>
                  ))}
                </nav>
                <div className="max-h-[44dvh] min-h-28 overflow-y-auto overscroll-contain rounded-xl border border-line">
                  {items.length === 0 ? (
                    <p className="p-6 text-center text-sm text-ink-muted">
                      {t('cloudStorage.empty')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {items.map((item) => {
                        const media =
                          item.kind === 'file' ? cloudMediaKind(item.mimeType, item.name) : null
                        let Icon = FileImage
                        if (item.kind === 'folder') Icon = Folder
                        else if (media === 'document') Icon = FileText
                        else if (media === 'video') Icon = Film
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="hover:bg-surface-sunken flex min-h-10 w-full items-center gap-3 px-3 py-2 text-start text-sm aria-pressed:bg-brand-700/20"
                              disabled={isBusy || (props.mode === 'save' && item.kind === 'file')}
                              aria-pressed={
                                item.kind === 'file' ? selected.has(item.id) : undefined
                              }
                              onClick={() => {
                                if (item.kind === 'folder') {
                                  void load([...path, item], connection)
                                } else
                                  setSelected((previous) => {
                                    const next = new Set(previous)
                                    if (next.has(item.id)) next.delete(item.id)
                                    else next.add(item.id)
                                    return next
                                  })
                              }}
                            >
                              <Icon className="size-4 shrink-0 text-brand-500" />
                              <span className="min-w-0 flex-1 truncate normal-case">
                                {item.name}
                              </span>
                              {item.kind === 'file' && selected.has(item.id) ? (
                                <Check className="size-4 shrink-0" />
                              ) : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createFolder()
                  }}
                >
                  <Input
                    aria-label={t('cloudStorage.folderName')}
                    placeholder={t('cloudStorage.folderName')}
                    value={folderName}
                    maxLength={MAX_FOLDER_NAME_LENGTH}
                    onChange={(event) => setFolderName(event.currentTarget.value)}
                    disabled={isBusy}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isBusy || folderName.trim() === ''}
                    isPending={isCreating}
                  >
                    <FolderPlus className="size-4" />
                    {t('cloudStorage.createFolder')}
                  </Button>
                </form>
              </>
            ) : null}
            {!isLoading && connection?.status !== 'connected' ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-ink-muted">
                  {t(
                    connection?.isConfigured === false
                      ? 'cloudStorage.unavailable'
                      : 'cloudStorage.connectHint',
                  )}
                </p>
                <CloudConsentNote provider={provider} />
                <Button
                  onClick={() => {
                    void connect()
                  }}
                  disabled={connection?.isConfigured !== true || isConnecting}
                  isPending={isConnecting}
                >
                  {t('cloudStorage.connect', { provider: label })}
                </Button>
                {isConnecting ? (
                  <Button variant="ghost" onClick={() => controller.current?.abort()}>
                    {t('import.cancel')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <footer className="flex shrink-0 justify-center gap-2 border-t border-line p-4">
            <Button variant="secondary" onClick={onClose}>
              {t('import.cancel')}
            </Button>
            {connection?.status === 'connected' ? (
              <Button
                disabled={isBusy || (props.mode === 'open' && selected.size === 0)}
                isPending={isImporting}
                onClick={() => {
                  void complete()
                }}
              >
                {t(props.mode === 'save' ? 'cloudStorage.useFolder' : 'cloudStorage.openSelected')}
              </Button>
            ) : null}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
