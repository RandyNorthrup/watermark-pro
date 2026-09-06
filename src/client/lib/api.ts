import type { ZodType } from 'zod'

import { apiErrorSchema } from '../../shared/api'
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

async function toRequestError(path: string, response: Response): Promise<ApiRequestError> {
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
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    throw await toRequestError(path, response)
  }
  return response
}

/**
 * JSON request with schema validation. A malformed or spoofed payload
 * surfaces as an error rather than propagating undefined fields into the UI.
 */
export async function fetchJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiRequest(path, init)
  return schema.parse(await response.json())
}

/** Request whose success response carries no body (HTTP 204). */
export async function sendNoContent(path: string, init: RequestInit = {}): Promise<void> {
  const response = await apiRequest(path, init)
  if (response.status !== HTTP_STATUS.noContent) {
    throw new ApiRequestError(path, response.status, 'Unexpected response from the server.')
  }
}
