import { beforeEach, describe, expect, it } from 'vitest'

import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { recentWorkResponseSchema } from '../shared/recent-work'
import { shellSessionSchema } from '../shared/shell-cache'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const PERSON = {
  name: 'Recent Owner',
  email: 'recent-owner@example.test',
  password: 'correct horse battery',
}
const FIRST = '2026-01-01T10:00:00.000Z'
const SECOND = '2026-02-01T10:00:00.000Z'
let harness: TestHarness
let owner: TestClient
let organizationId: string
let ownerId: string
let endpoint: string
async function list(client: TestClient) {
  const response = await client.get(endpoint)
  expect(response.status).toBe(200)
  return recentWorkResponseSchema.parse(await response.json()).items
}

function setView(client: TestClient, view: string) {
  return responseStatus(
    client.request('/api/me/recent-view', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view }),
    }),
  )
}

beforeEach(async () => {
  harness = createTestHarness()
  const created = await signUpOwner(harness, PERSON, {
    name: 'Recent studio',
    slug: 'recent-studio',
  })
  owner = created.client
  organizationId = created.organizationId
  endpoint = `/api/orgs/${organizationId}/recent-work`
  ownerId = shellSessionSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user.id
  await harness.services.watermarks.create({
    id: 'preset-one',
    organizationId,
    name: 'Original mark',
    spec: DEFAULT_TEXT_SPEC,
    createdBy: ownerId,
  })
  await harness.services.photos.create({
    id: 'photo-one',
    organizationId,
    name: 'Saved photo.png',
    key: `org/${organizationId}/photos/photo-one`,
    thumbnailKey: `org/${organizationId}/thumbnails/photo-one`,
    contentType: 'image/png',
    size: 40,
    width: 4,
    height: 4,
    presetId: null,
    presetName: null,
    createdBy: ownerId,
  })
})

describe('personal recent activity', () => {
  it('starts empty despite existing resources, orders actual activity, and rejects an older replay', async () => {
    expect(await list(owner)).toEqual([])
    expect(
      await responseStatus(
        owner.post(endpoint, { kind: 'preset', resourceId: 'preset-one', usedAt: FIRST }),
      ),
    ).toBe(204)
    expect(
      await responseStatus(
        owner.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: SECOND }),
      ),
    ).toBe(204)
    const initial = await list(owner)
    expect(initial.map((item) => item.kind)).toEqual(['photo', 'preset'])
    await owner.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: FIRST })
    const replayed = await list(owner)
    expect(replayed[0]?.usedAt).toBe(SECOND)
    const response = await owner.get(endpoint)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each(['admin', 'editor', 'viewer'])(
    'allows %s to record only their own activity in an explicitly shared workspace',
    async (role) => {
      await owner.post(endpoint, { kind: 'preset', resourceId: 'preset-one', usedAt: FIRST })
      const member = await joinAsMember(
        harness,
        owner,
        organizationId,
        { name: role, email: `${role}@example.test`, password: 'correct horse battery' },
        role,
      )
      expect(await list(member)).toEqual([])
      expect(
        await responseStatus(
          member.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: SECOND }),
        ),
      ).toBe(204)
      const memberHistory = await list(member)
      const ownerHistory = await list(owner)
      expect(memberHistory.map((item) => item.kind)).toEqual(['photo'])
      expect(ownerHistory.map((item) => item.kind)).toEqual(['preset'])
      const mismatch = await member.request(endpoint, { headers: { [ACCOUNT_ID_HEADER]: ownerId } })
      expect(mismatch.status).toBe(403)
    },
  )

  it('refuses anonymous, nonmember, foreign-resource and forged-owner requests without revealing history', async () => {
    const outsider = new TestClient(harness.app, harness.env)
    expect(await responseStatus(outsider.get(endpoint))).toBe(401)
    await outsider.signUpAndVerify(harness.mailbox, {
      name: 'Other',
      email: 'other@example.test',
      password: 'correct horse battery',
    })
    expect(await responseStatus(outsider.get(endpoint))).toBe(403)
    expect(
      await responseStatus(
        outsider.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: FIRST }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(
        owner.post(endpoint, { kind: 'photo', resourceId: 'foreign-photo', usedAt: FIRST }),
      ),
    ).toBe(404)
    expect(
      await responseStatus(
        owner.post(endpoint, {
          kind: 'photo',
          resourceId: 'photo-one',
          usedAt: FIRST,
          userId: 'another-user',
        }),
      ),
    ).toBe(400)
    expect(await list(owner)).toEqual([])
  })

  it('removes deleted resources and does not retain their names or previews', async () => {
    await owner.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: SECOND })
    await owner.post(endpoint, { kind: 'preset', resourceId: 'preset-one', usedAt: FIRST })
    await harness.services.photos.deleteMany(organizationId, ['photo-one'])
    await harness.services.watermarks.delete(organizationId, 'preset-one')
    expect(await list(owner)).toEqual([])
    expect(await harness.services.recents.list(ownerId, organizationId)).toEqual([])
  })

  it('keeps the three view preferences separate between accounts and rejects unknown modes', async () => {
    const other = new TestClient(harness.app, harness.env)
    await other.signUpAndVerify(harness.mailbox, {
      name: 'Other',
      email: 'other@example.test',
      password: 'correct horse battery',
    })
    expect(await responseJson(owner.get('/api/me/recent-view'))).toEqual({ view: 'thumbnails' })
    expect(await setView(owner, 'details')).toBe(200)
    expect(await responseJson(owner.get('/api/me/recent-view'))).toEqual({ view: 'details' })
    expect(await responseJson(other.get('/api/me/recent-view'))).toEqual({ view: 'thumbnails' })
    expect(await setView(other, 'list')).toBe(200)
    expect(await responseJson(owner.get('/api/me/recent-view'))).toEqual({ view: 'details' })
    expect(await setView(owner, 'other')).toBe(400)
  })

  it('rejects malformed JSON and impossible/future timestamps before storing activity', async () => {
    expect(
      await responseStatus(
        owner.request(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ),
    ).toBe(400)
    expect(
      await responseStatus(
        owner.post(endpoint, { kind: 'photo', resourceId: 'photo-one', usedAt: 'not-a-date' }),
      ),
    ).toBe(400)
    expect(
      await responseStatus(
        owner.post(endpoint, {
          kind: 'photo',
          resourceId: 'photo-one',
          usedAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
    ).toBe(400)
    expect(await list(owner)).toEqual([])
  })
})
