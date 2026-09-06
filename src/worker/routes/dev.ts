import { Hono } from 'hono'

import type { DevMailboxResponse } from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/**
 * Exposes the console email provider's captured messages so end-to-end tests
 * can follow verification and invitation links. Only exists when the console
 * provider is configured, which env validation forbids in production; in any
 * other configuration the route answers 404 like any unknown path.
 */
export const devRoutes = new Hono<AppContext>().get('/dev/mailbox', (c) => {
  const { devMailbox } = c.get('services')
  if (devMailbox === undefined) {
    throw apiErrors.notFound()
  }
  const body: DevMailboxResponse = {
    messages: devMailbox.messages().map(({ to, subject, text }) => ({ to, subject, text })),
  }
  return c.json(body, HTTP_STATUS.ok)
})
