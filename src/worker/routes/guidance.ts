import { Hono } from 'hono'

import { guidanceClaimResponseSchema, guidanceClaimSchema } from '../../shared/guidance'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'

/** The account claims its one-time tour offer; explicit replay never resets the saved claim. */
export const guidanceRoutes = new Hono<AppContext>().post(
  '/me/guidance/claim',
  requireSession,
  async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw apiErrors.validation('Invalid guidance JSON body')
    }
    const parsed = guidanceClaimSchema.safeParse(body)
    if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
    const isClaimed = await c
      .get('services')
      .guidance.claim(c.get('session').user.id, parsed.data.topic)
    return c.json(guidanceClaimResponseSchema.parse({ claimed: isClaimed }))
  },
)
