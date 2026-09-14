import { z } from 'zod'

import type { CloudProviderConfig } from './provider-config'
import { CLOUD_OAUTH, type CloudProvider } from '../../shared/cloud-connections'
import { HTTP_STATUS, MILLISECONDS_PER_SECOND } from '../../shared/constants'
import { readJsonBody } from '../request-body'

const tokenString = z
  .string()
  .min(1)
  .max(CLOUD_OAUTH.maxTokenLength)
  .regex(/^[!-~]+$/)
const tokenResponseSchema = z.object({
  access_token: tokenString,
  refresh_token: tokenString.optional(),
  token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
  expires_in: z.number().positive(),
  scope: z.string().max(CLOUD_OAUTH.maxScopeLength).optional(),
})
const providerFailureSchema = z.object({ error: z.string() })
const requiredScopes = {
  google: ['https://www.googleapis.com/auth/drive.file'],
  dropbox: [
    'files.content.write',
    'files.content.read',
    'files.metadata.read',
    'sharing.read',
    'sharing.write',
    'account_info.read',
  ],
  onedrive: ['files.readwrite'],
} satisfies Record<CloudProvider, string[]>

export class CloudProviderError extends Error {
  override readonly name = 'CloudProviderError'
  readonly requiresReconnect: boolean
  readonly reason:
    | 'transport'
    | 'redirect'
    | 'response_body'
    | 'provider_refused'
    | 'token_response'
    | 'missing_refresh'
    | 'missing_scope'
    | 'invalid_expiry'
  readonly httpStatus: number | undefined

  constructor(
    requiresReconnect: boolean,
    reason: CloudProviderError['reason'] = 'provider_refused',
    httpStatus?: number,
  ) {
    super(
      requiresReconnect
        ? 'The cloud connection needs authorization again.'
        : 'The cloud provider could not complete this request.',
    )
    this.requiresReconnect = requiresReconnect
    this.reason = reason
    this.httpStatus = httpStatus
  }
}

export interface CloudTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scopes: string
}

async function providerJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      // workerd rejects redirect:error before sending the request. Manual
      // mode preserves the credential boundary; every redirect is refused below.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(CLOUD_OAUTH.requestTimeoutMs),
    })
  } catch {
    throw new CloudProviderError(false, 'transport')
  }
  if (!response.ok && response.status < HTTP_STATUS.badRequest) {
    await response.body?.cancel()
    throw new CloudProviderError(false, 'redirect', response.status)
  }
  let payload: unknown
  try {
    payload = await readJsonBody(response, CLOUD_OAUTH.maxProviderBodyBytes)
  } catch {
    throw new CloudProviderError(false, 'response_body', response.status)
  }
  if (!response.ok) {
    const failure = providerFailureSchema.safeParse(payload)
    throw new CloudProviderError(
      response.status === HTTP_STATUS.unauthorized ||
        (failure.success &&
          ['invalid_grant', 'invalid_scope', 'interaction_required', 'consent_required'].includes(
            failure.data.error,
          )),
      'provider_refused',
      response.status,
    )
  }
  return payload
}

/** Validate the actual grant, including refresh-token availability, without retaining provider error bodies. */
export async function exchangeCloudTokens(
  config: CloudProviderConfig,
  grant: { code: string; verifier: string } | { refreshToken: string; scopes: string },
): Promise<CloudTokens> {
  const isRefresh = 'refreshToken' in grant
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...('code' in grant
      ? {
          grant_type: 'authorization_code',
          code: grant.code,
          code_verifier: grant.verifier,
          redirect_uri: config.redirectUri,
        }
      : { grant_type: 'refresh_token', refresh_token: grant.refreshToken }),
    ...(config.provider === 'onedrive' && { scope: config.scopes }),
  })
  const parsed = tokenResponseSchema.safeParse(
    await providerJson(config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
  )
  if (!parsed.success) throw new CloudProviderError(false, 'token_response')
  const response = parsed.data
  const refreshToken = response.refresh_token ?? (isRefresh ? grant.refreshToken : undefined)
  if (refreshToken === undefined) throw new CloudProviderError(true, 'missing_refresh')
  const scopes = response.scope ?? (isRefresh ? grant.scopes : config.scopes)
  const granted = new Set(
    scopes
      .split(' ')
      .filter(Boolean)
      .map((scope) =>
        config.provider === 'onedrive' ? (scope.split('/').at(-1) ?? '').toLowerCase() : scope,
      ),
  )
  if (requiredScopes[config.provider].some((scope) => !granted.has(scope)))
    throw new CloudProviderError(true, 'missing_scope')
  const expiresAt = new Date(Date.now() + response.expires_in * MILLISECONDS_PER_SECOND)
  if (!Number.isFinite(expiresAt.getTime())) throw new CloudProviderError(false, 'invalid_expiry')
  return { accessToken: response.access_token, refreshToken, expiresAt, scopes }
}

const identity = z.object({
  id: z.string().min(1).max(CLOUD_OAUTH.maxIdentityLength),
  label: z.string().min(1).max(CLOUD_OAUTH.maxLabelLength),
})

/** A cloud account may differ from the sign-in account; identity comes only from its trusted provider API. */
export async function cloudAccountIdentity(
  provider: CloudProvider,
  accessToken: string,
): Promise<z.infer<typeof identity>> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  if (provider === 'google') {
    const payload = await providerJson(
      'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName,emailAddress)',
      { headers },
    )
    const account = z
      .object({
        user: z.object({
          permissionId: z.string(),
          displayName: z.string(),
          emailAddress: z.string().optional(),
        }),
      })
      .parse(payload).user
    return identity.parse({
      id: account.permissionId,
      label: account.emailAddress ?? account.displayName,
    })
  }
  if (provider === 'dropbox') {
    const payload = await providerJson('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers,
    })
    const account = z
      .object({
        account_id: z.string(),
        email: z.string(),
        name: z.object({ display_name: z.string() }),
      })
      .parse(payload)
    return identity.parse({ id: account.account_id, label: account.email })
  }
  const configuration = z
    .object({ userinfo_endpoint: z.literal('https://graph.microsoft.com/oidc/userinfo') })
    .parse(
      await providerJson(
        'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
        {},
      ),
    )
  const account = z
    .object({ sub: z.string(), name: z.string() })
    .parse(await providerJson(configuration.userinfo_endpoint, { headers }))
  return identity.parse({ id: account.sub, label: account.name })
}
