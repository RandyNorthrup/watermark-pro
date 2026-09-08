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
          origin: 'http://localhost:5273',
          'cf-connecting-ip': '203.0.113.9',
        },
        body: JSON.stringify({ email: owner.email, password: 'definitely wrong' }),
      })

    const statuses: number[] = []
    for (let index = 0; index < AUTH_RATE_LIMIT.max; index += 1) {
      const response = await attempt()
      statuses.push(response.status)
    }
    // Up to the configured limit, wrong-password attempts are rejected on their
    // own merits (401) and never throttled — a legitimate user mistyping a
    // password is not locked out before the limit.
    expect(statuses.every((status) => status === HTTP_STATUS.unauthorized)).toBe(true)

    // Past the limit the IP is throttled. Cloudflare's Rate Limiting binding is
    // approximate — it may let a small burst through before the counter catches
    // up — so the throttle is asserted to engage within a few extra attempts
    // rather than exactly on the (max + 1)th. Each pre-throttle response is
    // still a plain 401: the wrong password must never authenticate, limit or
    // no limit. Once engaged the throttle returns 429 with a numeric retry hint.
    const RATE_LIMIT_MARGIN = 5
    let limited: Response | null = null
    for (let index = 0; limited === null && index < RATE_LIMIT_MARGIN; index += 1) {
      const response = await attempt()
      if (response.status === HTTP_STATUS.tooManyRequests) {
        limited = response
      } else {
        expect(response.status).toBe(HTTP_STATUS.unauthorized)
      }
    }
    if (limited === null) {
      throw new Error(
        `rate limiting did not engage within ${String(AUTH_RATE_LIMIT.max + RATE_LIMIT_MARGIN)} attempts`,
      )
    }
    expect(limited.headers.get('x-retry-after')).toMatch(/^\d+$/)
  })
})
