import type { PublicConfig } from '../../shared/api'

/** Public config with every cloud provider disabled. */
export const NO_CLOUD_CONFIG: PublicConfig = {
  googleAuthEnabled: false,
  microsoftAuthEnabled: false,
  turnstileSiteKey: null,
  googleOAuthClientId: null,
  googlePickerApiKey: null,
  googlePickerAppId: null,
  microsoftClientId: null,
  dropboxAppKey: null,
}

/** Public config with all three cloud providers configured. */
export const ALL_CLOUD_CONFIG: PublicConfig = {
  googleAuthEnabled: false,
  microsoftAuthEnabled: false,
  turnstileSiteKey: null,
  googleOAuthClientId: 'client',
  googlePickerApiKey: 'key',
  googlePickerAppId: 'app',
  microsoftClientId: 'ms',
  dropboxAppKey: 'dbx',
}
