import { ApiRequestError } from './api'

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

/** Human-readable message for an auth or API failure; never leaks stack traces. */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError && error.message.length > 0) {
    return error.message
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }
  return FALLBACK_MESSAGE
}

/** Better Auth client results carry `error` objects rather than throwing. */
export function describeAuthError(
  error: { message?: string | undefined; code?: string | undefined } | null,
): string | null {
  if (error === null) {
    return null
  }
  return error.message ?? FALLBACK_MESSAGE
}
