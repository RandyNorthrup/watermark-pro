/** Owners receive only their referral URL and aggregate acceptance count. */
import { type Context, Hono } from 'hono'

import { referralLinkSchema } from '../../shared/api-accounts'
import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { invitationTokenHash } from '../auth/invitation-admission'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'
import { referralToken } from '../referral'

async function linkResponse(c: Context<AppContext>, shouldReplace: boolean) {
  const { accounts, audit, config } = c.get('services')
  const user = c.get('session').user
  if (!user.emailVerified) throw apiErrors.forbidden()
  let link = await accounts.findReferralLink(user.id)
  if (link === null || shouldReplace) {
    const nonce = crypto.randomUUID()
    const token = await referralToken(config.BETTER_AUTH_SECRET, user.id, nonce)
    link = await accounts.saveReferralLink(
      {
        id: `referral-${user.id}`,
        userId: user.id,
        nonce,
        tokenHash: await invitationTokenHash(token),
        createdAt: new Date(),
        revokedAt: null,
      },
      shouldReplace,
    )
    await audit.append({
      actorUserId: user.id,
      actorName: user.name,
      action: shouldReplace ? 'referral.rotated' : 'referral.created',
      targetType: 'referral_link',
      targetId: link.id,
    })
  }
  const token = await referralToken(config.BETTER_AUTH_SECRET, user.id, link.nonce)
  const acceptedAccounts = await accounts.referralAcceptedAccounts(user.id)
  return c.json(
    referralLinkSchema.parse({
      url: link.revokedAt === null ? `${config.APP_URL}/signup?invitation=${token}` : null,
      acceptedAccounts,
    }),
    HTTP_STATUS.ok,
  )
}

export const referralRoutes = new Hono<AppContext>()
  .post('/me/referral-link', requireSession, async (c) => await linkResponse(c, false))
  .post('/me/referral-link/rotate', requireSession, async (c) => await linkResponse(c, true))
  .delete('/me/referral-link', requireSession, async (c) => {
    const user = c.get('session').user
    const { accounts, audit } = c.get('services')
    await accounts.revokeReferralLink(user.id)
    await audit.append({
      actorUserId: user.id,
      actorName: user.name,
      action: 'referral.revoked',
      targetType: 'referral_link',
      targetId: `referral-${user.id}`,
    })
    return c.body(null, HTTP_STATUS.noContent)
  })
