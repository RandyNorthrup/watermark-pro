/** Authentication diagnostics deliberately omit arbitrary error details, bodies, tokens and stacks. */
import type { BetterAuthOptions } from 'better-auth'

const MAX_LOG_MESSAGE = 512
const MIN_HTTP_ERROR_STATUS = 400
const MAX_HTTP_ERROR_STATUS = 599
const SAFE_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'APIError',
  'StateError',
  'BetterAuthError',
  'ZodError',
])
const SAFE_CODES = new Set([
  'state_mismatch',
  'state_security_mismatch',
  'state_not_found',
  'state_generation_error',
  'state_invalid',
  'invalid_client',
  'invalid_grant',
  'invalid_token',
  'invalid_scope',
  'invalid_request',
  'access_denied',
  'temporarily_unavailable',
  'unauthorized_client',
  'INVITATION_REQUIRED',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_NOT_LINKED',
  'SINGLE_SITE_ADMIN',
])

function cleanMessage(message: string): string {
  return message
    .replaceAll(/https?:\/\/\S+/gi, '[url]')
    .replaceAll(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replaceAll(
      /\b(?:bearer\s+|(?:token|secret|password|state|code)\s*[:=]\s*)[^\s,;]+/gi,
      '[credential]',
    )
    .replaceAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[token]')
    .replaceAll(/[A-Za-z0-9_+/-]{24,}/g, '[opaque value]')
    .slice(0, MAX_LOG_MESSAGE)
}

/** Unknown structured fields are never serialized, even when they look useful during debugging. */
export function authenticationDiagnostic(message: string, args: readonly unknown[]) {
  const errors: { name?: string; code?: string; status?: number }[] = []
  for (const value of args) {
    if (typeof value !== 'object' || value === null) continue
    const detail: { name?: string; code?: string; status?: number } = {}
    if ('name' in value && typeof value.name === 'string' && SAFE_ERROR_NAMES.has(value.name))
      detail.name = value.name
    if ('code' in value && typeof value.code === 'string' && SAFE_CODES.has(value.code))
      detail.code = value.code
    if (
      'status' in value &&
      typeof value.status === 'number' &&
      Number.isSafeInteger(value.status) &&
      value.status >= MIN_HTTP_ERROR_STATUS &&
      value.status <= MAX_HTTP_ERROR_STATUS
    )
      detail.status = value.status
    if (Object.keys(detail).length > 0) errors.push(detail)
  }
  return { message: cleanMessage(message), errors }
}

export const authenticationLogger: NonNullable<BetterAuthOptions['logger']> = {
  level: 'info',
  disableColors: true,
  log(level, message, ...args: unknown[]) {
    const diagnostic = authenticationDiagnostic(message, args)
    if (level === 'error') console.error('Authentication', diagnostic)
    else if (level === 'warn') console.warn('Authentication', diagnostic)
    else console.info('Authentication', diagnostic)
  },
}
