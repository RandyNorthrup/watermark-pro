import { env } from 'cloudflare:workers'

import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { member, organization, privateWorkspace, user } from './db/schema'
import { createApp } from './index'
import { getServices } from './services'
import { signShareToken } from './share-token'
import { createStripeGateway } from './stripe-gateway'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import {
  installStripeFixture,
  STRIPE_FIXTURE_CONFIG,
  stripeAuthority,
} from './test-support/stripe-fixture'
import { cleanupUploads, persistUpload } from './upload-lifecycle'
import { UPLOAD_POLICY, type UploadRecord, type UploadReservation } from './upload-store'
import { CLOUD_OPERATION_POLICY } from '../shared/cloud-operations'
import { DEFAULT_STYLE } from '../shared/watermark'

const services = getServices(env)
const app = createApp({ resolveServices: () => services })
const sessionSchema = z.object({ user: z.object({ id: z.string() }) })
const PASSWORD = 'Personal cleanup fixture password'
const PAYLOAD = new Uint8Array([73, 42, 99]).buffer
let networkIdentity = 0
/** Independent actors use distinct TEST-NET identities; production limits stay enabled. */
class CleanupClient extends TestClient {
  readonly #address = `192.0.2.${String(++networkIdentity)}`
  constructor() {
    super(app, env)
  }
  override async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('cf-connecting-ip', this.#address)
    return await super.request(path, { ...init, headers })
  }
}
let manager: TestClient
beforeAll(async () => {
  if (services.devMailbox === undefined) throw new Error('Cleanup fixture needs its named mailbox.')
  manager = new CleanupClient()
  await manager.signUpAndVerify(services.devMailbox, {
    name: 'Cleanup site owner',
    email: 'cleanup-manager@example.test',
    password: PASSWORD,
  })
  expect(await services.users.promoteToSiteOwner('cleanup-manager@example.test')).toBe(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function personal(hasRealAuth = false) {
  const id = crypto.randomUUID()
  const client = new CleanupClient()
  let userId = id
  const credentials = { name: 'Cleanup account', email: `${id}@example.test`, password: PASSWORD }
  if (hasRealAuth) {
    if (services.devMailbox === undefined)
      throw new Error('Cleanup fixture needs its named mailbox.')
    await client.signUpAndVerify(services.devMailbox, credentials)
    userId = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session'))).user.id
  } else
    await services.db.insert(user).values({
      id,
      name: credentials.name,
      email: credentials.email,
      emailVerified: true,
      membershipCohort: 'private',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  const organizationId = await services.accounts.ensurePrivateWorkspace(userId)
  return { userId, organizationId, client, credentials }
}
function producer(
  scope: { userId: string; organizationId: string },
  kind: 'photo' | 'logo' = 'logo',
) {
  const id = crypto.randomUUID(),
    lease = crypto.randomUUID()
  const key = `org/${scope.organizationId}/${kind}/${id}/${lease}`
  const keys = kind === 'photo' ? [key, `${key}-thumbnail`] : [key]
  const reservation: UploadReservation = {
    id: lease,
    ...scope,
    uploadId: id,
    kind,
    fingerprint: 'named-personal-payload',
    keys,
    bytes: PAYLOAD.byteLength * keys.length,
    expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
  }
  const value = {
    id,
    organizationId: scope.organizationId,
    createdBy: scope.userId,
    key,
    name: 'Personal binary',
    contentType: 'image/png',
    size: PAYLOAD.byteLength,
    width: 1,
    height: 1,
  }
  const record: UploadRecord =
    kind === 'photo'
      ? {
          kind,
          value: {
            ...value,
            thumbnailKey: `${key}-thumbnail`,
            thumbnailSize: PAYLOAD.byteLength,
            presetId: null,
            presetName: null,
          },
        }
      : { kind, value: { ...value, kind: 'logo' } }
  return {
    reservation,
    record,
    key,
    parts: keys.map((part) => ({ key: part, bytes: PAYLOAD, contentType: value.contentType })),
  }
}
async function content(scope: { userId: string; organizationId: string }) {
  const image = producer(scope, 'photo'),
    logo = producer(scope)
  for (const item of [image, logo])
    await persistUpload(
      services,
      item.reservation,
      item.record,
      {
        organizationId: scope.organizationId,
        actorUserId: scope.userId,
        actorName: 'Personal cleanup actor label',
        action: 'cleanup.fixture.uploaded',
        targetType: item.record.kind,
      },
      item.parts,
    )
  await services.watermarks.create({
    id: crypto.randomUUID(),
    organizationId: scope.organizationId,
    name: 'Personal logo preset',
    createdBy: scope.userId,
    spec: {
      kind: 'image',
      assetId: logo.reservation.uploadId,
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: DEFAULT_STYLE,
    },
  })
  const link = await services.shares.create({
    id: crypto.randomUUID(),
    organizationId: scope.organizationId,
    title: 'Personal share',
    photoIds: [image.reservation.uploadId],
    expiresAt: 0,
    createdBy: scope.userId,
  })
  const token = await signShareToken(services.config.BETTER_AUTH_SECRET, {
    id: link.id,
    expiresAt: 0,
  })
  return { image, logo, link, token, keys: [...image.reservation.keys, ...logo.reservation.keys] }
}
async function rows(table: string, organizationId: string) {
  const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE organization_id = ?`)
    .bind(organizationId)
    .all()
  return result.results
}
async function queue(organizationId: string) {
  const result = await env.DB.prepare(
    "SELECT id, keys FROM upload_reservation WHERE organization_id=? AND status='cleanup'",
  )
    .bind(organizationId)
    .all<{ id: string; keys: string }>()
  return result.results
}
async function storedBytes(key: string) {
  const object = await env.BUCKET.get(key)
  return await object?.arrayBuffer()
}
async function organizationExists(id: string) {
  return await env.DB.prepare('SELECT id FROM organization WHERE id=?').bind(id).first()
}
async function lock(userId: string) {
  await services.db.update(user).set({ banned: true }).where(eq(user.id, userId))
}
async function assertRemovedMetadata(organizationId: string) {
  for (const table of ['photo', 'asset', 'watermark'])
    expect(await rows(table, organizationId)).toEqual([])
}

// All persistence and physical objects here use actual D1/R2. Only Stripe's SDK fetch boundary is a named fixture.
describe('personal account removal and durable physical cleanup', () => {
  it.each(['self', 'admin'] as const)(
    '%s stages personal objects and revokes links before credential removal; shared content and financial receipts survive',
    async (actor) => {
      const scope = await personal(true)
      const saved = await content(scope)
      const sharedId = await scope.client.createOrganization(
        'Retained collaboration',
        `cleanup-${crypto.randomUUID()}`,
      )
      const collaboration = await content({ ...scope, organizationId: sharedId })
      const authority = stripeAuthority({
        id: scope.organizationId,
        organizationId: scope.organizationId,
        ownerId: scope.userId,
        requestId: crypto.randomUUID(),
      })
      const provider = installStripeFixture(authority, scope.userId)
      services.billing.provider = {
        config: STRIPE_FIXTURE_CONFIG,
        gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
      }
      expect(
        await responseStatus(
          scope.client.post('/api/me/billing/checkout', {
            requestId: authority.requestId,
            plan: 'pro',
          }),
        ),
      ).toBe(200)
      provider.completeCheckout()
      expect(
        await responseStatus(scope.client.post('/api/me/billing/reconcile', { plan: 'pro' })),
      ).toBe(200)
      expect(await responseStatus(new CleanupClient().get(`/api/share/${saved.token}`))).toBe(200)
      if (actor === 'admin') {
        // Keep this singleton exhausted; later self-removal cases prove cleanup without resetting it.
        const now = new Date(),
          month = now.getUTCFullYear() * 12 + now.getUTCMonth()
        await env.DB.prepare(
          'UPDATE workspace_plan SET operation_month=?, operation_units=? WHERE organization_id=?',
        )
          .bind(month, CLOUD_OPERATION_POLICY.limits.pro, scope.organizationId)
          .run()
        await env.DB.prepare('UPDATE cloud_operation_site_budget SET month=?, units=? WHERE id=1')
          .bind(month, CLOUD_OPERATION_POLICY.limits.site)
          .run()
        const ordinary = await scope.client.get(`/api/orgs/${scope.organizationId}/photos`)
        expect(ordinary.status).toBe(429)
        expect(await ordinary.json()).toMatchObject({ error: 'rate_limited' })
      }
      expect(
        await responseStatus(
          actor === 'self'
            ? scope.client.post('/api/auth/delete-user', { password: PASSWORD })
            : manager.post('/api/auth/admin/remove-user', { userId: scope.userId }),
        ),
      ).toBe(200)
      expect(
        await env.DB.prepare('SELECT id FROM user WHERE id=?').bind(scope.userId).first(),
      ).toBeNull()
      expect(
        await env.DB.prepare('SELECT id FROM account WHERE user_id=?').bind(scope.userId).first(),
      ).toBeNull()
      await assertRemovedMetadata(scope.organizationId)
      expect(await organizationExists(scope.organizationId)).not.toBeNull()
      expect(await queue(scope.organizationId)).toHaveLength(2)
      expect(await responseStatus(new CleanupClient().get(`/api/share/${saved.token}`))).toBe(404)
      for (const key of saved.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
      expect(await rows('photo', sharedId)).toHaveLength(1)
      expect(await rows('watermark', sharedId)).toHaveLength(1)
      expect(
        await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?')
          .bind(collaboration.link.id)
          .first(),
      ).toMatchObject({ revoked_at: null })
      expect(
        await env.DB.prepare(
          'SELECT owner_id, chargeable, subscription_status FROM billing_workspace WHERE id=?',
        )
          .bind(authority.id)
          .first(),
      ).toMatchObject({ owner_id: null, chargeable: 0, subscription_status: 'canceled' })
      expect(
        await env.DB.prepare(
          'SELECT actor_user_id, target_type, target_id FROM audit_log WHERE organization_id=? AND action=?',
        )
          .bind(scope.organizationId, 'account.personal-content.staged')
          .first(),
      ).toMatchObject({ actor_user_id: null, target_type: 'user', target_id: scope.userId })
      expect(await cleanupUploads(services, scope.organizationId)).toBe(0)
      for (const key of saved.keys) expect(await env.BUCKET.get(key)).toBeNull()
      for (const key of collaboration.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
      expect(await organizationExists(scope.organizationId)).toBeNull()
      expect(
        await env.DB.prepare(
          'SELECT actor_name FROM audit_log WHERE organization_id=? AND action=? LIMIT 1',
        )
          .bind(scope.organizationId, 'cleanup.fixture.uploaded')
          .first(),
      ).toMatchObject({ actor_name: 'Personal cleanup actor label' })
      expect(await organizationExists(sharedId)).not.toBeNull()
    },
  )
  it('accepts a legacy mapped sole-owner personal workspace with FK-null provenance', async () => {
    const scope = await personal(),
      successor = await personal()
    await services.db.delete(organization).where(eq(organization.id, successor.organizationId))
    await services.db.delete(member).where(eq(member.organizationId, scope.organizationId))
    await services.db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: scope.organizationId,
      userId: successor.userId,
      role: 'owner',
      createdAt: new Date(),
    })
    await services.db.delete(user).where(eq(user.id, scope.userId))
    await services.db
      .insert(privateWorkspace)
      .values({ userId: successor.userId, organizationId: scope.organizationId })
    expect(
      await env.DB.prepare('SELECT creation_owner_id, creation_kind FROM organization WHERE id=?')
        .bind(scope.organizationId)
        .first(),
    ).toMatchObject({ creation_owner_id: null, creation_kind: 'personal' })
    const saved = await content({ ...successor, organizationId: scope.organizationId })
    await lock(successor.userId)
    await services.uploads.stagePersonalDeletion(successor.userId)
    await assertRemovedMetadata(scope.organizationId)
    expect(await queue(scope.organizationId)).toHaveLength(2)
    expect(
      await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
    ).not.toMatchObject({ revoked_at: null })
  })
  it.each(['shared', 'other-owner', 'collaborative'] as const)(
    'preserves a mapped %s scope and every physical object',
    async (kind) => {
      const scope = await personal(),
        other = await personal()
      let id = scope.organizationId
      if (kind === 'shared') {
        await services.db.insert(organization).values({
          id: other.userId,
          name: 'Shared mapped history',
          slug: other.userId,
          creationOwnerId: other.userId,
          createdAt: new Date(),
        })
        await services.db.insert(member).values({
          id: crypto.randomUUID(),
          organizationId: other.userId,
          userId: scope.userId,
          role: 'owner',
          createdAt: new Date(),
        })
        await services.db
          .update(privateWorkspace)
          .set({ organizationId: other.userId })
          .where(eq(privateWorkspace.userId, scope.userId))
        id = other.userId
      } else {
        if (kind === 'other-owner')
          await services.db.delete(member).where(eq(member.organizationId, id))
        await services.db.insert(member).values({
          id: crypto.randomUUID(),
          organizationId: id,
          userId: other.userId,
          role: 'owner',
          createdAt: new Date(),
        })
      }
      const saved = await content({
        userId: kind === 'other-owner' ? other.userId : scope.userId,
        organizationId: id,
      })
      await lock(scope.userId)
      await services.uploads.stagePersonalDeletion(scope.userId)
      expect(await rows('photo', id)).toHaveLength(1)
      expect(await rows('watermark', id)).toHaveLength(1)
      expect(await queue(id)).toEqual([])
      expect(
        await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
      ).toMatchObject({ revoked_at: null })
      for (const key of saved.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
    },
  )
  it('retains credentials and personal content when claimed personal plan proof is inconsistent', async () => {
    const scope = await personal(true),
      saved = await content(scope)
    await env.DB.prepare("UPDATE workspace_plan SET kind='shared' WHERE organization_id=?")
      .bind(scope.organizationId)
      .run()
    expect(
      await responseJson(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id=?').bind(scope.userId).first(),
    ).toMatchObject({ banned: 0 })
    expect(
      await env.DB.prepare('SELECT id FROM account WHERE user_id=?').bind(scope.userId).first(),
    ).not.toBeNull()
    expect(await rows('photo', scope.organizationId)).toHaveLength(1)
    for (const key of saved.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
    await scope.client.signIn(scope.credentials)
  })
  it('rolls back the whole staging transaction on SQL failure and completes one removal after retry', async () => {
    const scope = await personal(true),
      saved = await content(scope)
    await env.DB.exec(
      `CREATE TRIGGER cleanup_fixture_fail BEFORE DELETE ON photo WHEN OLD.organization_id='${scope.organizationId}' BEGIN SELECT RAISE(ABORT,'named_cleanup_failure'); END`,
    )
    expect(
      await responseJson(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
    expect(await queue(scope.organizationId)).toEqual([])
    expect(await rows('watermark', scope.organizationId)).toHaveLength(1)
    expect(
      await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
    ).toMatchObject({ revoked_at: null })
    await env.DB.exec('DROP TRIGGER cleanup_fixture_fail')
    await scope.client.signIn(scope.credentials)
    expect(
      await responseStatus(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toBe(200)
    expect(await queue(scope.organizationId)).toHaveLength(2)
    await cleanupUploads(services, scope.organizationId)
    for (const key of saved.keys) expect(await env.BUCKET.get(key)).toBeNull()
  })
  it('handles a lost staging acknowledgment without duplicate receipts, preserving credentials until retry', async () => {
    const scope = await personal(true),
      saved = await content(scope)
    const stage = services.uploads.stagePersonalDeletion.bind(services.uploads)
    const spy = vi
      .spyOn(services.uploads, 'stagePersonalDeletion')
      .mockImplementationOnce(async (id) => {
        await stage(id)
        throw new Error('Named lost D1 acknowledgment')
      })
    expect(
      await responseJson(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
    expect(
      await env.DB.prepare('SELECT id FROM account WHERE user_id=?').bind(scope.userId).first(),
    ).not.toBeNull()
    const beforeRows = await queue(scope.organizationId)
    const before = beforeRows
      .map((row) => row.id)
      .toSorted((left, right) => left.localeCompare(right))
    spy.mockRestore()
    await scope.client.signIn(scope.credentials)
    expect(await services.uploads.reserve(saved.logo.reservation)).toBe('deleted')
    expect(
      await responseStatus(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toBe(200)
    const afterRows = await queue(scope.organizationId)
    expect(
      afterRows.map((row) => row.id).toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(before)
    await cleanupUploads(services, scope.organizationId)
    for (const key of saved.keys) expect(await env.BUCKET.get(key)).toBeNull()
  })
  it('stages ten thousand photo rows once without a manual retry loop', async () => {
    const scope = await personal(),
      saved = await content(scope),
      count = 10_000
    await services.db.run(sql`
      WITH RECURSIVE slots(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM slots WHERE i<${count - 1})
            INSERT INTO photo(id,organization_id,name,key,thumbnail_key,content_type,size,thumbnail_size,width,height,created_at)
            SELECT ${scope.organizationId}||'-'||i,${scope.organizationId},'Set-based fixture','org/'||${scope.organizationId}||'/photo/'||i,'org/'||${scope.organizationId}||'/thumb/'||i,'image/png',0,0,1,1,0 FROM slots
    `)
    await lock(scope.userId)
    const batch = vi.spyOn(env.DB, 'batch')
    await services.uploads.stagePersonalDeletion(scope.userId)
    expect(batch).toHaveBeenCalledTimes(1)
    await assertRemovedMetadata(scope.organizationId)
    expect(await queue(scope.organizationId)).toHaveLength(count + 1)
    expect(
      await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
    ).not.toMatchObject({ revoked_at: null })
    // Only three sentinel objects are physical; this is set-based D1 scale proof, not a 10,000-object R2 benchmark.
    for (const key of saved.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
  })
  it('keeps a cleanup reservation if physical deletion or finalizer fails, then drains without credentials', async () => {
    const scope = await personal(),
      saved = await content(scope)
    await lock(scope.userId)
    await services.uploads.stagePersonalDeletion(scope.userId)
    await services.db.delete(user).where(eq(user.id, scope.userId))
    const remove = services.objects.delete.bind(services.objects)
    const fail = vi
      .spyOn(services.objects, 'delete')
      .mockRejectedValueOnce(new Error('Named R2 delete failure'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(vi.fn())
    expect(await cleanupUploads(services, scope.organizationId)).toBe(1)
    expect(await queue(scope.organizationId)).toHaveLength(1)
    fail.mockImplementation(remove)
    await env.DB.exec(
      `CREATE TRIGGER cleanup_finalizer_fail BEFORE DELETE ON organization WHEN OLD.id='${scope.organizationId}' BEGIN SELECT RAISE(ABORT,'named_finalizer_failure'); END`,
    )
    expect(await cleanupUploads(services, scope.organizationId)).toBe(1)
    expect(await queue(scope.organizationId)).toHaveLength(1)
    expect(await organizationExists(scope.organizationId)).not.toBeNull()
    await env.DB.exec('DROP TRIGGER cleanup_finalizer_fail')
    expect(await cleanupUploads(services, scope.organizationId)).toBe(0)
    expect(await organizationExists(scope.organizationId)).toBeNull()
    for (const key of saved.keys) expect(await env.BUCKET.get(key)).toBeNull()
    expect(warning).toHaveBeenCalled()
  })
  it('prevents a paused producer from recreating payload after account removal and final cleanup', async () => {
    const scope = await personal(true),
      item = producer(scope)
    const put = services.objects.put.bind(services.objects)
    const reached = Promise.withResolvers<undefined>(),
      resume = Promise.withResolvers<undefined>()
    vi.spyOn(services.objects, 'put').mockImplementation(async (...args) => {
      reached.resolve(undefined)
      await resume.promise
      await put(...args)
    })
    const result = (async () => {
      try {
        await persistUpload(
          services,
          item.reservation,
          item.record,
          {
            organizationId: scope.organizationId,
            actorUserId: scope.userId,
            action: 'cleanup.fixture.producer',
            targetType: 'asset',
          },
          item.parts,
        )
        return null
      } catch (error) {
        return error
      }
    })()
    await reached.promise
    expect(
      await responseStatus(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toBe(200)
    expect(
      await env.DB.prepare('SELECT id FROM user WHERE id=?').bind(scope.userId).first(),
    ).toBeNull()
    expect(await cleanupUploads(services, scope.organizationId)).toBe(0)
    expect(await organizationExists(scope.organizationId)).toBeNull()
    resume.resolve(undefined)
    expect(await result).toMatchObject({ status: 503 })
    expect(await env.BUCKET.get(item.key)).toBeNull()
    expect(await services.uploads.isLeaseWritable(item.reservation)).toBe(false)
    expect(await services.assets.find(scope.organizationId, item.reservation.uploadId)).toBeNull()
  })
  it('does not undo a live moderation ban when staging persistence fails', async () => {
    const scope = await personal(true)
    vi.spyOn(services.uploads, 'stagePersonalDeletion').mockImplementationOnce(async () => {
      expect(
        await responseStatus(
          manager.post('/api/auth/admin/ban-user', {
            userId: scope.userId,
            banReason: 'Cleanup moderation fixture',
          }),
        ),
      ).toBe(200)
      throw new Error('Named stage failure')
    })
    expect(
      await responseJson(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
    expect(
      await env.DB.prepare('SELECT banned,ban_reason FROM user WHERE id=?')
        .bind(scope.userId)
        .first(),
    ).toMatchObject({ banned: 1, ban_reason: 'Cleanup moderation fixture' })
    expect(
      await env.DB.prepare('SELECT id FROM account WHERE user_id=?').bind(scope.userId).first(),
    ).not.toBeNull()
  })
  it('rejects a non-quiesced caller at the store boundary without revoking a link or queuing objects', async () => {
    const scope = await personal(),
      saved = await content(scope)
    await expect(services.uploads.stagePersonalDeletion(scope.userId)).rejects.toMatchObject({
      status: 403,
    })
    expect(await queue(scope.organizationId)).toEqual([])
    expect(
      await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
    ).toMatchObject({ revoked_at: null })
    for (const key of saved.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
  })
  it('preserves an ambiguous retired workspace while existing pending-upload cleanup still removes its bytes', async () => {
    const scope = await personal(),
      item = producer(scope)
    expect(await services.uploads.reserve(item.reservation)).toBe('reserved')
    const etag = await services.objects.preparePut(item.key)
    await services.objects.put(item.key, PAYLOAD, 'image/png', etag)
    await services.uploads.abandon(item.reservation.id)
    await env.DB.prepare("UPDATE workspace_plan SET kind='shared' WHERE organization_id=?")
      .bind(scope.organizationId)
      .run()
    await services.db.delete(user).where(eq(user.id, scope.userId))
    expect(await cleanupUploads(services, scope.organizationId)).toBe(0)
    expect(await env.BUCKET.get(item.key)).toBeNull()
    expect(await organizationExists(scope.organizationId)).not.toBeNull()
  })
  it('retains credentials and all content for malformed, non-array, empty, non-string or foreign reservation keys', async () => {
    const scope = await personal(true),
      saved = await content(scope),
      other = await personal()
    const foreign = await content(other),
      pending = producer(scope)
    expect(await services.uploads.reserve(pending.reservation)).toBe('reserved')
    for (const keys of ['{', '{}', '[]', '[1]', JSON.stringify([foreign.logo.key])]) {
      await env.DB.prepare('UPDATE upload_reservation SET keys=? WHERE id=?')
        .bind(keys, pending.reservation.id)
        .run()
      expect(
        await responseJson(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
      ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
      expect(
        await env.DB.prepare('SELECT id FROM account WHERE user_id=?').bind(scope.userId).first(),
      ).not.toBeNull()
      expect(
        await env.DB.prepare('SELECT banned FROM user WHERE id=?').bind(scope.userId).first(),
      ).toMatchObject({ banned: 0 })
      expect(await queue(scope.organizationId)).toEqual([])
      expect(await rows('photo', scope.organizationId)).toHaveLength(1)
      expect(await rows('watermark', scope.organizationId)).toHaveLength(1)
      expect(
        await env.DB.prepare('SELECT revoked_at FROM share WHERE id=?').bind(saved.link.id).first(),
      ).toMatchObject({ revoked_at: null })
      for (const key of [...saved.keys, ...foreign.keys])
        expect(await storedBytes(key)).toEqual(PAYLOAD)
      await scope.client.signIn(scope.credentials)
    }
    await env.DB.prepare('UPDATE upload_reservation SET keys=? WHERE id=?')
      .bind(JSON.stringify(pending.reservation.keys), pending.reservation.id)
      .run()
    expect(
      await responseStatus(scope.client.post('/api/auth/delete-user', { password: PASSWORD })),
    ).toBe(200)
    expect(await cleanupUploads(services, scope.organizationId)).toBe(0)
    for (const key of foreign.keys) expect(await storedBytes(key)).toEqual(PAYLOAD)
  })
})
