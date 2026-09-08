/**
 * Runs inside workerd with real D1. Proves the `user.locale` column added by
 * the M18 migration actually persists: the Node route test uses the memory
 * adapter and would pass even if the column were missing from the schema.
 */
import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { HTTP_STATUS } from '../../shared/constants'
import { user } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'

const app = createApp()
const account = {
  name: 'Lena Locale',
  email: 'lena-locale@example.test',
  password: 'a perfectly fine passphrase',
}

function harness() {
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) {
    throw new Error('workers tests expect EMAIL_PROVIDER=console')
  }
  return { app, env, mailbox: devMailbox }
}

describe('PATCH /api/me over D1', () => {
  let client: TestClient

  beforeAll(async () => {
    client = new TestClient(app, env)
    await client.signUpAndVerify(harness().mailbox, account)
  })

  it('writes the chosen locale to the real user.locale column', async () => {
    const response = await client.request('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'ja' }),
    })
    expect(response.status).toBe(HTTP_STATUS.ok)

    const [row] = await getServices(env)
      .db.select({ locale: user.locale })
      .from(user)
      .where(eq(user.email, account.email))
    expect(row?.locale).toBe('ja')
  })
})
