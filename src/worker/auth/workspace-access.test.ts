import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'
import { signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Private Owner',
  email: 'owner@example.test',
  password: 'private owner password',
}
const OTHER = {
  name: 'Private Other',
  email: 'other@example.test',
  password: 'private other password',
}
const sessionSchema = z.object({
  user: z.object({ id: z.string() }),
  session: z.object({ activeOrganizationId: z.string().nullable() }),
})
let harness: TestHarness
let owner: TestClient
let other: TestClient
let organizationId: string
let otherOrganizationId: string

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Owner private fixture',
    slug: 'owner-private-fixture',
  }))
  ;({ client: other, organizationId: otherOrganizationId } = await signUpOwner(harness, OTHER, {
    name: 'Other private fixture',
    slug: 'other-private-fixture',
  }))
})

describe('Better Auth workspace and account boundaries', () => {
  it.each([
    'get-organization',
    'get-full-organization',
    'list-members',
    'list-invitations',
    'get-active-member-role',
    'get-active-member',
  ])('rejects foreign and unknown %s targets identically', async (endpoint) => {
    const foreign = await other.get(
      `/api/auth/organization/${endpoint}?organizationId=${organizationId}`,
    )
    const unknown = await other.get(
      `/api/auth/organization/${endpoint}?organizationId=unknown-private-workspace`,
    )
    expect(foreign.status).toBe(403)
    expect(unknown.status).toBe(403)
    expect(await foreign.json()).toEqual(await unknown.json())
    const session = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session')))
    expect(session.session.activeOrganizationId).toBe(otherOrganizationId)
  })
  it('authorizes before reading tenant profile by slug, including unknown and malformed slugs', async () => {
    const path = '/api/auth/organization/get-full-organization?organizationSlug='
    const foreign = await other.get(`${path}owner-private-fixture`)
    const unknown = await other.get(`${path}unknown-private-fixture`)
    expect(await foreign.json()).toEqual(await unknown.json())
    expect(await responseStatus(other.get(`${path}bad%2Fslug`))).toBe(403)
    const own = await owner.get(`${path}owner-private-fixture`)
    expect(own.status).toBe(200)
    const ownBody = await own.text()
    expect(ownBody).toContain(OWNER.email)
    expect(ownBody).not.toContain(OTHER.email)
  })
  it('blocks a stale account binding before signout or user changes, preserving the current account', async () => {
    const original = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const current = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session')))
    const headers = { [ACCOUNT_ID_HEADER]: original.user.id, 'content-type': 'application/json' }
    expect(await responseStatus(other.request('/api/auth/get-session', { headers }))).toBe(403)
    expect(
      await responseStatus(
        other.request('/api/auth/sign-out', { method: 'POST', headers, body: '{}' }),
      ),
    ).toBe(403)
    const body = JSON.stringify({ name: 'Wrong account change' })
    expect(
      await responseStatus(
        other.request('/api/auth/update-user', { method: 'POST', headers, body }),
      ),
    ).toBe(403)
    const remaining = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session')))
    expect(remaining.user.id).toBe(current.user.id)
    expect(
      await responseStatus(
        other.request('/api/auth/list-accounts', {
          headers: { [ACCOUNT_ID_HEADER]: current.user.id },
        }),
      ),
    ).toBe(200)
    expect(
      await responseStatus(
        other.request('/api/auth/list-accounts', { headers: { [ACCOUNT_ID_HEADER]: 'bad/id' } }),
      ),
    ).toBe(403)
  })
  it('allows empty active-workspace state while keeping anonymous reads protected', async () => {
    const anonymous = new TestClient(harness.app, harness.env)
    expect(
      await responseStatus(anonymous.get('/api/auth/organization/get-full-organization')),
    ).toBe(401)
    await owner.post('/api/auth/organization/set-active', { organizationId: null })
    expect(await responseJson(owner.get('/api/auth/organization/get-full-organization'))).toBeNull()
  })
  it('uses neutral custom API denials and preserves both accounts after mismatched mutations', async () => {
    const original = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const current = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session')))
    const endpoint = '/api/me/recent-view'
    for (const [client, userId, view] of [
      [owner, original.user.id, 'details'],
      [other, current.user.id, 'list'],
    ] as const) {
      const response = await client.request(endpoint, {
        method: 'PATCH',
        headers: { [ACCOUNT_ID_HEADER]: userId, 'content-type': 'application/json' },
        body: JSON.stringify({ view }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ view })
    }
    for (const userId of [original.user.id, 'unknown-account']) {
      const denied = await other.request(endpoint, {
        method: 'PATCH',
        headers: { [ACCOUNT_ID_HEADER]: userId, 'content-type': 'application/json' },
        body: JSON.stringify({ view: 'thumbnails' }),
      })
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ error: 'forbidden' })
      expect(denied.headers.get('cache-control')).toBe('no-store')
      expect(denied.headers.get('content-security-policy')).toContain("default-src 'none'")
    }
    expect(await responseJson(owner.get(endpoint))).toEqual({ view: 'details' })
    expect(await responseJson(other.get(endpoint))).toEqual({ view: 'list' })
  })
  it('validates custom account bindings and never treats a binding as an anonymous credential', async () => {
    const current = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session')))
    const endpoint = '/api/me/recent-view'
    const malformed = await other.request(endpoint, { headers: { [ACCOUNT_ID_HEADER]: 'bad/id' } })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      error: 'validation_failed',
      details: 'Invalid account binding',
    })
    const unboundReplay = await other.request(endpoint, {
      headers: { [SYNC_OPERATION_HEADER]: crypto.randomUUID() },
    })
    expect(unboundReplay.status).toBe(400)
    expect(await unboundReplay.json()).toEqual({
      error: 'validation_failed',
      details: 'Synchronization requires an account binding',
    })
    const anonymous = new TestClient(harness.app, harness.env)
    const forged = await anonymous.request(endpoint, {
      headers: { [ACCOUNT_ID_HEADER]: current.user.id },
    })
    expect(forged.status).toBe(401)
    expect(await forged.json()).toEqual({ error: 'unauthenticated' })
    const bound = await other.request(endpoint, {
      headers: { [ACCOUNT_ID_HEADER]: current.user.id },
    })
    expect(bound.status).toBe(200)
    expect(await bound.json()).toEqual({ view: 'thumbnails' })
  })
})
