import { Download } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { describeError } from '../../lib/errors'
import { importFromUrl } from '../../lib/imports/url'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

interface UrlImportDialogProps {
  organizationId: string
  /** Receives the fetched photo; the dialog then closes. */
  onImport: (file: File) => void
  trigger: ReactNode
}

/**
 * Fetches an image from a link the member pastes and hands it back through
 * `onImport`. The Worker performs the actual fetch under its SSRF policy; a
 * rejected link (unsupported, too large, wrong type, rate-limited) is shown in
 * an alert without closing the dialog.
 */
export function UrlImportDialog({ organizationId, onImport, trigger }: UrlImportDialogProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(0)

  async function fetchPhoto() {
    const request = ++requests.current
    setIsFetching(true)
    setError(null)
    try {
      const owner = captureOfflineOwner()
      const file = await importFromUrl(organizationId, url.trim())
      owner.assertCurrent()
      if (request !== requests.current) return
      onImport(file)
      setIsOpen(false)
    } catch (error_) {
      if (request === requests.current) setError(describeError(error_))
    } finally {
      if (request === requests.current) setIsFetching(false)
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        requests.current += 1
        setIsOpen(next)
        if (next) {
          setUrl('')
          setError(null)
          setIsFetching(false)
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          // physical: geometry: the URL-import dialog is centred — left-1/2 pairs with -translate-x-1/2
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card"
        >
          <div>
            <Dialog.Title className="text-lg font-semibold">{t('import.url.title')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              {t('import.url.description')}
            </Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void fetchPhoto()
            }}
          >
            <Field label={t('import.url.linkLabel')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="url"
                  required
                  placeholder="https://example.com/photo.jpg"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.currentTarget.value)
                  }}
                />
              )}
            </Field>
            {error === null ? null : (
              <Alert tone="error" title={t('import.url.errorTitle')}>
                {error}
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  {t('import.cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" isPending={isFetching} disabled={url.trim().length === 0}>
                <Download aria-hidden="true" className="size-4" />
                {t('import.url.fetch')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
