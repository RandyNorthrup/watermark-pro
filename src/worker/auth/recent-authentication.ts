/** Credential proof belongs to a server-created session, never a browser timestamp. */
import { APIError, getOAuthState, getSessionFromCtx } from 'better-auth/api'
import { z } from 'zod'

import {
  AUTH_RECENT_AUTHENTICATION_REQUIRED,
  RECENT_AUTHENTICATION_WINDOW_MS,
} from '../../shared/constants'

const proofSchema = z.object({ credentialVerifiedAt: z.date() })
const signInStateSchema = z.object({ credentialSignIn: z.literal(true) })
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Rejects missing, malformed, future, or expired proof without treating session age as proof. */
export function hasRecentCredentialProof(session: unknown, now = Date.now()): boolean {
  const proof = proofSchema.safeParse(session)
  if (!proof.success) return false
  const age = now - proof.data.credentialVerifiedAt.getTime()
  return age >= 0 && age < RECENT_AUTHENTICATION_WINDOW_MS
}

const SENSITIVE_API_PREFIXES = [
  '/api/me/invitations',
  '/api/me/referral-link',
  '/api/me/workspace-invitations',
  '/api/me/billing',
  '/api/admin',
]
const SENSITIVE_WORKSPACE_PATH = /^\/api\/orgs\/[^/]+\/(?:access|shares)(?:\/|$)/
const SENSITIVE_CLOUD_PATH = /^\/api\/me\/cloud\/[^/]+\/(?:connect|token|disconnect)$/

/** Ordinary reads, saving, rendering, and personal-workspace bootstrap retain their session. */
export function requiresRecentAuthentication(method: string, path: string): boolean {
  if (READ_METHODS.has(method)) return false
  return (
    SENSITIVE_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
    SENSITIVE_WORKSPACE_PATH.test(path) ||
    SENSITIVE_CLOUD_PATH.test(path) ||
    (method === 'DELETE' && path.startsWith('/api/orgs/'))
  )
}

/** Only successful password/identity sign-in creates proof; verification and renewal cannot. */
export async function credentialProofForNewSession(path: string | undefined): Promise<Date | null> {
  if (path === '/sign-in/email' || path === '/sign-in/social') return new Date(Date.now())
  if (path?.startsWith('/callback/') === true) {
    const state = await getOAuthState()
    if (signInStateSchema.safeParse(state?.serverContext).success && state?.link === undefined)
      return new Date(Date.now())
  }
  return null
}

const SENSITIVE_ACCOUNT_PATHS = new Set([
  '/link-social',
  '/unlink-account',
  '/change-email',
  '/change-password',
  '/set-password',
  '/delete-user',
  '/get-access-token',
  '/refresh-token',
])
const ORGANIZATION_READ_PATHS = new Set([
  '/organization/list',
  '/organization/get-organization',
  '/organization/get-full-organization',
  '/organization/list-members',
  '/organization/list-invitations',
  '/organization/get-active-member-role',
  '/organization/get-active-member',
  '/organization/has-permission',
  '/organization/get-invitation',
  '/organization/set-active',
])
const ADMIN_READ_PATHS = new Set(['/admin/get-user', '/admin/list-users', '/admin/has-permission'])

/** Auth-plugin mutations cannot bypass the custom API's recent-credential boundary. */
export async function enforceRecentAuthentication(
  ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<void> {
  const path = ctx.path.replace(/\/$/, '')
  const method: unknown = ctx.method
  const isRead = typeof method === 'string' && READ_METHODS.has(method)
  const requiresProof =
    SENSITIVE_ACCOUNT_PATHS.has(path) ||
    (!isRead && path.startsWith('/organization/') && !ORGANIZATION_READ_PATHS.has(path)) ||
    (!isRead && path.startsWith('/admin/') && !ADMIN_READ_PATHS.has(path))
  if (!requiresProof) return
  const session = await getSessionFromCtx(ctx)
  // The endpoint retains its normal anonymous/role denial; proof never grants a role.
  if (session === null) return
  if (!hasRecentCredentialProof(session.session))
    throw new APIError('FORBIDDEN', {
      code: AUTH_RECENT_AUTHENTICATION_REQUIRED,
      message: 'Sign in again before making this sensitive change.',
    })
}
