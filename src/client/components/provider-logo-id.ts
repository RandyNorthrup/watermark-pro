import type { ProviderLogoId } from './provider-logo'

/** Product mark for a configured cloud-storage provider. */
export function cloudProviderLogo(provider: 'dropbox' | 'google' | 'onedrive'): ProviderLogoId {
  switch (provider) {
    case 'google': {
      return 'google-drive'
    }
    case 'dropbox': {
      return 'dropbox'
    }
    default: {
      return 'onedrive'
    }
  }
}
