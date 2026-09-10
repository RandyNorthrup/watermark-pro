/** Keep a failed OAuth signup retry in its original tab without putting bearer tokens in error URLs. */
import { invitationIdSchema } from '../../shared/invitation'

const PENDING_INVITATION_KEY = 'lumafoil:pending-invitation'

export function pendingInvitation(): string | undefined {
  try {
    const parsed = invitationIdSchema.safeParse(sessionStorage.getItem(PENDING_INVITATION_KEY))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function rememberInvitation(token: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITATION_KEY, invitationIdSchema.parse(token))
  } catch {
    /* The original invitation link remains the recovery path when tab storage is denied. */
  }
}

export function clearPendingInvitation(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITATION_KEY)
  } catch {
    /* Storage denial cannot prevent a successful authentication from completing. */
  }
}
