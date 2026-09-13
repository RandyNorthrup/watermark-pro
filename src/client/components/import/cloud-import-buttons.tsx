import { lazy, Suspense, useState } from 'react'

import type { PublicConfig } from '../../../shared/api'
import { DEFAULT_CLOUD_MEDIA_KINDS, type CloudMediaKind } from '../../lib/imports/cloud-media'
import {
  configuredProviders,
  PROVIDER_LABELS,
  type CloudProviderId,
} from '../../lib/imports/source'
import { ProviderLogo } from '../provider-logo'
import { cloudProviderLogo } from '../provider-logo-id'
import { Button } from '../ui/button'

const CloudBrowserDialog = lazy(async () => {
  const module = await import('./cloud-browser-dialog')
  return { default: module.CloudBrowserDialog }
})

interface CloudImportButtonsProps {
  config: PublicConfig
  onImport: (files: File[]) => void
  onError: (message: string) => void
  disabled?: boolean
  /** Omitted for Image; Documents, Video, and Bulk select their supported kinds explicitly. */
  mediaKinds?: readonly CloudMediaKind[]
}

/** Cloud authorization is saved once; later visits open the account's folder browser directly. */
export function CloudImportButtons({
  config,
  onImport,
  onError,
  disabled = false,
  mediaKinds = DEFAULT_CLOUD_MEDIA_KINDS,
}: CloudImportButtonsProps) {
  const [selected, setSelected] = useState<CloudProviderId | null>(null)
  const providers = configuredProviders(config)
  return (
    <>
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setSelected(provider)}
        >
          <ProviderLogo provider={cloudProviderLogo(provider)} />
          {PROVIDER_LABELS[provider]}
        </Button>
      ))}
      {selected === null ? null : (
        <Suspense fallback={null}>
          <CloudBrowserDialog
            key={`${selected}:${mediaKinds.join(',')}`}
            mode="open"
            provider={selected}
            config={config}
            mediaKinds={mediaKinds}
            onImport={onImport}
            onError={onError}
            onClose={() => setSelected(null)}
          />
        </Suspense>
      )}
    </>
  )
}
