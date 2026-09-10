import { Hono } from 'hono'

import { type DevMailboxResponse, devPromoteRequestSchema } from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/**
 * Test-only routes. They exist only when the console email provider is
 * configured, which env validation forbids in production; in any other
 * configuration they answer 404 like any unknown path.
 *
 * `GET /dev/mailbox` exposes the console provider's captured messages so
 * end-to-end tests can follow verification and invitation links.
 * `POST /dev/promote` establishes the single initial administrator in a
 * disposable test database. It refuses a second administrator. The
 * end-to-end suite and the audit scripts use it instead of running
 * `wrangler d1 execute` against the preview's database while the preview
 * is serving, which the local SQLite file does not survive under load.
 */
export const devRoutes = new Hono<AppContext>()
  .get('/dev/mailbox', (c) => {
    const { devMailbox } = c.get('services')
    if (devMailbox === undefined) {
      throw apiErrors.notFound()
    }
    const body: DevMailboxResponse = {
      messages: devMailbox.messages().map(({ to, subject, text }) => ({ to, subject, text })),
    }
    return c.json(body, HTTP_STATUS.ok)
  })
  .post('/dev/promote', async (c) => {
    const { devMailbox, users } = c.get('services')
    if (devMailbox === undefined) {
      throw apiErrors.notFound()
    }
    let raw: unknown = null
    try {
      raw = await c.req.json()
    } catch {
      // Not JSON: validation below reports it.
    }
    const body = devPromoteRequestSchema.safeParse(raw)
    if (!body.success) {
      throw apiErrors.validation(body.error.issues)
    }
    if (!(await users.promoteToPlatformAdmin(body.data.email))) {
      throw apiErrors.notFound()
    }
    return c.json({ promoted: true }, HTTP_STATUS.ok)
  })
