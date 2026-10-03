import { env } from 'cloudflare:workers'

import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PUBLIC_PLANS } from '../shared/plans'
import { PUBLIC_SIGNUP_POLICY } from '../shared/public-signup'
import { publicAdmissionEmailHash } from './auth/public-admission-key'
import { publicAdmission, user } from './db/schema'
import { createApp } from './index'
import { getServices } from './services'
import { findLink, TestClient } from './test-support/client'

const services = getServices(env)
const policy = { racingRequests: 8, remaining: 2 }

beforeEach(async () => {
  await services.db.delete(publicAdmission)
  await services.db.delete(user)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function pending(email: string, id: string) {
  await services.db.insert(user).values({
    id,
    email,
    name: 'Admission fixture',
    membershipCohort: 'pending',
    emailVerified: false,
    role: 'user',
  })
}
async function hold(email: string): Promise<string> {
  const id = await services.publicAdmissions.reserve(email)
  if (id === null) throw new Error('Named public reservation fixture was denied')
  return id
}

describe('single-boundary real D1 public admission', () => {
  it('runs actual workerd auth with challenge, public cohort and verified Free personal capacity', async () => {
    vi.spyOn(console, 'info').mockImplementation(vi.fn())
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ success: true, hostname: 'localhost', action: 'account_admission' }),
        ),
      ),
    )
    const publicEnv = {
      ...env,
      PUBLIC_SIGNUP_ENABLED: 'true',
      TURNSTILE_SITE_KEY: 'worker-fixture-site-key',
      TURNSTILE_SECRET_KEY: 'worker-fixture-secret-key',
    }
    const current = getServices(publicEnv)
    if (current.devMailbox === undefined)
      throw new Error('Missing named development mailbox fixture')
    const client = new TestClient(createApp(), publicEnv)
    const person = {
      name: 'Actual public D1 user',
      email: 'actual-public@example.test',
      password: 'actual public worker fixture passphrase',
    }
    const denied = await client.post('/api/auth/sign-up/email', person)
    expect(denied.status).toBe(400)
    expect(await current.db.select().from(user)).toHaveLength(0)
    const admitted = await client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-captcha-response': 'actual-worker-challenge',
      },
      body: JSON.stringify(person),
    })
    expect(admitted.status).toBe(200)
    const [account] = await current.db.select().from(user).where(eq(user.email, person.email))
    expect(account).toMatchObject({
      membershipCohort: 'public',
      emailVerified: false,
      role: 'user',
    })
    const beforeVerification = await client.post('/api/me/workspace', {})
    expect(beforeVerification.status).toBe(401)
    await client.get(findLink(current.devMailbox, person.email, '/api/auth/verify-email'))
    const workspace = await client.post('/api/me/workspace', {})
    expect(workspace.status).toBe(200)
    if (account === undefined) throw new Error('Missing admitted account')
    const organizationId = await current.accounts.ensurePrivateWorkspace(account.id)
    const projection = await client.get(`/api/orgs/${organizationId}/capacity`)
    expect(await projection.json()).toEqual({
      storageBytes: PUBLIC_PLANS.free.storageBytes,
      photos: PUBLIC_PLANS.free.photos,
      logos: PUBLIC_PLANS.free.logos,
      presets: PUBLIC_PLANS.free.presets,
      members: 1,
    })
    const privateRights = await client.get('/api/me/private-invitation-budget')
    expect(privateRights.status).toBe(403)
  })

  it('preserves the last existing hold while limiting distinct concurrent emails', async () => {
    const email = 'last-held@example.test'
    const id = await hold(email)
    const now = Date.now()
    for (
      let index = 1;
      index < PUBLIC_SIGNUP_POLICY.admissionsPerWindow - policy.remaining;
      index++
    )
      await services.db.insert(publicAdmission).values({
        emailHash: await publicAdmissionEmailHash(
          `reserved-${String(index)}@example.test`,
          services.config.BETTER_AUTH_SECRET,
        ),
        userId: crypto.randomUUID(),
        expiresAt: new Date(now + PUBLIC_SIGNUP_POLICY.reservationMs),
      })
    const results = await Promise.all(
      Array.from(
        { length: policy.racingRequests },
        async (_, index) =>
          await services.publicAdmissions.reserve(`race-${String(index)}@example.test`),
      ),
    )
    expect(results.filter((result) => result !== null)).toHaveLength(policy.remaining)
    expect(results.filter((result) => result === null)).toHaveLength(
      policy.racingRequests - policy.remaining,
    )
    expect(await services.publicAdmissions.reserve(email)).toBe(id)
    expect(await services.publicAdmissions.reserve('overflow@example.test')).toBeNull()
  })

  it('atomically activates only matching pending identity and retains accepted spending after deletion', async () => {
    const email = 'spent@example.test'
    const id = await hold(email.toUpperCase())
    await pending(email, id)
    const wrongId = crypto.randomUUID()
    await pending('wrong@example.test', wrongId)
    expect(await services.publicAdmissions.activate(email, wrongId)).toBe(false)
    expect(await services.publicAdmissions.activate(email, id)).toBe(true)
    const [admitted] = await services.db.select().from(user).where(eq(user.id, id))
    expect(admitted?.membershipCohort).toBe('public')
    expect(await services.publicAdmissions.activate(email, id)).toBe(false)
    await services.db.delete(user).where(eq(user.id, id))
    await services.publicAdmissions.release(email, id)
    expect(await services.publicAdmissions.reserve(email)).toBeNull()
    const [record] = await services.db
      .select()
      .from(publicAdmission)
      .where(eq(publicAdmission.userId, id))
    expect(record?.consumedAt).toBeInstanceOf(Date)
    expect(JSON.stringify(record)).not.toContain(email)
  })

  it('releases failed insertion and keeps expired pending provenance without counting unrelated private pending accounts', async () => {
    const email = 'retry@example.test'
    const id = await hold(email)
    await services.publicAdmissions.release(email, id)
    expect(await services.db.select().from(publicAdmission)).toHaveLength(0)
    const retryId = await hold(email)
    await pending(email, retryId)
    await services.db.update(publicAdmission).set({ expiresAt: new Date(Date.now() - 1) })
    expect(await services.publicAdmissions.activate(email, retryId)).toBe(false)
    await services.publicAdmissions.release(email, retryId)
    expect(await services.db.select().from(publicAdmission)).toHaveLength(1)
    const [candidate] = await services.db.select().from(user).where(eq(user.id, retryId))
    expect(candidate?.membershipCohort).toBe('pending')
  })

  it('counts each public account or hold once and excludes every unrelated pending user', async () => {
    await services.db.run(
      sql`WITH RECURSIVE account_number(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM account_number WHERE value < ${PUBLIC_SIGNUP_POLICY.maximumAccounts}) INSERT INTO user (id, name, email, email_verified, membership_cohort, role, created_at, updated_at) SELECT 'private-pending-' || value, 'Private pending fixture', 'private-pending-' || value || '@example.test', 0, 'pending', 'user', ${Date.now()}, ${Date.now()} FROM account_number`,
    )
    const email = 'last-population@example.test'
    const id = await hold(email)
    await pending(email, id)
    await services.db.run(
      sql`WITH RECURSIVE account_number(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM account_number WHERE value < ${PUBLIC_SIGNUP_POLICY.maximumAccounts - 1}) INSERT INTO user (id, name, email, email_verified, membership_cohort, role, created_at, updated_at) SELECT 'public-' || value, 'Public fixture', 'public-' || value || '@example.test', 0, 'public', 'user', ${Date.now()}, ${Date.now()} FROM account_number`,
    )
    expect(await services.publicAdmissions.reserve('overflow@example.test')).toBeNull()
    expect(await services.publicAdmissions.activate(email, id)).toBe(true)
    expect(await services.publicAdmissions.reserve('still-overflow@example.test')).toBeNull()
    await services.db.delete(user).where(eq(user.id, 'public-1'))
    expect(await services.publicAdmissions.reserve('free-slot@example.test')).not.toBeNull()
  })
})
