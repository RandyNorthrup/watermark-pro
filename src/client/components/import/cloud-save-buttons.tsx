import { UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CloudSavedDialog } from './cloud-saved-dialog'
import type { PublicConfig } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { CloudBatchError, type CloudSavedFile } from '../../lib/imports/cloud-transfer'
import { saveToDropbox } from '../../lib/imports/dropbox-save'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import { saveToOneDrive } from '../../lib/imports/onedrive'
import {
  configuredProviders,
  PROVIDER_LABELS,
  type CloudProviderId,
  type CloudUpload,
  type CloudUploadSource,
} from '../../lib/imports/source'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Button } from '../ui/button'

/** Each provider writes the watermarked photos into its "Lumafoil" folder. */
const SAVERS: Record<
  CloudProviderId,
  (config: PublicConfig, uploads: CloudUploadSource) => Promise<CloudSavedFile[]>
> = {
  google: saveToGoogleDrive,
  dropbox: saveToDropbox,
  onedrive: saveToOneDrive,
}

interface CloudSaveButtonsProps {
  config: PublicConfig
  /**
   * Produces the photos to write, evaluated at click time so the current export
   * settings are captured. Resolving to an empty list is a no-op (nothing ready).
   */
  getUploads: () => Promise<readonly CloudUpload[]> | readonly CloudUpload[]
  /** Reports a successful save so the host can confirm it. */
  onSaved: (provider: CloudProviderId, count: number) => void
  /** Surfaces a failure so the host page can show it in its own alert. */
  onError: (message: string) => void
  disabled?: boolean
}

/**
 * One "Save to <provider>" button per configured cloud service (M16). Each opens
 * the provider's sign-in (a popup — Google GIS, a Dropbox PKCE window, or the
 * MSAL popup) then uploads the watermarked photos into a "Lumafoil" folder.
 * A failure is reported through `onError`; the buttons sit in an inline row with
 * no room for an alert of their own.
 */
export function CloudSaveButtons({
  config,
  getUploads,
  onSaved,
  onError,
  disabled = false,
}: CloudSaveButtonsProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<CloudProviderId | null>(null)
  const [saved, setSaved] = useState<CloudSavedFile[]>([])
  useEffect(() => {
    const changed = () => {
      setSaved([])
      setPending(null)
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed)
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed)
  }, [])
  const providers = configuredProviders(config)
  if (providers.length === 0) {
    return null
  }

  async function save(provider: CloudProviderId) {
    const owner = captureOfflineOwner()
    setPending(provider)
    try {
      const files = await SAVERS[provider](config, getUploads)
      owner.assertCurrent()
      setSaved((previous) => [...previous, ...files])
      if (files.length > 0) onSaved(provider, files.length)
    } catch (error) {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      if (error instanceof CloudBatchError && error.saved.length > 0) {
        setSaved((previous) => [...previous, ...error.saved])
        onSaved(provider, error.saved.length)
      }
      onError(describeError(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || pending !== null}
          isPending={pending === provider}
          onClick={() => {
            void save(provider)
          }}
        >
          <UploadCloud aria-hidden="true" className="size-4" />
          {t('import.saveToProvider', { provider: PROVIDER_LABELS[provider] })}
        </Button>
      ))}
      {saved.length === 0 ? null : <CloudSavedDialog config={config} files={saved} />}
    </>
  )
}
