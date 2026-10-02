import { createMiddleware } from 'hono/factory'

import { ACCOUNT_ID_HEADER, accountIdSchema } from '../../shared/account-identity'
import { MEMBERSHIP_COHORT, membershipCohortSchema } from '../../shared/api-accounts'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/** Requires a verified cookie session before exposing custom account or workspace APIs. */
export const requireSession = createMiddleware<AppContext>(async (c, next) => {
  // This middleware owns custom API binding errors. Read the authoritative
  // cookie session first so the auth endpoint's APIError cannot bypass the
  // neutral HTTP errors below; the original request retains its binding.
  const sessionHeaders = new Headers(c.req.raw.headers)
  sessionHeaders.delete(ACCOUNT_ID_HEADER)
  const session = await c.get('services').auth.api.getSession({ headers: sessionHeaders })
  if (session === null) {
    throw apiErrors.unauthenticated()
  }
  if (!session.user.emailVerified || session.user.banned === true) throw apiErrors.forbidden()
  const cohort = membershipCohortSchema.safeParse(session.user.membershipCohort)
  if (!cohort.success || cohort.data === MEMBERSHIP_COHORT.pending) throw apiErrors.forbidden()
  const expectedAccount = c.req.header(ACCOUNT_ID_HEADER)
  if (expectedAccount !== undefined) {
    const parsed = accountIdSchema.safeParse(expectedAccount)
    if (!parsed.success) throw apiErrors.validation('Invalid account binding')
    if (parsed.data !== session.user.id) throw apiErrors.forbidden()
  } else if (c.req.header(SYNC_OPERATION_HEADER) !== undefined) {
    throw apiErrors.validation('Synchronization requires an account binding')
  }
  c.set('session', session)
  await next()
})
