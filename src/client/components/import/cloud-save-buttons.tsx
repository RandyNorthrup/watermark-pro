import { UploadCloud } from 'lucide-react'
import { useState } from 'react'

import type { PublicConfig } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { saveToDropbox } from '../../lib/imports/dropbox-save'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import { saveToOneDrive } from '../../lib/imports/onedrive'
import {
  configuredProviders,
  PROVIDER_LABELS,
  type CloudProviderId,
  type CloudUpload,
} from '../../lib/imports/source'
import { Button } from '../ui/button'

/** Each provider writes the watermarked photos into its "Watermark Pro" folder. */
const SAVERS: Record<
  CloudProviderId,
  (config: PublicConfig, uploads: readonly CloudUpload[]) => Promise<void>
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
 * MSAL popup) then uploads the watermarked photos into a "Watermark Pro" folder.
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
  const [pending, setPending] = useState<CloudProviderId | null>(null)
  const providers = configuredProviders(config)
  if (providers.length === 0) {
    return null
  }

  async function save(provider: CloudProviderId) {
    setPending(provider)
    try {
      const uploads = await getUploads()
      if (uploads.length === 0) {
        return
      }
      await SAVERS[provider](config, uploads)
      onSaved(provider, uploads.length)
    } catch (error) {
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
          disabled={disabled}
          isPending={pending === provider}
          onClick={() => {
            void save(provider)
          }}
        >
          <UploadCloud aria-hidden="true" className="size-4" />
          Save to {PROVIDER_LABELS[provider]}
        </Button>
      ))}
    </>
  )
}
