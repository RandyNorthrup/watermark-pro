import { betterAuth } from 'better-auth'

import { type AuthDependencies, buildAuthOptions } from './options'

export function createAuth(deps: AuthDependencies) {
  return betterAuth(buildAuthOptions(deps))
}

export type Auth = ReturnType<typeof createAuth>

/** Session and user as returned by `auth.api.getSession`. */
export type AuthSession = Auth['$Infer']['Session']
