/** Site admission is email-bound and never grants workspace access. */
import type { BetterAuthOptions } from 'better-auth'
import {
  addOAuthServerContext,
  APIError,
  createAuthMiddleware,
  getOAuthState,
} from 'better-auth/api'
import { z } from 'zod'

import { INVITATION_HEADER, invitationIdSchema } from '../../shared/invitation'
import type { AccountStore } from '../account-store'
import { contentDigest } from '../sync'
import { enforceSiteAdministrator } from './site-administrator'
import { enforceAuthPrivacy } from './workspace-access'

const admissionSchema = z.object({ email: z.email() })
const identityScopesSchema = z.object({
  scopes: z.array(z.enum(['openid', 'profile', 'email'])).optional(),
})
const oauthAdmissionSchema = z.object({ admissionHash: z.string().regex(/^[a-f0-9]{64}$/) })
type UserValidator = NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>

/** Hashes a bearer invitation before database lookup; raw tokens are never persisted. */
export async function invitationTokenHash(token: string): Promise<string> {
  return await contentDigest(new Uint8Array(new TextEncoder().encode(token)).buffer)
}

async function admissionHash(headers: Headers | undefined): Promise<string | null> {
  const state = await getOAuthState()
  const serverContext = oauthAdmissionSchema.safeParse(state?.serverContext)
  if (serverContext.success) return serverContext.data.admissionHash
  const token = invitationIdSchema.safeParse(headers?.get(INVITATION_HEADER))
  return token.success ? await invitationTokenHash(token.data) : null
}

/** Early rejection limits email signup work; OAuth keeps only a hash in server-controlled state. */
export function invitationAdmission(accounts: AccountStore, canSignUpWithoutInvitation: boolean) {
  return createAuthMiddleware(async (ctx) => {
    await enforceAuthPrivacy(ctx)
    await enforceSiteAdministrator(ctx, accounts)
    const path = ctx.path.replace(/\/$/, '')
    if (path === '/admin/impersonate-user')
      throw new APIError('FORBIDDEN', {
        code: 'IMPERSONATION_DISABLED',
        message: 'Account impersonation is disabled.',
      })
    if (
      (path === '/sign-in/social' || path === '/link-social') &&
      !identityScopesSchema.safeParse(ctx.body).success
    ) {
      throw new APIError('BAD_REQUEST', {
        code: 'IDENTITY_SCOPES_ONLY',
        message: 'Account sign-in accepts identity scopes only.',
      })
    }
    if (path === '/sign-in/social') {
      const token = invitationIdSchema.safeParse(ctx.headers?.get(INVITATION_HEADER))
      if (token.success)
        await addOAuthServerContext({ admissionHash: await invitationTokenHash(token.data) })
      return
    }
    if (canSignUpWithoutInvitation || path !== '/sign-up/email') return
    const body = admissionSchema.safeParse(ctx.body)
    const hash = await admissionHash(ctx.headers)
    if (
      hash === null ||
      !body.success ||
      (await accounts.pendingInvitation(hash, body.data.email)) === null
    )
      throw invitationRequired()
  })
}

/** Every user-creation seam, including both OAuth callbacks, must satisfy admission. */
export function validateAccountAdmission(
  accounts: AccountStore,
  canSignUpWithoutInvitation: boolean,
): UserValidator {
  return async ({ user, source }, context) => {
    if (canSignUpWithoutInvitation || source.action !== 'create-user' || source.method === 'admin')
      return
    const body = admissionSchema.safeParse(user)
    const hash = await admissionHash(context.headers)
    if (
      hash === null ||
      !body.success ||
      (await accounts.pendingInvitation(hash, body.data.email)) === null
    )
      return {
        error: 'INVITATION_REQUIRED',
        errorDescription: 'A valid invitation is required to create an account.',
      }
    return
  }
}

/** Consume only after creation, preserving verification/resend for the admitted account. */
export async function acceptSiteAdmission(
  accounts: AccountStore,
  headers: Headers | undefined,
  user: { id: string; email: string },
): Promise<void> {
  const hash = await admissionHash(headers)
  if (hash !== null) await accounts.acceptInvitation(hash, user.email, user.id)
}

function invitationRequired(): APIError {
  return new APIError('FORBIDDEN', {
    code: 'INVITATION_REQUIRED',
    message: 'A valid invitation for this email address is required to create an account.',
  })
}
