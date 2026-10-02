/** Real workerd/D1 proof: migration, auth hook dates and both API boundaries are exercised. */
import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { z } from 'zod'

import { RECENT_AUTHENTICATION_WINDOW_MS } from '../../shared/constants'
import { session } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'

const PERSON = {
  name: 'D1 Credential Fixture',
  email: 'd1-credential@example.test',
  password: 'a real D1 fixture passphrase',
}
const sessionIdSchema = z.object({ session: z.object({ id: z.string() }) })

it('stores credential proof in D1 and refuses both sensitive APIs after expiry', async () => {
  const services = getServices(env)
  if (services.devMailbox === undefined) throw new Error('Expected the console fixture mailbox')
  const client = new TestClient(createApp(), env)
  await client.signUpAndVerify(services.devMailbox, PERSON)
  const current = await client.get('/api/auth/get-session')
  const { session: identity } = sessionIdSchema.parse(await current.json())
  const [proved] = await services.db.select().from(session).where(eq(session.id, identity.id))
  expect(proved?.credentialVerifiedAt).toBeInstanceOf(Date)
  const first = await client.post('/api/me/invitations', { email: 'first@example.test' })
  expect(first.status).toBe(201)
  const expiredProof = new Date(Date.now() - RECENT_AUTHENTICATION_WINDOW_MS)
  await services.db
    .update(session)
    .set({ credentialVerifiedAt: expiredProof })
    .where(eq(session.id, identity.id))
  const refused = await client.post('/api/me/invitations', { email: 'second@example.test' })
  expect(refused.status).toBe(403)
  expect(await refused.json()).toEqual({ error: 'recent_authentication_required' })
  const organization = await client.post('/api/auth/organization/create', {
    name: 'Unproved',
    slug: 'unproved',
  })
  expect(organization.status).toBe(403)
  expect(await organization.json()).toMatchObject({ code: 'RECENT_AUTHENTICATION_REQUIRED' })
  const list = await client.get('/api/me/invitations')
  expect(list.status).toBe(200)
  await client.signIn(PERSON)
  const retried = await client.post('/api/me/invitations', { email: 'second@example.test' })
  expect(retried.status).toBe(201)
})
