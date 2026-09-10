/** Personal workspace provisioning is shared by explicit preparation and authenticated bootstrap. */
import type { AuthSession } from './auth'
import { apiErrors } from '../errors'
import type { Services } from '../services'

/** Ownership comes from the verified server session, including invitation-first collaboration flows. */
export async function ensurePrivateWorkspace(
  services: Pick<Services, 'accounts'>,
  session: AuthSession,
): Promise<string> {
  if (!session.user.emailVerified) throw apiErrors.forbidden()
  return await services.accounts.ensurePrivateWorkspace(session.user.id)
}
