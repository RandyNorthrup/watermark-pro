/** Account sign-in providers request identity only; cloud file access has separate clients. */
import type { BetterAuthOptions } from 'better-auth'

export interface AccountOAuthConfiguration {
  google?: { clientId: string; clientSecret: string } | undefined
  microsoft?: { clientId: string; clientSecret: string; tenantId?: string | undefined } | undefined
}

/** Never infer email ownership from Microsoft usernames or preferred_username. */
export function accountSocialProviders(
  config: AccountOAuthConfiguration = {},
): BetterAuthOptions['socialProviders'] {
  return {
    ...(config.google !== undefined && {
      google: {
        ...config.google,
        requireEmailVerification: true,
        mapProfileToUser: () => ({ image: '' }),
      },
    }),
    ...(config.microsoft !== undefined && {
      microsoft: {
        ...config.microsoft,
        tenantId: config.microsoft.tenantId ?? 'common',
        disableDefaultScope: true,
        scope: ['openid', 'profile', 'email'],
        disableProfilePhoto: true,
        requireEmailVerification: true,
        mapProfileToUser: () => ({ image: '' }),
      },
    }),
  }
}
