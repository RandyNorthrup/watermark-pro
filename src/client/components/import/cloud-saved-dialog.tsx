import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PublicConfig } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import {
  createCloudShare,
  revokeCloudShare,
  type CloudShareLink,
} from '../../lib/imports/cloud-sharing'
import type { CloudSavedFile } from '../../lib/imports/cloud-transfer'
import { PROVIDER_LABELS } from '../../lib/imports/source'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'

interface SavedDialogProps {
  config: PublicConfig
  files: readonly CloudSavedFile[]
}

/** Confirmed provider files and explicit, reversible native link controls. */
export function CloudSavedDialog({ config, files }: SavedDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {t('import.cloudSaved', { total: files.length })}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          // physical: geometry: centering pairs left-1/2 with the equal negative x translation.
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
        >
          <Dialog.Title className="text-xl font-semibold">
            {t('import.cloudSavedTitle')}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-ink-muted">
            {t('import.cloudSharingHint')}
          </Dialog.Description>
          <ul className="flex flex-col gap-4">
            {files.map((file) => (
              <SavedFileRow key={`${file.provider}:${file.id}`} file={file} config={config} />
            ))}
          </ul>
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              {t('gallery.close')}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SavedFileRow({ file, config }: { file: CloudSavedFile; config: PublicConfig }) {
  const { t } = useTranslation()
  const [link, setLink] = useState<CloudShareLink | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  async function share() {
    const owner = captureOfflineOwner()
    setPending(true)
    setError(null)
    try {
      if (link === null) {
        const created = await createCloudShare(config, file)
        owner.assertCurrent()
        setLink(created)
      } else {
        await revokeCloudShare(config, file, link)
        owner.assertCurrent()
        setLink(null)
        setCopied(false)
      }
    } catch (error_) {
      setError(describeError(error_))
    } finally {
      setPending(false)
    }
  }
  async function copy() {
    if (link === null) return
    const owner = captureOfflineOwner()
    try {
      owner.assertCurrent()
      if (file.userId !== owner.userId)
        throw new Error('These cloud files belong to another app account.')
      await navigator.clipboard.writeText(link.url)
      owner.assertCurrent()
      setCopied(true)
    } catch (error_) {
      setError(describeError(error_))
    }
  }
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-3">
      <span className="text-sm font-medium break-all">{file.name}</span>
      <a
        href={file.manageUrl}
        target="_blank"
        rel="noreferrer"
        className="self-start text-sm underline"
      >
        {t('import.openProvider', { provider: PROVIDER_LABELS[file.provider] })}
      </a>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isPending={pending}
          onClick={() => {
            void share()
          }}
        >
          {t(link === null ? 'import.createPublicLink' : 'import.revokePublicLink')}
        </Button>
        {link === null ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void copy()
            }}
          >
            {t(copied ? 'import.linkCopied' : 'import.copyLink')}
          </Button>
        )}
      </div>
      {link === null ? null : (
        <a href={link.url} target="_blank" rel="noreferrer" className="text-xs break-all underline">
          {link.url}
        </a>
      )}
      {error === null ? null : <Alert tone="error">{error}</Alert>}
    </li>
  )
}
