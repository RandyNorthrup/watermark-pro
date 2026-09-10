/**
 * Better Auth configuration.
 *
 * Built by a function rather than a module-level constant because every
 * dependency (database, email, rate limiter, base URL) arrives with the
 * request `env` on Workers. The same builder feeds the Better Auth CLI schema
 * generator with stub dependencies, so the D1 schema can never drift from
 * the runtime configuration.
 */
import type { BetterAuthOptions } from 'better-auth'
import type { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { captcha } from 'better-auth/plugins'
import { admin } from 'better-auth/plugins/admin'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { organization } from 'better-auth/plugins/organization'
import { z } from 'zod'

import type { AccountStore } from '../account-store'
import {
  acceptSiteAdmission,
  invitationAdmission,
  validateAccountAdmission,
} from './invitation-admission'
import { authenticationLogger } from './logger'
import { accountSocialProviders, type AccountOAuthConfiguration } from './social-providers'
import {
  APP_NAME,
  AUTH_COOKIE_PREFIX,
  AUTH_RATE_LIMIT,
  INVITATION_TTL_SECONDS,
  OAUTH_STATE_TTL_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from '../../shared/constants'
import { LOCALE_CODES } from '../../shared/locales'
import { accessControl, roles } from '../../shared/permissions'
import { SITE_ROLE } from '../../shared/site-roles'
import { newOrganizationSchema } from '../../shared/validation'
import type { AuditStore } from '../audit'
import type { RateLimitStorage } from './rate-limit'
import { invitationEmail, resetPasswordEmail, verificationEmail } from './templates'
import type { EmailSender } from '../email/sender'

/** Adapter factory shape shared by every Better Auth adapter package. */
export type DatabaseAdapter = ReturnType<typeof drizzleAdapter>

/** Better Auth endpoints that must carry a Turnstile token when captcha is enabled. */
export const CAPTCHA_PROTECTED_ENDPOINTS = ['/sign-up/email', '/request-password-reset']

/**
 * The user's saved interface language (M18). Validated against the shipped
 * locales so `updateUser` (via `PATCH /api/me`) can never persist free text.
 */
const localeFieldSchema = z.union(LOCALE_CODES.map((code) => z.literal(code)))

const ADMIN_AUDIT_ACTIONS: Record<string, string> = {
  '/admin/ban-user': 'admin.user_banned',
  '/admin/unban-user': 'admin.user_unbanned',
  '/admin/set-role': 'admin.role_set',
  '/admin/remove-user': 'admin.user_removed',
  '/admin/revoke-user-sessions': 'admin.sessions_revoked',
}

export interface AuthDependencies {
  /** Better Auth database adapter: drizzle over D1 in production, memory in Node tests. */
  accountOAuth?: AccountOAuthConfiguration | undefined
  accounts: AccountStore
  hasWorkspaceContent: (organizationId: string) => Promise<boolean>
  database: DatabaseAdapter
  secret: string
  /** Public origin, e.g. https://lumafoil.com */
  appUrl: string
  email: EmailSender
  rateLimit: RateLimitStorage
  /** Present when Turnstile is configured; verification runs before sign-up and password reset. */
  captcha?: { secretKey: string; siteVerifyUrl?: string | undefined } | undefined
  audit: AuditStore
  /** Rate limiting is disabled only for the Node unit tests, which have no binding. */
  rateLimitEnabled: boolean
  /** Explicit fixture bootstrap only; production always uses invitation admission. */
  canSignUpWithoutInvitation?: boolean | undefined
}

export function buildAuthOptions(deps: AuthDependencies) {
  const appOrigin = new URL(deps.appUrl)
  async function requireSharedWorkspace({ organization }: { organization: { id: string } }) {
    if (await deps.accounts.isPrivateWorkspace(organization.id)) {
      throw new APIError('FORBIDDEN', {
        code: 'PRIVATE_WORKSPACE',
        message: 'Personal workspaces cannot be shared. Create a separate collaboration workspace.',
      })
    }
  }
  return {
    appName: APP_NAME,
    logger: authenticationLogger,
    // Better Call otherwise prints raw non-API errors after Better Auth's logger.
    // Let the outer Worker error handler emit the sanitized diagnostic instead.
    onAPIError: { throw: true },
    baseURL: deps.appUrl,
    basePath: '/api/auth',
    secret: deps.secret,
    trustedOrigins: [appOrigin.origin],
    database: deps.database,
    socialProviders: accountSocialProviders(deps.accountOAuth),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // validateUserInfo permits only verified Google recovery for a matching
        // verified existing user with no sign-in methods; other links stay explicit.
        disableImplicitLinking: false,
        requireLocalEmailVerified: true,
        trustedProviders: ['google', 'microsoft'],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    user: {
      validateUserInfo: validateAccountAdmission(
        deps.accounts,
        deps.canSignUpWithoutInvitation === true,
      ),
      additionalFields: {
        // Nullable until the user picks a language; the validator rejects any
        // code outside SUPPORTED_LOCALES before it reaches the database.
        locale: {
          type: 'string',
          required: false,
          input: true,
          validator: { input: localeFieldSchema },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
      sendResetPassword: async ({ user, url }) => {
        await deps.email.send(resetPasswordEmail(user.email, url))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await deps.email.send(verificationEmail(user.email, url))
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    rateLimit: {
      enabled: deps.rateLimitEnabled,
      window: AUTH_RATE_LIMIT.windowSeconds,
      max: AUTH_RATE_LIMIT.max,
      customStorage: deps.rateLimit,
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      cookies: { state: { attributes: { maxAge: OAUTH_STATE_TTL_SECONDS } } },
      useSecureCookies: appOrigin.protocol === 'https:',
      defaultCookieAttributes: {
        sameSite: 'lax',
        httpOnly: true,
        path: '/',
      },
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    databaseHooks: {
      // Identity tokens are used during callback verification only. Better Auth's
      // encryptOAuthTokens protects access/refresh tokens but does not transform
      // every idToken write path, so do not persist identity-token claims at all.
      account: {
        create: { before: (account) => Promise.resolve({ data: { ...account, idToken: null } }) },
        update: { before: (account) => Promise.resolve({ data: { ...account, idToken: null } }) },
      },
      user: {
        update: {
          after: async (user) => {
            if ('banned' in user && user['banned'] === true)
              await deps.accounts.revokePendingAdmissions(user.id)
            if ('role' in user && user['role'] === SITE_ROLE.user)
              await deps.accounts.revokePendingAdministratorAdmissions(user.id)
          },
        },
        create: {
          before: (user) => Promise.resolve({ data: { ...user, image: null } }),
          after: async (user, context) => {
            await acceptSiteAdmission(deps.accounts, context?.headers, user)
            await deps.audit.append({
              actorUserId: user.id,
              actorName: user.name,
              action: 'user.signed_up',
              targetType: 'user',
              targetId: user.id,
            })
          },
        },
      },
    },
    plugins: [
      organization({
        ac: accessControl,
        roles,
        creatorRole: 'owner',
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        sendInvitationEmail: async (data) => {
          const acceptUrl = `${appOrigin.origin}/accept-invitation/${data.id}`
          await deps.email.send(
            invitationEmail(data.email, data.organization.name, data.inviter.user.name, acceptUrl),
          )
        },
        organizationHooks: {
          beforeCreateOrganization: ({ organization }) => {
            const parsed = newOrganizationSchema.safeParse(organization)
            if (!parsed.success || parsed.data.slug.startsWith('personal-')) {
              throw new APIError('BAD_REQUEST', {
                code: 'INVALID_WORKSPACE',
                message: 'Use a valid workspace name and a non-reserved slug.',
              })
            }
            return Promise.resolve()
          },
          beforeAddMember: requireSharedWorkspace,
          beforeRemoveMember: requireSharedWorkspace,
          beforeUpdateMemberRole: requireSharedWorkspace,
          beforeCreateInvitation: requireSharedWorkspace,
          beforeAcceptInvitation: requireSharedWorkspace,
          beforeDeleteOrganization: async (data) => {
            await requireSharedWorkspace(data)
            if (await deps.hasWorkspaceContent(data.organization.id)) {
              throw new APIError('CONFLICT', {
                message:
                  'Remove saved content and finish storage cleanup before deleting the workspace.',
              })
            }
          },
          afterCreateOrganization: async ({ organization: org, user }) => {
            await deps.audit.append({
              organizationId: org.id,
              actorUserId: user.id,
              actorName: user.name,
              action: 'organization.created',
              targetType: 'organization',
              targetId: org.id,
            })
          },
          afterUpdateOrganization: async ({ organization: org, user }) => {
            if (org !== null) {
              await deps.audit.append({
                organizationId: org.id,
                actorUserId: user.id,
                actorName: user.name,
                action: 'organization.updated',
                targetType: 'organization',
                targetId: org.id,
              })
            }
          },
          afterDeleteOrganization: async ({ organization: org, user }) => {
            await deps.audit.append({
              organizationId: org.id,
              actorUserId: user.id,
              actorName: user.name,
              action: 'organization.deleted',
              targetType: 'organization',
              targetId: org.id,
            })
          },
          afterCreateInvitation: async ({ invitation, inviter }) => {
            await deps.audit.append({
              organizationId: invitation.organizationId,
              actorUserId: inviter.id,
              actorName: inviter.name,
              action: 'invitation.created',
              targetType: 'invitation',
              targetId: invitation.id,
              metadata: { email: invitation.email, role: invitation.role },
            })
          },
          afterCancelInvitation: async ({ invitation, cancelledBy }) => {
            await deps.audit.append({
              organizationId: invitation.organizationId,
              actorUserId: cancelledBy.id,
              actorName: cancelledBy.name,
              action: 'invitation.cancelled',
              targetType: 'invitation',
              targetId: invitation.id,
            })
          },
          afterAcceptInvitation: async ({ invitation, member, user }) => {
            await deps.audit.append({
              organizationId: invitation.organizationId,
              actorUserId: user.id,
              actorName: user.name,
              action: 'invitation.accepted',
              targetType: 'member',
              targetId: member.id,
              metadata: { role: member.role },
            })
          },
          afterUpdateMemberRole: async ({ member, previousRole, user }) => {
            await deps.audit.append({
              organizationId: member.organizationId,
              actorUserId: user.id,
              actorName: user.name,
              action: 'member.role_updated',
              targetType: 'member',
              targetId: member.id,
              metadata: { from: previousRole, to: member.role },
            })
          },
          afterRemoveMember: async ({ member, user }) => {
            await deps.audit.append({
              organizationId: member.organizationId,
              actorUserId: user.id,
              actorName: user.name,
              action: 'member.removed',
              targetType: 'member',
              targetId: member.id,
            })
          },
        },
      }),
      admin({
        defaultRole: SITE_ROLE.user,
        adminRoles: [SITE_ROLE.owner, SITE_ROLE.admin],
        roles: { owner: adminAc, admin: adminAc, user: userAc },
      }),
      ...(deps.captcha === undefined
        ? []
        : [
            captcha({
              provider: 'cloudflare-turnstile',
              secretKey: deps.captcha.secretKey,
              endpoints: CAPTCHA_PROTECTED_ENDPOINTS,
              ...(deps.captcha.siteVerifyUrl !== undefined && {
                siteVerifyURLOverride: deps.captcha.siteVerifyUrl,
              }),
            }),
          ]),
    ],
    hooks: {
      before: invitationAdmission(deps.accounts, deps.canSignUpWithoutInvitation === true),
      // Platform-admin actions are not covered by the organization hooks; record them here.
      after: createAuthMiddleware(async (ctx) => {
        const action = ADMIN_AUDIT_ACTIONS[ctx.path]
        const actor = ctx.context.session?.user
        if (action === undefined || actor === undefined) {
          return
        }
        const body: unknown = ctx.body
        const target =
          typeof body === 'object' &&
          body !== null &&
          'userId' in body &&
          typeof body.userId === 'string'
            ? body.userId
            : ''
        const role =
          typeof body === 'object' &&
          body !== null &&
          'role' in body &&
          typeof body.role === 'string'
            ? body.role
            : undefined
        await deps.audit.append({
          actorUserId: actor.id,
          actorName: actor.name,
          action,
          targetType: 'user',
          targetId: target,
          ...(role !== undefined && { metadata: { role } }),
        })
      }),
    },
  } satisfies BetterAuthOptions
}
