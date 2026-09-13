import { cloudDigest, cloudNonce, decryptCloudValue, encryptCloudValue } from './crypto'
import {
  cloudAuthorizationUrl,
  cloudProviderConfig,
  type CloudProviderConfig,
} from './provider-config'
import {
  cloudAccountIdentity,
  CloudProviderError,
  exchangeCloudTokens,
  type CloudTokens,
} from './provider-tokens'
import { CLOUD_OAUTH, type CloudProvider } from '../../shared/cloud-connections'
import type { CloudConnectionRecord, CloudCredentialUpdate, CloudStore } from '../cloud-store'
import type { ValidatedEnv } from '../env'
import { apiErrors } from '../errors'

interface CloudServices {
  config: ValidatedEnv
  cloud: CloudStore
}

function configured(services: CloudServices, provider: CloudProvider): CloudProviderConfig {
  const config = cloudProviderConfig(services.config, provider)
  if (config === null) throw apiErrors.retryLater()
  return config
}

async function protectTokens(
  config: CloudProviderConfig,
  userId: string,
  tokens: CloudTokens,
  account: { id: string; label: string },
): Promise<CloudCredentialUpdate> {
  const [accessCipher, refreshCipher] = await Promise.all([
    encryptCloudValue(
      config.encryptionSecret,
      userId,
      config.provider,
      'access',
      tokens.accessToken,
    ),
    encryptCloudValue(
      config.encryptionSecret,
      userId,
      config.provider,
      'refresh',
      tokens.refreshToken,
    ),
  ])
  return {
    clientId: config.clientId,
    providerAccountId: account.id,
    accountLabel: account.label,
    accessCipher,
    refreshCipher,
    accessExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  }
}

/** A new attempt invalidates older callbacks and refreshes before opening the provider. */
export async function beginCloudConnection(
  services: CloudServices,
  userId: string,
  sessionId: string,
  provider: CloudProvider,
) {
  const config = configured(services, provider)
  const state = cloudNonce()
  const verifier = cloudNonce()
  const id = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CLOUD_OAUTH.attemptLifetimeMs)
  const [stateHash, challenge, verifierCipher] = await Promise.all([
    cloudDigest(state),
    cloudDigest(verifier),
    encryptCloudValue(config.encryptionSecret, userId, provider, id, verifier),
  ])
  await services.cloud.begin(
    { id, userId, sessionId, provider, stateHash, verifierCipher, expiresAt },
    now,
  )
  return {
    id,
    authorizationUrl: cloudAuthorizationUrl(config, state, challenge),
    expiresAt: expiresAt.toISOString(),
  }
}

/** The same account AND exact session must finish the one-use authorization attempt. */
export async function finishCloudConnection(
  services: CloudServices,
  userId: string,
  sessionId: string,
  provider: CloudProvider,
  result: { state: string; code?: string | undefined; error?: string | undefined },
): Promise<{ isConnected: boolean }> {
  const config = configured(services, provider)
  const attempt = await services.cloud.claim(
    await cloudDigest(result.state),
    userId,
    sessionId,
    provider,
    new Date(),
  )
  if (attempt === null) throw apiErrors.forbidden()
  if (result.error !== undefined || result.code === undefined) {
    await services.cloud.failAttempt(attempt.id, userId, sessionId)
    return { isConnected: false }
  }
  try {
    const verifier = await decryptCloudValue(
      config.encryptionSecret,
      userId,
      provider,
      attempt.id,
      attempt.verifierCipher,
    )
    const tokens = await exchangeCloudTokens(config, { code: result.code, verifier })
    const account = await cloudAccountIdentity(provider, tokens.accessToken)
    const credentials = await protectTokens(config, userId, tokens, account)
    const isSaved = await services.cloud.complete(attempt, credentials, new Date())
    if (!isSaved) await services.cloud.failAttempt(attempt.id, userId, sessionId)
    return { isConnected: isSaved }
  } catch {
    // Provider responses, authorization codes, and credential errors must never
    // enter request diagnostics. The polling UI receives a bounded failed state.
    await services.cloud.failAttempt(attempt.id, userId, sessionId)
    return { isConnected: false }
  }
}

function connected(connection: CloudConnectionRecord | null): CloudConnectionRecord & {
  accessCipher: string
  refreshCipher: string
  accessExpiresAt: Date
  providerAccountId: string
  accountLabel: string
} {
  if (
    connection?.status !== 'connected' ||
    connection.accessCipher === null ||
    connection.refreshCipher === null ||
    connection.accessExpiresAt === null ||
    connection.providerAccountId === null ||
    connection.accountLabel === null
  )
    throw apiErrors.conflict()
  return {
    ...connection,
    accessCipher: connection.accessCipher,
    refreshCipher: connection.refreshCipher,
    accessExpiresAt: connection.accessExpiresAt,
    providerAccountId: connection.providerAccountId,
    accountLabel: connection.accountLabel,
  }
}

/** Only short-lived access tokens leave the Worker, for existing browser transfers and Google Picker. */
export async function cloudAccessToken(
  services: CloudServices,
  userId: string,
  provider: CloudProvider,
) {
  const config = configured(services, provider)
  const connection = connected(await services.cloud.find(userId, provider))
  if (connection.clientId !== config.clientId) throw apiErrors.conflict()
  const now = new Date()
  if (connection.accessExpiresAt.getTime() > now.getTime() + CLOUD_OAUTH.refreshMarginMs) {
    const accessToken = await decryptCloudValue(
      config.encryptionSecret,
      userId,
      provider,
      'access',
      connection.accessCipher,
    )
    const current = await services.cloud.find(userId, provider)
    if (current?.status !== 'connected' || current.generation !== connection.generation)
      throw apiErrors.conflict()
    return {
      accessToken,
      expiresAt: connection.accessExpiresAt.toISOString(),
      providerAccountId: connection.providerAccountId,
      generation: connection.generation,
    }
  }
  const leaseId = crypto.randomUUID()
  const hasLease = await services.cloud.leaseRefresh(
    userId,
    provider,
    connection.generation,
    leaseId,
    now,
    new Date(now.getTime() + CLOUD_OAUTH.refreshLeaseMs),
  )
  if (!hasLease) return { isRefreshing: true as const, retryAfterMs: CLOUD_OAUTH.refreshPollMs }
  try {
    const refreshToken = await decryptCloudValue(
      config.encryptionSecret,
      userId,
      provider,
      'refresh',
      connection.refreshCipher,
    )
    const tokens = await exchangeCloudTokens(config, { refreshToken, scopes: connection.scopes })
    const credentials = await protectTokens(config, userId, tokens, {
      id: connection.providerAccountId,
      label: connection.accountLabel,
    })
    const isSaved = await services.cloud.finishRefresh(
      userId,
      provider,
      connection.generation,
      leaseId,
      credentials,
      new Date(),
    )
    if (!isSaved) throw apiErrors.conflict()
    return {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt.toISOString(),
      providerAccountId: connection.providerAccountId,
      generation: connection.generation,
    }
  } catch (error) {
    await services.cloud.releaseRefresh(
      userId,
      provider,
      connection.generation,
      leaseId,
      error instanceof CloudProviderError && error.requiresReconnect,
    )
    if (error instanceof CloudProviderError) {
      if (error.requiresReconnect) throw apiErrors.conflict()
      throw apiErrors.retryLater()
    }
    throw error
  }
}

/** Local access ends atomically even if the provider cannot revoke its remote grant. */
export async function disconnectCloudConnection(
  services: CloudServices,
  userId: string,
  provider: CloudProvider,
): Promise<{ providerRevoked: boolean }> {
  const previous = await services.cloud.disconnect(userId, provider, new Date())
  const config = cloudProviderConfig(services.config, provider)
  if (
    provider === 'onedrive' ||
    previous === null ||
    config === null ||
    previous.accessCipher === null ||
    previous.refreshCipher === null
  )
    return { providerRevoked: false }
  try {
    const init: RequestInit = {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(CLOUD_OAUTH.requestTimeoutMs),
    }
    let url: string
    if (provider === 'google') {
      url = 'https://oauth2.googleapis.com/revoke'
      init.headers = { 'content-type': 'application/x-www-form-urlencoded' }
      init.body = new URLSearchParams({
        token: await decryptCloudValue(
          config.encryptionSecret,
          userId,
          provider,
          'refresh',
          previous.refreshCipher,
        ),
      })
    } else {
      url = 'https://api.dropboxapi.com/2/auth/token/revoke'
      init.headers = {
        Authorization: `Bearer ${await decryptCloudValue(config.encryptionSecret, userId, provider, 'access', previous.accessCipher)}`,
      }
    }
    const response = await fetch(url, init)
    return { providerRevoked: response.ok }
  } catch {
    return { providerRevoked: false }
  }
}
