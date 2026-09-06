/**
 * Runs inside workerd with real D1, real rate-limit bindings and Better Auth
 * over drizzle. Mirrors the Node flow tests at a coarser grain: the point is
 * to prove the wiring (schema, adapter, bindings), not to re-test every
 * branch.
 */
import { env } from 'cloudflare:workers'

import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import { auditListResponseSchema } from '../shared/api'
import { AUTH_RATE_LIMIT, HTTP_STATUS } from '../shared/constants'
import { TestClient } from './test-support/client'

const app = createApp()
const owner = {
  name: 'Dana D1',
  email: 'dana@example.test',
  password: 'a perfectly fine passphrase',
}

function mailbox() {
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) {
    throw new Error('workers tests expect EMAIL_PROVIDER=console')
  }
  return devMailbox
}

describe('Better Auth over D1', () => {
  let client: TestClient
  let organizationId: string

  beforeAll(async () => {
    client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox(), owner)
    organizationId = await client.createOrganization('D1 Studio', 'd1-studio')
  })

  it('persists the user, session and organization in D1', async () => {
    const { db } = getServices(env)
    const users = await db.query.user.findMany()
    expect(users.map((row) => row.email)).toEqual([owner.email])
    expect(users[0]?.emailVerified).toBe(true)

    const members = await db.query.member.findMany()
    expect(members).toHaveLength(1)
    expect(members[0]?.role).toBe('owner')
    expect(members[0]?.organizationId).toBe(organizationId)
  })

  it('serves the audit trail from the audit_log table', async () => {
    const response = await client.get(`/api/orgs/${organizationId}/audit`)
    expect(response.status).toBe(HTTP_STATUS.ok)
    const { entries } = auditListResponseSchema.parse(await response.json())
    expect(entries.map((entry) => entry.action)).toEqual(['organization.created'])
    expect(entries[0]?.actorName).toBe(owner.name)
  })

  it('rate limits repeated credential attempts from one address', async () => {
    const attacker = new TestClient(app, env)
    const attempt = async () =>
      await attacker.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
          'cf-connecting-ip': '203.0.113.9',
        },
        body: JSON.stringify({ email: owner.email, password: 'definitely wrong' }),
      })

    const statuses: number[] = []
    for (let index = 0; index < AUTH_RATE_LIMIT.max; index += 1) {
      const response = await attempt()
      statuses.push(response.status)
    }
    expect(statuses.every((status) => status === HTTP_STATUS.unauthorized)).toBe(true)

    const limited = await attempt()
    expect(limited.status).toBe(HTTP_STATUS.tooManyRequests)
    expect(limited.headers.get('x-retry-after')).toMatch(/^\d+$/)
  })
})
