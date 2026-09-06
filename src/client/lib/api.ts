import type { ZodType } from 'zod'

export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'
  readonly path: string
  readonly status: number

  constructor(path: string, status: number, message?: string) {
    super(message ?? `Request to ${path} failed with HTTP ${String(status)}`)
    this.path = path
    this.status = status
  }
}

/**
 * Same-origin JSON request with schema validation. A malformed or spoofed
 * payload surfaces as an error rather than propagating undefined fields
 * into the UI.
 */
export async function fetchJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    throw new ApiRequestError(path, response.status)
  }
  return schema.parse(await response.json())
}
