/**
 * Cloud import sources (M16). Each provider (Google Drive, Dropbox, OneDrive)
 * is offered only when the deployment has configured its keys — the public
 * config carries them, and `configuredProviders` reports which are usable. The
 * actual pickers load their vendor SDK on demand and live in the per-provider
 * modules (`google-picker`, `dropbox-chooser`, `onedrive`); this file is the
 * shared, DOM-free contract that decides which providers to show.
 */
import type { PublicConfig } from '../../../shared/api'

export type CloudProviderId = 'google' | 'dropbox' | 'onedrive'

/** A watermarked photo to write back to a cloud provider (M16 save-to-cloud). */
export interface CloudUpload {
  readonly name: string
  readonly blob: Blob
}

/** Display labels for the import menu. */
export const PROVIDER_LABELS: Record<CloudProviderId, string> = {
  google: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
}

/** Whether the deployment has configured every key a provider needs. */
export function isProviderConfigured(config: PublicConfig, provider: CloudProviderId): boolean {
  switch (provider) {
    case 'google': {
      return (
        config.googleOAuthClientId !== null &&
        config.googlePickerApiKey !== null &&
        config.googlePickerAppId !== null
      )
    }
    case 'dropbox': {
      return config.dropboxAppKey !== null
    }
    case 'onedrive': {
      return config.microsoftClientId !== null
    }
  }
}

/** The configured providers, in a stable menu order. */
export function configuredProviders(config: PublicConfig): CloudProviderId[] {
  const order: CloudProviderId[] = ['google', 'dropbox', 'onedrive']
  return order.filter((provider) => isProviderConfigured(config, provider))
}
