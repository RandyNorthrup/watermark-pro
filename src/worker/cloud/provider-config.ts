import type { CloudProvider } from '../../shared/cloud-connections'
import {
  DROPBOX_WRITE_SCOPES,
  GOOGLE_DRIVE_SCOPE,
  MICROSOFT_GRAPH_SCOPE,
} from '../../shared/constants'
import type { ValidatedEnv } from '../env'

export interface CloudProviderConfig {
  provider: CloudProvider
  clientId: string
  clientSecret: string
  encryptionSecret: string
  authorizationUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string
}

/** Public client IDs never imply that a confidential cloud connection is configured. */
export function cloudProviderConfig(
  env: ValidatedEnv,
  provider: CloudProvider,
): CloudProviderConfig | null {
  const ids = {
    google: env.GOOGLE_OAUTH_CLIENT_ID,
    dropbox: env.DROPBOX_APP_KEY,
    onedrive: env.MICROSOFT_CLIENT_ID,
  }
  const secrets = {
    google: env.GOOGLE_CLOUD_CLIENT_SECRET,
    dropbox: env.DROPBOX_APP_SECRET,
    onedrive: env.MICROSOFT_CLOUD_CLIENT_SECRET,
  }
  const clientId = ids[provider]
  const clientSecret = secrets[provider]
  if (clientId === undefined || clientSecret === undefined || env.CLOUD_TOKEN_SECRET === undefined)
    return null
  const endpoints = {
    google: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: GOOGLE_DRIVE_SCOPE,
    },
    dropbox: {
      authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      scopes: `${DROPBOX_WRITE_SCOPES} account_info.read`,
    },
    onedrive: {
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: `openid profile offline_access ${MICROSOFT_GRAPH_SCOPE}`,
    },
  }[provider]
  return {
    provider,
    clientId,
    clientSecret,
    encryptionSecret: env.CLOUD_TOKEN_SECRET,
    redirectUri: `${env.APP_URL}/api/cloud/${provider}/callback`,
    ...endpoints,
  }
}

/** Only an explicit Connect request asks for consent; ordinary operations use refresh tokens. */
export function cloudAuthorizationUrl(
  config: CloudProviderConfig,
  state: string,
  challenge: string,
): string {
  const url = new URL(config.authorizationUrl)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(config.provider === 'google' && {
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
    }),
    ...(config.provider === 'dropbox' && { token_access_type: 'offline' }),
    ...(config.provider === 'onedrive' && { prompt: 'select_account', response_mode: 'query' }),
  }).toString()
  return url.href
}
