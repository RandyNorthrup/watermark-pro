import type { BetterAuthPlugin } from 'better-auth'
import { z } from 'zod'

import { HTTP_STATUS } from '../../shared/constants'
import { HUMAN_VERIFICATION, humanChallengeTokenSchema } from '../../shared/human-verification'
import { readJsonBody } from '../request-body'

interface HumanVerificationConfiguration {
  secretKey: string
  /** Test harness injection only; the Worker never reads an override from environment or input. */
  siteVerifyUrl?: string | undefined
}

const providerConfiguration = {
  url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  timeoutMs: 10_000,
  maxResponseBytes: 8192,
} as const
const providerResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
})
const protectedActions = [
  {
    action: HUMAN_VERIFICATION.actions.admission,
    endpoints: ['/sign-up/email', '/sign-in/email', '/sign-in/social'],
  },
  {
    action: HUMAN_VERIFICATION.actions.recovery,
    endpoints: ['/request-password-reset', '/send-verification-email'],
  },
]

function endpointPath(request: Request, basePath: string): string {
  const path = new URL(request.url).pathname
  const endpoint = path.startsWith(basePath) ? path.slice(basePath.length) : path
  return endpoint.replaceAll(/\/{2,}/g, '/').replace(/\/$/, '')
}

function refusal(status: number, code: string, message: string) {
  return { response: Response.json({ code, message }, { status }) }
}

/** Bind protected forms to their hostname/action and validate bounded Siteverify responses strictly. */
export function humanVerificationPlugins(
  configuration: HumanVerificationConfiguration | undefined,
  hostname: string,
): BetterAuthPlugin[] {
  if (configuration === undefined) return []
  return [
    {
      id: 'human-verification',
      onRequest: async (request, context): Promise<{ response: Response } | undefined> => {
        const path = endpointPath(request, context.options.basePath ?? '/api/auth')
        const policy = protectedActions.find(({ endpoints }) => endpoints.includes(path))
        if (policy === undefined) return
        const token = humanChallengeTokenSchema.safeParse(request.headers.get('x-captcha-response'))
        if (!token.success)
          return refusal(
            HTTP_STATUS.badRequest,
            'INVALID_CAPTCHA_RESPONSE',
            'Complete the human verification.',
          )
        try {
          // The opaque token is sufficient. User IDs, email and client IP are not
          // needed by Siteverify and must not leave this account boundary.
          const result = await fetch(configuration.siteVerifyUrl ?? providerConfiguration.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ secret: configuration.secretKey, response: token.data }),
            redirect: 'error',
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(providerConfiguration.timeoutMs),
            ]),
          })
          if (!result.ok)
            return refusal(
              HTTP_STATUS.internalServerError,
              'UNKNOWN_ERROR',
              'Human verification is unavailable.',
            )
          const verification = providerResponseSchema.safeParse(
            await readJsonBody(result, providerConfiguration.maxResponseBytes),
          )
          if (
            !verification.success ||
            !verification.data.success ||
            verification.data.hostname !== hostname ||
            verification.data.action !== policy.action
          )
            return refusal(
              HTTP_STATUS.forbidden,
              'VERIFICATION_FAILED',
              'Human verification failed.',
            )
        } catch {
          // Provider errors can contain credentials or full request details.
          return refusal(
            HTTP_STATUS.internalServerError,
            'UNKNOWN_ERROR',
            'Human verification is unavailable.',
          )
        }
        return
      },
    },
  ]
}
