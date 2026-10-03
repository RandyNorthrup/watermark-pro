/** Site admission is email-bound and never grants workspace access. */
import type { BetterAuthOptions } from 'better-auth'
import {
  addOAuthServerContext,
  APIError,
  createAuthMiddleware,
  getOAuthState,
  getSessionFromCtx,
} from 'better-auth/api'
import { z } from 'zod'

import { MEMBERSHIP_COHORT, type MembershipCohort } from '../../shared/api-accounts'
import { billingRemovalRequestSchema } from '../../shared/billing'
import { INVITATION_HEADER, invitationIdSchema } from '../../shared/invitation'
import type { AccountStore } from '../account-store'
import type { PublicAdmissionStore } from '../public-admission-store'
import { contentDigest } from '../sync'
import { enforceRecentAuthentication } from './recent-authentication'
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
  const raw = headers?.get(INVITATION_HEADER)
  const token = invitationIdSchema.safeParse(raw)
  if (raw != null && !token.success) throw invitationRequired()
  return token.success ? await invitationTokenHash(token.data) : null
}

/** Early rejection limits email signup work; OAuth keeps only a hash in server-controlled state. */
export function invitationAdmission(
  accounts: AccountStore,
  canSignUpWithoutInvitation: boolean,
  publicSignup?: PublicAdmissionStore,
  closeBillingForDeletion?: (userId: string) => Promise<void>,
) {
  return createAuthMiddleware(async (ctx) => {
    await enforceAuthPrivacy(ctx)
    await enforceSiteAdministrator(ctx, accounts)
    await enforceRecentAuthentication(ctx)
    const path = ctx.path.replace(/\/$/, '')
    if (path === '/admin/remove-user') {
      const session = await getSessionFromCtx(ctx)
      if (session === null) return
      const target = billingRemovalRequestSchema.safeParse(ctx.body)
      if (!target.success || target.data.userId === session.user.id) throw new APIError('FORBIDDEN')
      if ((await ctx.context.internalAdapter.findUserById(target.data.userId)) === null)
        throw new APIError('NOT_FOUND')
      if (closeBillingForDeletion === undefined) throw new APIError('SERVICE_UNAVAILABLE')
      await closeBillingForDeletion(target.data.userId)
    } else if (path === '/admin/impersonate-user')
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
      await addOAuthServerContext({ credentialSignIn: true })
      const raw = ctx.headers?.get(INVITATION_HEADER)
      const token = invitationIdSchema.safeParse(raw)
      if (raw != null && !token.success) throw invitationRequired()
      if (token.success)
        await addOAuthServerContext({ admissionHash: await invitationTokenHash(token.data) })
      return
    }
    if (path !== '/sign-up/email') return
    const body = admissionSchema.safeParse(ctx.body)
    if (!body.success) throw invitationRequired()
    await authorizeAccountCreation(
      accounts,
      ctx.headers,
      body.data.email,
      canSignUpWithoutInvitation,
      publicSignup !== undefined,
    )
  })
}

/** Every user-creation seam, including both OAuth callbacks, must satisfy admission. */
export function validateAccountAdmission(
  accounts: AccountStore,
  canSignUpWithoutInvitation: boolean,
  publicSignup?: PublicAdmissionStore,
): UserValidator {
  return async ({ user, source }, context) => {
    if (source.method === 'oauth' && source.action === 'link-account') {
      const state = await getOAuthState()
      if (state?.link === undefined) {
        const identity = admissionSchema.safeParse(user)
        const existing =
          typeof user.id === 'string'
            ? await context.context.internalAdapter.findUserById(user.id)
            : null
        const canRecover =
          source.oauth?.providerId === 'google' &&
          user.emailVerified === true &&
          identity.success &&
          existing?.emailVerified === true &&
          existing.email.toLowerCase() === identity.data.email.toLowerCase()
        const methods = canRecover
          ? await context.context.internalAdapter.findAccounts(existing.id)
          : null
        if (methods?.length !== 0)
          return {
            error: 'account_linking_requires_sign_in',
            errorDescription: 'Sign in with an existing method before linking this identity.',
          }
      }
    }
    if (source.action !== 'create-user' || source.method === 'admin') return
    const body = admissionSchema.safeParse(user)
    if (!body.success)
      return {
        error: 'INVITATION_REQUIRED',
        errorDescription: 'A valid invitation is required to create an account.',
      }
    try {
      await authorizeAccountCreation(
        accounts,
        context.headers,
        body.data.email,
        canSignUpWithoutInvitation,
        publicSignup !== undefined,
      )
    } catch (error) {
      if (!(error instanceof APIError)) throw error
      return { error: error.body?.code ?? 'INVITATION_REQUIRED', errorDescription: error.message }
    }
    return
  }
}

/** Consume only after creation, preserving verification/resend for the admitted account. */
export async function acceptSiteAdmission(
  accounts: AccountStore,
  headers: Headers | undefined,
  user: { id: string; email: string },
  uninvitedCohort: Exclude<MembershipCohort, 'pending'>,
  publicSignup?: PublicAdmissionStore,
): Promise<void> {
  const hash = await admissionHash(headers)
  if (hash === null) {
    if (
      publicSignup !== undefined &&
      !(await publicSignup.activate(user.email.toLowerCase(), user.id))
    )
      throw publicAdmissionUnavailable()
    if (publicSignup === undefined) await accounts.activateAccount(user.id, uninvitedCohort)
  } else if (!(await accounts.acceptInvitation(hash, user.email, user.id)))
    throw invitationRequired()
}

/** Validate policy and supplied invitations; only the actual adapter creation reserves public capacity. */
export async function authorizeAccountCreation(
  accounts: AccountStore,
  headers: Headers | undefined,
  email: string,
  canUseFixtureSignup: boolean,
  isPublicSignupEnabled: boolean,
): Promise<Exclude<MembershipCohort, 'pending'>> {
  const hash = await admissionHash(headers)
  if (hash !== null) {
    if ((await accounts.pendingInvitation(hash, email.toLowerCase())) === null)
      throw invitationRequired()
    return MEMBERSHIP_COHORT.private
  }
  if (isPublicSignupEnabled) return MEMBERSHIP_COHORT.public
  if (canUseFixtureSignup) return MEMBERSHIP_COHORT.private
  throw invitationRequired()
}

export function publicAdmissionUnavailable(): APIError {
  return new APIError('TOO_MANY_REQUESTS', {
    code: 'PUBLIC_SIGNUP_UNAVAILABLE',
    message: 'New account registration is temporarily unavailable. Please try again later.',
  })
}

function invitationRequired(): APIError {
  return new APIError('FORBIDDEN', {
    code: 'INVITATION_REQUIRED',
    message: 'A valid invitation for this email address is required to create an account.',
  })
}
