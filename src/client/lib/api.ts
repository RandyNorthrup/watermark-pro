import type { ZodType } from 'zod'

import { captureOfflineOwner, currentOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { apiErrorSchema } from '../../shared/api-core'
import { API_ERROR_CODE, HTTP_STATUS } from '../../shared/constants'

/** Wording for the error codes the Worker returns; keys are the wire codes. */
const ERROR_MESSAGES: Partial<Record<string, string>> = {
  [API_ERROR_CODE.unauthenticated]: 'Please sign in again.',
  [API_ERROR_CODE.forbidden]: 'Your role does not allow this.',
  [API_ERROR_CODE.notFound]: 'That item no longer exists.',
  [API_ERROR_CODE.validation]: 'Some of the values are not valid.',
  [API_ERROR_CODE.rateLimited]: 'Too many requests. Please wait a moment.',
  [API_ERROR_CODE.conflict]: 'This item is still in use.',
  [API_ERROR_CODE.payloadTooLarge]: 'That file is too large.',
  [API_ERROR_CODE.unsupportedMedia]: 'That file type is not supported.',
  [API_ERROR_CODE.quotaExceeded]: 'The limit for this organization has been reached.',
}

const ACCOUNT_API_PREFIXES = ['/api/orgs', '/api/me', '/api/admin']

/** A live server session can bind its profile update before private workspace admission. */
export type RequestAccount = ReturnType<typeof captureOfflineOwner>

function requestOwner(path: string, liveAccount?: RequestAccount) {
  const target = new URL(path, window.location.origin)
  if (target.origin !== window.location.origin)
    throw new Error('Application API requests must stay on this site.')
  const pathname = target.pathname
  if (liveAccount !== undefined) {
    if (pathname !== '/api/me')
      throw new Error('A live-session binding may only update the account profile.')
    liveAccount.assertCurrent()
    const localUser = currentOfflineUser()
    if (localUser !== null && localUser !== liveAccount.userId)
      throw new Error('The signed-in account changed before this request started.')
    return liveAccount
  }
  const isPrivate = ACCOUNT_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  return isPrivate ? captureOfflineOwner() : undefined
}

export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'
  readonly path: string
  readonly status: number
  /** Wire error code when the response carried the standard envelope. */
  readonly code: string | null

  constructor(path: string, status: number, message?: string, code: string | null = null) {
    super(message ?? `Request to ${path} failed with HTTP ${String(status)}`)
    this.path = path
    this.status = status
    this.code = code
  }
}

/** Browser transport failures have no authoritative authentication or authorization response. */
export function isTransportFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiRequestError && error.status === 0)
}

/** Parse the common error envelope without exposing arbitrary response-body messages. */
export async function toRequestError(path: string, response: Response): Promise<ApiRequestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON failures (a proxy page, an empty body) keep the generic message.
  }
  const parsed = apiErrorSchema.safeParse(body)
  if (!parsed.success) {
    return new ApiRequestError(path, response.status)
  }
  return new ApiRequestError(
    path,
    response.status,
    ERROR_MESSAGES[parsed.data.error],
    parsed.data.error,
  )
}

/**
 * Same-origin request that turns non-2xx responses into `ApiRequestError`
 * with the Worker's error code and a user-facing message.
 */
export async function apiRequest(
  path: string,
  init: RequestInit = {},
  liveAccount?: RequestAccount,
): Promise<Response> {
  if (liveAccount !== undefined && init.method !== 'PATCH')
    throw new Error('A live-session binding may only update the account profile.')
  const owner = requestOwner(path, liveAccount)
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (owner === undefined) {
    headers.delete(ACCOUNT_ID_HEADER)
  } else {
    const expected = headers.get(ACCOUNT_ID_HEADER)
    if (expected !== null && expected !== owner.userId)
      throw new Error('The signed-in account changed before this request started.')
    headers.set(ACCOUNT_ID_HEADER, owner.userId)
    owner.assertCurrent()
  }
  try {
    const response = await fetch(path, { ...init, headers })
    owner?.assertCurrent()
    if (!response.ok) throw await toRequestError(path, response)
    return response
  } catch (error) {
    owner?.assertCurrent()
    throw error
  }
}

/**
 * JSON request with schema validation. A malformed or spoofed payload
 * surfaces as an error rather than propagating undefined fields into the UI.
 */
export async function fetchJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
  liveAccount?: RequestAccount,
): Promise<T> {
  const owner = requestOwner(path, liveAccount)
  try {
    const response = await apiRequest(path, init, liveAccount)
    const body: unknown = await response.json()
    owner?.assertCurrent()
    return schema.parse(body)
  } catch (error) {
    owner?.assertCurrent()
    throw error
  }
}

/** Request whose success response carries no body (HTTP 204). */
export async function sendNoContent(path: string, init: RequestInit = {}): Promise<void> {
  const response = await apiRequest(path, init)
  if (response.status !== HTTP_STATUS.noContent) {
    throw new ApiRequestError(path, response.status, 'Unexpected response from the server.')
  }
}
