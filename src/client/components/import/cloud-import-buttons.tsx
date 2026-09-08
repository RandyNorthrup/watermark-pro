import { Cloud } from 'lucide-react'
import { useState } from 'react'

import { OneDriveDialog } from './onedrive-dialog'
import type { PublicConfig } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { pickFromDropbox } from '../../lib/imports/dropbox-chooser'
import { pickFromGoogleDrive } from '../../lib/imports/google-picker'
import {
  configuredProviders,
  PROVIDER_LABELS,
  type CloudProviderId,
} from '../../lib/imports/source'
import { Button } from '../ui/button'

interface CloudImportButtonsProps {
  config: PublicConfig
  /** Receives the chosen photos; empty when the picker was cancelled. */
  onImport: (files: File[]) => void
  /** Surfaces a picker failure so the host page can show it in its own alert. */
  onError: (message: string) => void
  /** Disables the buttons while the host is busy (e.g. a batch is running). */
  disabled?: boolean
}

/** The imperative pickers (Google, Dropbox) open a vendor popup and resolve Files directly. */
const IMPERATIVE_PICKERS: Partial<
  Record<CloudProviderId, (config: PublicConfig) => Promise<File[]>>
> = {
  google: pickFromGoogleDrive,
  dropbox: pickFromDropbox,
}

/**
 * One "import from <provider>" button per cloud service the deployment has
 * configured (M16). Google Drive and Dropbox drive a vendor popup imperatively;
 * OneDrive needs an in-app browse dialog (MSAL sign-in then Microsoft Graph), so
 * it renders its own component. A cancelled picker resolves to no files and is a
 * no-op; a failure is reported through `onError` because these buttons sit in an
 * inline row with no room for an alert of their own.
 */
export function CloudImportButtons({
  config,
  onImport,
  onError,
  disabled = false,
}: CloudImportButtonsProps) {
  const [pending, setPending] = useState<CloudProviderId | null>(null)
  const providers = configuredProviders(config)
  if (providers.length === 0) {
    return null
  }

  async function runImperative(
    provider: CloudProviderId,
    pick: (config: PublicConfig) => Promise<File[]>,
  ) {
    setPending(provider)
    try {
      const files = await pick(config)
      if (files.length > 0) {
        onImport(files)
      }
    } catch (error) {
      onError(describeError(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      {providers.map((provider) => {
        const label = PROVIDER_LABELS[provider]
        if (provider === 'onedrive') {
          return (
            <OneDriveDialog
              key={provider}
              config={config}
              onImport={onImport}
              trigger={
                <Button type="button" variant="secondary" size="sm" disabled={disabled}>
                  <Cloud aria-hidden="true" className="size-4" />
                  {label}
                </Button>
              }
            />
          )
        }
        const pick = IMPERATIVE_PICKERS[provider]
        if (pick === undefined) {
          return null
        }
        return (
          <Button
            key={provider}
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            isPending={pending === provider}
            onClick={() => {
              void runImperative(provider, pick)
            }}
          >
            <Cloud aria-hidden="true" className="size-4" />
            {label}
          </Button>
        )
      })}
    </>
  )
}
