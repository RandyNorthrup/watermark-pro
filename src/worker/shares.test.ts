import { beforeEach, describe, expect, it } from 'vitest'

import { NEVER_EXPIRES, signShareToken } from './share-token'
import { errorCodeOf, joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import {
  photoDtoSchema,
  publicShareSchema,
  shareDtoSchema,
  shareListResponseSchema,
} from '../shared/api'
import {
  API_ERROR_CODE,
  HTTP_STATUS,
  MAX_SHARE_PHOTOS,
  SHARE_PATH_PREFIX,
} from '../shared/constants'

const owner = {
  name: 'Sam Sharer',
  email: 'sam@example.test',
  password: 'correct horse battery',
}
const viewer = {
  name: 'Vera Viewer',
  email: 'vera@example.test',
  password: 'viewers long password',
}
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const SECONDS_PER_DAY = 86_400

async function statusOf(client: TestClient, path: string): Promise<number> {
  const response = await client.get(path)
  return response.status
}

let harness: TestHarness
let ownerClient: TestClient
let organizationId: string

function base(path = ''): string {
  return `/api/orgs/${organizationId}${path}`
}

async function uploadPhoto(name: string): Promise<string> {
  const form = new FormData()
  form.append('file', new File([PNG_BYTES], `${name}.png`, { type: 'image/png' }))
  form.append('thumbnail', new File([PNG_BYTES], 'thumb.png', { type: 'image/png' }))
  form.append('name', name)
  form.append('width', '20')
  form.append('height', '10')
  const response = await ownerClient.request(base('/photos'), { method: 'POST', body: form })
  expect(response.status).toBe(HTTP_STATUS.created)
  return photoDtoSchema.parse(await response.json()).id
}

async function createShare(body: unknown) {
  const response = await ownerClient.post(base('/shares'), body)
  expect(response.status).toBe(HTTP_STATUS.created)
  return shareDtoSchema.parse(await response.json())
}

/** The public API path for a share URL as returned by the Worker. */
function publicPath(url: string): string {
  const token = new URL(url).pathname.slice(SHARE_PATH_PREFIX.length)
  return `/api/share/${token}`
}

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: ownerClient, organizationId } = await signUpOwner(harness, owner, {
    name: 'Share Studio',
    slug: 'share-studio',
  }))
})

describe('share links', () => {
  it('publishes chosen photos under a link that anonymous visitors can use', async () => {
    const first = await uploadPhoto('First')
    const second = await uploadPhoto('Second')
    const hidden = await uploadPhoto('Hidden')
    const share = await createShare({
      title: 'Wedding preview',
      photoIds: [first, second, first],
      expiresInDays: 7,
    })
    expect(share.photoCount).toBe(2)
    expect(share.revokedAt).toBeNull()
    expect(share.url.startsWith(`${harness.env.APP_URL}${SHARE_PATH_PREFIX}`)).toBe(true)
    const expiresAt = share.expiresAt === null ? 0 : Date.parse(share.expiresAt)
    expect(expiresAt - Date.now()).toBeGreaterThan(6 * SECONDS_PER_DAY * 1000)

    const anonymous = new TestClient(harness.app, harness.env)
    const view = await anonymous.get(publicPath(share.url))
    expect(view.status).toBe(HTTP_STATUS.ok)
    expect(view.headers.get('cache-control')).toBe('no-store')
    const body = publicShareSchema.parse(await view.json())
    expect(body.title).toBe('Wedding preview')
    expect(body.photos.map((photo) => photo.name)).toEqual(['First', 'Second'])

    const file = await anonymous.get(`${publicPath(share.url)}/photos/${first}/file`)
    expect(file.status).toBe(HTTP_STATUS.ok)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG_BYTES)
    const thumbnail = await anonymous.get(`${publicPath(share.url)}/photos/${second}/thumbnail`)
    expect(thumbnail.status).toBe(HTTP_STATUS.ok)

    // Photos outside the share, even from the same organization, stay private.
    const leak = await anonymous.get(`${publicPath(share.url)}/photos/${hidden}/file`)
    expect(leak.status).toBe(HTTP_STATUS.notFound)

    const listed = await ownerClient.get(base('/shares'))
    expect(shareListResponseSchema.parse(await listed.json()).shares.map((s) => s.id)).toEqual([
      share.id,
    ])
    const records = await harness.audit.listForOrganization(organizationId)
    expect(records.map((record) => record.action)).toContain('share.created')
  })

  it('rejects unknown photos, empty and oversized selections, and bad bodies', async () => {
    const photo = await uploadPhoto('Only')
    const foreign = await ownerClient.post(base('/shares'), {
      title: 'Nope',
      photoIds: [photo, 'not-ours'],
    })
    expect(foreign.status).toBe(HTTP_STATUS.badRequest)
    const empty = await ownerClient.post(base('/shares'), { title: 'Nope', photoIds: [] })
    expect(empty.status).toBe(HTTP_STATUS.badRequest)
    const tooMany = await ownerClient.post(base('/shares'), {
      title: 'Nope',
      photoIds: Array.from({ length: MAX_SHARE_PHOTOS + 1 }, () => photo),
    })
    expect(tooMany.status).toBe(HTTP_STATUS.badRequest)
    const badExpiry = await ownerClient.post(base('/shares'), {
      title: 'Nope',
      photoIds: [photo],
      expiresInDays: 2,
    })
    expect(badExpiry.status).toBe(HTTP_STATUS.badRequest)
    const notJson = await ownerClient.request(base('/shares'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    expect(notJson.status).toBe(HTTP_STATUS.badRequest)
  })

  it('refuses expired, revoked, tampered and unknown tokens with a plain 404', async () => {
    const photo = await uploadPhoto('Only')
    const share = await createShare({ title: 'Short lived', photoIds: [photo] })
    const anonymous = new TestClient(harness.app, harness.env)
    const secret = harness.env.BETTER_AUTH_SECRET

    const expired = await signShareToken(secret, { id: share.id, expiresAt: 1 })
    expect(await statusOf(anonymous, `/api/share/${expired}`)).toBe(HTTP_STATUS.notFound)

    // A valid signature over a different expiry than the record's is refused too.
    const extended = await signShareToken(secret, { id: share.id, expiresAt: NEVER_EXPIRES + 1 })
    expect(await statusOf(anonymous, `/api/share/${extended}`)).toBe(HTTP_STATUS.notFound)

    const token = publicPath(share.url)
    expect(await statusOf(anonymous, `${token}x`)).toBe(HTTP_STATUS.notFound)
    expect(await statusOf(anonymous, '/api/share/unknown.0.abc')).toBe(HTTP_STATUS.notFound)
    const ghost = await signShareToken(secret, { id: 'no-such-share', expiresAt: NEVER_EXPIRES })
    expect(await statusOf(anonymous, `/api/share/${ghost}`)).toBe(HTTP_STATUS.notFound)

    const revoked = await ownerClient.post(base(`/shares/${share.id}/revoke`), {})
    expect(revoked.status).toBe(HTTP_STATUS.ok)
    expect(shareDtoSchema.parse(await revoked.json()).revokedAt).not.toBeNull()
    expect(await statusOf(anonymous, token)).toBe(HTTP_STATUS.notFound)
    expect(await statusOf(anonymous, `${token}/photos/${photo}/file`)).toBe(HTTP_STATUS.notFound)
    const again = await ownerClient.post(base(`/shares/${share.id}/revoke`), {})
    expect(again.status).toBe(HTTP_STATUS.notFound)
    const records = await harness.audit.listForOrganization(organizationId)
    expect(records.map((record) => record.action)).toContain('share.revoked')
  })

  it('rate limits anonymous access by address', async () => {
    const limited = createTestHarness({
      rateLimit: {
        consume: (key) =>
          Promise.resolve(
            key.startsWith('203.0.113.9|')
              ? { allowed: false, retryAfter: 30 }
              : { allowed: true, retryAfter: null },
          ),
      },
    })
    const { client, organizationId: orgId } = await signUpOwner(limited, owner, {
      name: 'Limited',
      slug: 'limited',
    })
    const form = new FormData()
    form.append('file', new File([PNG_BYTES], 'p.png', { type: 'image/png' }))
    form.append('thumbnail', new File([PNG_BYTES], 't.png', { type: 'image/png' }))
    form.append('name', 'P')
    form.append('width', '1')
    form.append('height', '1')
    const uploaded = await client.request(`/api/orgs/${orgId}/photos`, {
      method: 'POST',
      body: form,
    })
    const photoId = photoDtoSchema.parse(await uploaded.json()).id
    const created = await client.post(`/api/orgs/${orgId}/shares`, {
      title: 'T',
      photoIds: [photoId],
    })
    const share = shareDtoSchema.parse(await created.json())

    const anonymous = new TestClient(limited.app, limited.env)
    const blocked = await anonymous.request(publicPath(share.url), {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    })
    expect(blocked.status).toBe(HTTP_STATUS.tooManyRequests)
    expect(blocked.headers.get('retry-after')).toBe('30')
    expect(await errorCodeOf(blocked)).toBe(API_ERROR_CODE.rateLimited)
    const allowed = await anonymous.request(publicPath(share.url), {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    })
    expect(allowed.status).toBe(HTTP_STATUS.ok)
  })
})

describe('share access control', () => {
  it('keeps viewers and outsiders from creating, listing or revoking links', async () => {
    const photo = await uploadPhoto('Only')
    const share = await createShare({ title: 'Team', photoIds: [photo] })
    const viewerClient = await joinAsMember(harness, ownerClient, organizationId, viewer, 'viewer')
    expect(await statusOf(viewerClient, base('/shares'))).toBe(HTTP_STATUS.forbidden)
    const create = await viewerClient.post(base('/shares'), { title: 'No', photoIds: [photo] })
    expect(create.status).toBe(HTTP_STATUS.forbidden)
    const revoke = await viewerClient.post(base(`/shares/${share.id}/revoke`), {})
    expect(revoke.status).toBe(HTTP_STATUS.forbidden)
    const anonymous = new TestClient(harness.app, harness.env)
    expect(await statusOf(anonymous, base('/shares'))).toBe(HTTP_STATUS.unauthorized)
  })
})
