import { describe, expect, it } from 'vitest'

import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import { createTestHarness } from './test-support/test-app'
import { ACCOUNT_ID_HEADER } from '../shared/account-identity'

const ENDPOINT = '/api/me/guidance/claim'
const PERSON = {
  name: 'Guide User',
  email: 'guide@example.test',
  password: 'correct horse battery',
}

describe('permanent account guidance claims', () => {
  it('allows exactly one concurrent claim, rejects reset/forged fields, and keeps another account independent', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    await client.signUpAndVerify(harness.mailbox, PERSON)
    const responses = await Promise.all([
      responseJson(client.post(ENDPOINT, { topic: 'image' })),
      responseJson(client.post(ENDPOINT, { topic: 'image' })),
      responseJson(client.post(ENDPOINT, { topic: 'image' })),
    ])
    expect(
      responses.filter((response) => JSON.stringify(response) === '{"claimed":true}'),
    ).toHaveLength(1)
    expect(
      responses.filter((response) => JSON.stringify(response) === '{"claimed":false}'),
    ).toHaveLength(2)
    expect(await responseJson(client.post(ENDPOINT, { topic: 'image' }))).toEqual({
      claimed: false,
    })
    for (const body of [
      { topic: 'unknown' },
      { topic: 'image', reset: true },
      { topic: 'export', userId: 'other' },
    ]) {
      expect(await responseStatus(client.post(ENDPOINT, body))).toBe(400)
    }
    expect(
      await responseStatus(
        client.request(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ),
    ).toBe(400)
    expect(await responseStatus(client.request(ENDPOINT, { method: 'DELETE' }))).toBe(404)
    const other = new TestClient(harness.app, harness.env)
    await other.signUpAndVerify(harness.mailbox, { ...PERSON, email: 'other-guide@example.test' })
    expect(await responseJson(other.post(ENDPOINT, { topic: 'image' }))).toEqual({ claimed: true })
    const forbidden = await other.request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACCOUNT_ID_HEADER]: 'foreign-account' },
      body: JSON.stringify({ topic: 'export' }),
    })
    expect(forbidden.status).toBe(403)
    expect(await responseJson(other.post(ENDPOINT, { topic: 'export' }))).toEqual({ claimed: true })
    const response = await client.post(ENDPOINT, { topic: 'export' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    client.useOrigin('https://foreign.example')
    expect(await responseStatus(client.post(ENDPOINT, { topic: 'gallery' }))).toBe(403)
    const anonymous = new TestClient(harness.app, harness.env)
    expect(await responseStatus(anonymous.post(ENDPOINT, { topic: 'image' }))).toBe(401)
  })

  it.each(['admin', 'editor', 'viewer'])(
    'keeps an explicit workspace %s separate from its owner',
    async (role) => {
      const harness = createTestHarness()
      const { client, organizationId } = await signUpOwner(harness, PERSON, {
        name: 'Guide Studio',
        slug: 'guide-studio',
      })
      expect(await responseJson(client.post(ENDPOINT, { topic: 'workspace' }))).toEqual({
        claimed: true,
      })
      const member = await joinAsMember(
        harness,
        client,
        organizationId,
        { ...PERSON, email: `${role}-guide@example.test` },
        role,
      )
      expect(await responseJson(member.post(ENDPOINT, { topic: 'workspace' }))).toEqual({
        claimed: true,
      })
      expect(await responseJson(member.post(ENDPOINT, { topic: 'workspace' }))).toEqual({
        claimed: false,
      })
      expect(await responseJson(client.post(ENDPOINT, { topic: 'workspace' }))).toEqual({
        claimed: false,
      })
    },
  )
})
