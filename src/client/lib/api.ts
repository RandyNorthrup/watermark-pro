import { type HealthResponse, healthResponseSchema } from '../../shared/api'
import { HEALTH_PATH } from '../../shared/constants'

export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'
  readonly path: string
  readonly status: number

  constructor(path: string, status: number) {
    super(`Request to ${path} failed with HTTP ${String(status)}`)
    this.path = path
    this.status = status
  }
}

/**
 * Fetches the Worker health endpoint. The response is validated against the
 * shared schema so a malformed or spoofed payload surfaces as an error rather
 * than propagating undefined fields into the UI.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(HEALTH_PATH, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new ApiRequestError(HEALTH_PATH, response.status)
  }
  return healthResponseSchema.parse(await response.json())
}
