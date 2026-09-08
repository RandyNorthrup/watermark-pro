/**
 * The signed-in user's own account (M18). `PATCH /api/me` records the chosen
 * interface language so it follows the user across devices; on the next
 * sign-in the saved locale wins over the browser's guess. The value is
 * validated against `SUPPORTED_LOCALES`, so no free text is ever stored.
 */
import { Hono } from 'hono'
import { z } from 'zod'

import { HTTP_STATUS } from '../../shared/constants'
import { LOCALE_CODES } from '../../shared/locales'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'

const updateMeSchema = z.object({
  locale: z.union(LOCALE_CODES.map((code) => z.literal(code))),
})

export const meRoutes = new Hono<AppContext>().patch('/me', requireSession, async (c) => {
  let body: unknown
  try {
    body = await c.req.raw.json()
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
  const parsed = updateMeSchema.safeParse(body)
  if (!parsed.success) {
    throw apiErrors.validation(parsed.error.issues)
  }
  const { locale } = parsed.data
  // Better Auth persists the additional `locale` field on the current user;
  // `requireSession` has already produced the 401 envelope for anonymous calls.
  await c.get('services').auth.api.updateUser({
    headers: c.req.raw.headers,
    body: { locale },
  })
  return c.json({ locale }, HTTP_STATUS.ok)
})
