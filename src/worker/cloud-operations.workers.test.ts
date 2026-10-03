import { env } from 'cloudflare:workers'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createApp } from './index'
import { getServices } from './services'
import { signShareToken } from './share-token'
import { createStripeGateway } from './stripe-gateway'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import {
  installStripeFixture,
  stripeAuthority,
  STRIPE_FIXTURE_CONFIG,
} from './test-support/stripe-fixture'
import { CLOUD_OPERATION_POLICY, type CloudOperationSpend } from '../shared/cloud-operations'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const services = getServices(env)
const app = createApp({ resolveServices: () => services })
const OWNER = {
  name: 'D1 operations owner',
  email: 'd1-operations@example.test',
  password: 'D1 operations fixture password',
}
const monthSql =
  "CAST(strftime('%Y','now') AS INTEGER) * 12 + CAST(strftime('%m','now') AS INTEGER) - 1"
let owner: TestClient
let userId: string
let personal: string
let shared: string
let guards: { name: string; sql: string }[]
beforeAll(async () => {
  if (services.devMailbox === undefined) throw new Error('Console fixture mailbox required.')
  owner = new TestClient(app, env)
  await owner.signUpAndVerify(services.devMailbox, OWNER)
  userId = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await responseJson(owner.get('/api/auth/get-session'))).user.id
  personal = await services.accounts.ensurePrivateWorkspace(userId)
  shared = await owner.createOrganization('Operations shared fixture', 'operations-shared-fixture')
  const guardResult = await env.DB.prepare(
    "SELECT name,sql FROM sqlite_master WHERE name IN ('workspace_operation_site_debit','cloud_operation_site_monotonic')",
  ).all<{ name: string; sql: string }>()
  guards = guardResult.results
  if (guards.length !== 2) throw new Error('Actual budget guards missing.')
})
async function fixtureCounters(
  workspaceMonth: string,
  units: number,
  siteMonth = workspaceMonth,
  siteUnits = units,
) {
  // Only this named corruption/reset fixture suspends guards, then restores exact sqlite_master SQL before behavior assertions.
  for (const guard of guards) await env.DB.prepare(`DROP TRIGGER ${guard.name}`).run()
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE workspace_plan SET operation_month=${workspaceMonth},operation_units=?`,
    ).bind(units),
    env.DB.prepare(`UPDATE cloud_operation_site_budget SET month=${siteMonth},units=?`).bind(
      siteUnits,
    ),
  ])
  for (const guard of guards) await env.DB.prepare(guard.sql).run()
}
beforeEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  services.billing.provider = undefined
  await fixtureCounters('0', 0)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM watermark'),
    env.DB.prepare('DELETE FROM share'),
    env.DB.prepare('DELETE FROM photo'),
    env.DB.prepare("UPDATE user SET banned=0,membership_cohort='private' WHERE id=?").bind(userId),
    env.DB.prepare("UPDATE member SET role='owner' WHERE user_id=?").bind(userId),
    env.DB.prepare(
      "UPDATE workspace_plan SET base_plan='private',paid_plan=NULL,paid_through=NULL,paid_access_suspended=0",
    ),
  ])
})
function member(id = personal, units = 1): Extract<CloudOperationSpend, { kind: 'member' }> {
  return { kind: 'member', organizationId: id, userId, roles: ['owner'], units }
}
async function units(id = personal) {
  return {
    workspace: await env.DB.prepare(
      'SELECT operation_units FROM workspace_plan WHERE organization_id=?',
    )
      .bind(id)
      .first('operation_units'),
    site: await env.DB.prepare('SELECT units FROM cloud_operation_site_budget WHERE id=1').first(
      'units',
    ),
  }
}
async function settled(input: CloudOperationSpend) {
  try {
    await services.plans.spendOperations(input)
    return 'admitted'
  } catch (error) {
    if (error instanceof Error && 'status' in error) return error.status
    throw error
  }
}
async function publicFixture() {
  const photoId = crypto.randomUUID(),
    shareId = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT INTO photo(id,organization_id,name,key,thumbnail_key,thumbnail_size,content_type,size,width,height,created_by,created_at) VALUES(?,?,'Opaque legacy blob','operations/original','operations/thumbnail',1,'image/png',1,1,1,?,1)",
  )
    .bind(photoId, shared, userId)
    .run()
  await env.BUCKET.put('operations/original', new Uint8Array([1]))
  await env.DB.prepare(
    "INSERT INTO share(id,organization_id,title,photo_ids,expires_at,created_by,created_at) VALUES(?,?,'Operations gallery',?,0,?,1)",
  )
    .bind(shareId, shared, JSON.stringify([photoId]), userId)
    .run()
  const token = await signShareToken(services.config.BETTER_AUTH_SECRET, {
    id: shareId,
    expiresAt: 0,
  })
  const caller = new TestClient(app, env)
  return { photoId, shareId, token, caller }
}

describe('actual D1 dual operation authority', () => {
  it('projects the original plan shape and debits both counters from actual API admission', async () => {
    const plan = await services.plans.get(shared)
    expect(Object.keys(plan)).not.toContain('operationUnits')
    expect(await responseStatus(owner.get(`/api/orgs/${shared}/watermarks`))).toBe(200)
    expect(await units(shared)).toEqual({ workspace: 1, site: 1 })
    await expect(
      env.DB.prepare(
        'INSERT OR REPLACE INTO cloud_operation_site_budget(id,month,units) VALUES(1,0,0)',
      ).run(),
    ).rejects.toThrow('cloud_operation_authority_invalid')
    expect(await units(shared)).toEqual({ workspace: 1, site: 1 })
  })
  it('serializes competing last workspace units and does not spend the site on workspace refusal', async () => {
    await fixtureCounters(monthSql, CLOUD_OPERATION_POLICY.limits.private - 1)
    const result = await Promise.all(Array.from({ length: 4 }, () => settled(member())))
    expect(result.filter((value) => value === 'admitted')).toHaveLength(1)
    expect(result.filter((value) => value === 429)).toHaveLength(3)
    expect(await units()).toEqual({
      workspace: CLOUD_OPERATION_POLICY.limits.private,
      site: CLOUD_OPERATION_POLICY.limits.private,
    })
  })
  it('serializes the last site unit across workspaces and rolls back refused workspace debit', async () => {
    await fixtureCounters('0', 0, monthSql, CLOUD_OPERATION_POLICY.limits.site - 1)
    const result = await Promise.all([
      settled(member()),
      settled(member(shared)),
      settled(member()),
    ])
    expect(result.filter((value) => value === 'admitted')).toHaveLength(1)
    expect(result.filter((value) => value === 429)).toHaveLength(2)
    const first = await units(),
      second = await units(shared)
    expect(Number(first.workspace) + Number(second.workspace)).toBe(1)
    expect(first.site).toBe(CLOUD_OPERATION_POLICY.limits.site)
  })
  it('rolls both authorities back on a deliberate trigger constraint after debit', async () => {
    await env.DB.prepare(
      "CREATE TRIGGER named_operation_failure AFTER UPDATE ON cloud_operation_site_budget BEGIN SELECT RAISE(ABORT,'named_operation_fixture_failure'); END",
    ).run()
    await expect(
      env.DB.prepare(
        `UPDATE workspace_plan SET operation_month=${monthSql},operation_units=1 WHERE organization_id=?`,
      )
        .bind(personal)
        .run(),
    ).rejects.toThrow('named_operation_fixture_failure')
    expect(await units()).toEqual({ workspace: 0, site: 0 })
    await env.DB.prepare('DROP TRIGGER named_operation_failure').run()
  })
  it('rolls past months forward once, charges replay, and refuses future stored workspace/site clocks', async () => {
    await fixtureCounters(
      `${monthSql}-1`,
      CLOUD_OPERATION_POLICY.limits.private,
      `${monthSql}-1`,
      CLOUD_OPERATION_POLICY.limits.site,
    )
    await services.plans.spendOperations(member())
    await services.plans.spendOperations(member())
    expect(await units()).toEqual({ workspace: 2, site: 2 })
    await fixtureCounters(`${monthSql}+1`, 2)
    expect(await settled(member())).toBe(503)
    expect(await units()).toEqual({ workspace: 2, site: 2 })
    await fixtureCounters('0', 0, `${monthSql}+1`, 2)
    expect(await settled(member())).toBe(503)
    expect(await units()).toEqual({ workspace: 0, site: 2 })
  })
  it('uses paid expiry at mutation after initial permission, preserves used work and suspends lower allowance', async () => {
    await env.DB.prepare(
      "UPDATE workspace_plan SET base_plan='free',paid_plan='pro',paid_through=?,paid_access_suspended=0 WHERE organization_id=?",
    )
      .bind(Date.now() + 60_000, personal)
      .run()
    await fixtureCounters(monthSql, CLOUD_OPERATION_POLICY.limits.free)
    const spend = services.plans.spendOperations.bind(services.plans)
    const spy = vi.spyOn(services.plans, 'spendOperations').mockImplementation(async (input) => {
      await env.DB.prepare('UPDATE workspace_plan SET paid_through=1 WHERE organization_id=?')
        .bind(personal)
        .run()
      await spend(input)
    })
    expect(await responseStatus(owner.get(`/api/orgs/${personal}/watermarks`))).toBe(429)
    spy.mockRestore()
    expect(await units()).toEqual({
      workspace: CLOUD_OPERATION_POLICY.limits.free,
      site: CLOUD_OPERATION_POLICY.limits.free,
    })
    await env.DB.prepare(
      'UPDATE workspace_plan SET paid_through=?,paid_access_suspended=1 WHERE organization_id=?',
    )
      .bind(Date.now() + 60_000, personal)
      .run()
    expect(await settled(member())).toBe(429)
  })
  it('uses distinct active Pro and Team allowances and refuses their next weighted debit', async () => {
    const through = Date.now() + 60_000
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE workspace_plan SET base_plan='free',paid_plan='pro',paid_through=? WHERE organization_id=?",
      ).bind(through, personal),
      env.DB.prepare(
        "UPDATE workspace_plan SET base_plan='free',paid_plan='team',paid_through=? WHERE organization_id=?",
      ).bind(through, shared),
    ])
    await fixtureCounters(monthSql, CLOUD_OPERATION_POLICY.limits.pro - 1, monthSql, 0)
    expect(await settled(member())).toBe('admitted')
    expect(await settled(member())).toBe(429)
    expect(await units()).toEqual({ workspace: CLOUD_OPERATION_POLICY.limits.pro, site: 1 })
    await fixtureCounters(monthSql, CLOUD_OPERATION_POLICY.limits.team - 1, monthSql, 0)
    expect(await settled(member(shared))).toBe('admitted')
    expect(await settled(member(shared))).toBe(429)
    expect(await units(shared)).toEqual({ workspace: CLOUD_OPERATION_POLICY.limits.team, site: 1 })
  })
  it('does not debit stale roles, removed members or banned actors', async () => {
    const original = await env.DB.prepare(
      'SELECT id,created_at FROM member WHERE organization_id=? AND user_id=?',
    )
      .bind(shared, userId)
      .first<{ id: string; created_at: number }>()
    if (original === null) throw new Error('Named member fixture missing.')
    await env.DB.prepare("UPDATE member SET role='viewer' WHERE organization_id=? AND user_id=?")
      .bind(shared, userId)
      .run()
    expect(await settled(member(shared))).toBe(403)
    await env.DB.prepare('DELETE FROM member WHERE organization_id=? AND user_id=?')
      .bind(shared, userId)
      .run()
    expect(await settled({ ...member(shared), roles: ['viewer'] })).toBe(403)
    await env.DB.prepare(
      "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,'viewer',?)",
    )
      .bind(original.id, shared, userId, original.created_at)
      .run()
    await env.DB.prepare('UPDATE user SET banned=1 WHERE id=?').bind(userId).run()
    expect(await settled({ ...member(shared), kind: 'member', roles: ['viewer'] })).toBe(403)
    expect(await units(shared)).toEqual({ workspace: 0, site: 0 })
  })
  it('debits only a valid anonymous gallery/blob and refuses foreign/revoked share including resolve-to-spend race', async () => {
    const { photoId, shareId, token, caller } = await publicFixture()
    expect(await responseStatus(caller.get(`/api/share/${token}`))).toBe(200)
    expect(await responseStatus(caller.get(`/api/share/${token}/photos/${photoId}/file`))).toBe(200)
    expect(await units(shared)).toEqual({ workspace: 2, site: 2 })
    expect(await responseStatus(caller.get(`/api/share/${token}/photos/foreign/file`))).toBe(404)
    expect(await units(shared)).toEqual({ workspace: 2, site: 2 })
    await env.DB.prepare('UPDATE share SET expires_at=1 WHERE id=?').bind(shareId).run()
    expect(
      await settled({ kind: 'share', organizationId: shared, shareId, expiresAt: 1, units: 1 }),
    ).toBe(404)
    await env.DB.prepare('UPDATE share SET expires_at=0 WHERE id=?').bind(shareId).run()
    const spend = services.plans.spendOperations.bind(services.plans)
    const spy = vi.spyOn(services.plans, 'spendOperations').mockImplementation(async (input) => {
      await env.DB.prepare('UPDATE share SET revoked_at=1 WHERE id=?').bind(shareId).run()
      await spend(input)
    })
    expect(await responseStatus(caller.get(`/api/share/${token}`))).toBe(404)
    spy.mockRestore()
    expect(await units(shared)).toEqual({ workspace: 2, site: 2 })
  })
  it('retains site work across legitimate empty-group deletion and replacement', async () => {
    await services.plans.spendOperations(member(shared, 12))
    expect(
      await responseStatus(owner.post('/api/auth/organization/delete', { organizationId: shared })),
    ).toBe(200)
    shared = await owner.createOrganization(
      'Replacement operations group',
      'replacement-operations-group',
    )
    expect(await units(shared)).toEqual({ workspace: 0, site: 12 })
    await services.plans.spendOperations(member(shared))
    expect(await units(shared)).toEqual({ workspace: 1, site: 13 })
  })
  it('keeps deletion and share revocation under existing roles after both allowances are exhausted', async () => {
    const { shareId } = await publicFixture()
    const created = z.object({ id: z.string() }).parse(
      await responseJson(
        owner.post(`/api/orgs/${shared}/watermarks`, {
          name: 'Existing operations fixture',
          spec: DEFAULT_TEXT_SPEC,
        }),
      ),
    )
    await fixtureCounters(
      monthSql,
      CLOUD_OPERATION_POLICY.limits.private,
      monthSql,
      CLOUD_OPERATION_POLICY.limits.site,
    )
    expect(await responseStatus(owner.get(`/api/orgs/${shared}/watermarks`))).toBe(429)
    expect(
      await responseStatus(owner.post(`/api/orgs/${shared}/shares/${shareId}/revoke`, {})),
    ).toBe(200)
    expect(
      await responseStatus(
        owner.request(`/api/orgs/${shared}/watermarks/${created.id}`, { method: 'DELETE' }),
      ),
    ).toBe(204)
    expect(await units(shared)).toEqual({
      workspace: CLOUD_OPERATION_POLICY.limits.private,
      site: CLOUD_OPERATION_POLICY.limits.site,
    })
  })
})

describe('exhausted allowance preserves account and financial safety', () => {
  it.each(['private', 'public'] as const)(
    'closes provider before %s account removal; rejoin never resets the site budget',
    async (cohort) => {
      if (services.devMailbox === undefined) throw new Error('Named mailbox missing.')
      const identity = {
        name: `Operations ${cohort} payer`,
        email: `operations-${cohort}-payer@example.test`,
        password: OWNER.password,
      }
      const target = new TestClient(app, env)
      await target.signUpAndVerify(services.devMailbox, identity)
      const targetId = z
        .object({ user: z.object({ id: z.string() }) })
        .parse(await responseJson(target.get('/api/auth/get-session'))).user.id
      // Existing admitted cohort is a trusted fixture; this test concerns removal, not signup admission.
      await env.DB.prepare('UPDATE user SET membership_cohort=? WHERE id=?')
        .bind(cohort, targetId)
        .run()
      const organizationId = await services.accounts.ensurePrivateWorkspace(targetId)
      const authority = stripeAuthority({
        id: organizationId,
        organizationId,
        ownerId: targetId,
        requestId: crypto.randomUUID(),
      })
      const prefix = `Operations${cohort}`
      const provider = installStripeFixture(authority, prefix)
      services.billing.provider = {
        config: STRIPE_FIXTURE_CONFIG,
        gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
      }
      expect(
        await responseStatus(
          target.post('/api/me/billing/checkout', { requestId: authority.requestId, plan: 'pro' }),
        ),
      ).toBe(200)
      provider.completeCheckout()
      expect(await responseStatus(target.post('/api/me/billing/reconcile', { plan: 'pro' }))).toBe(
        200,
      )
      await fixtureCounters(
        monthSql,
        CLOUD_OPERATION_POLICY.limits.pro,
        monthSql,
        CLOUD_OPERATION_POLICY.limits.site,
      )
      expect(await responseStatus(target.get(`/api/orgs/${organizationId}/watermarks`))).toBe(429)
      expect(
        await responseStatus(target.post('/api/auth/delete-user', { password: identity.password })),
      ).toBe(200)
      expect(provider.values.get(`/v1/subscriptions/sub_${prefix}Fixture`)).toMatchObject({
        status: 'canceled',
      })
      expect(
        await env.DB.prepare('SELECT id FROM user WHERE id=?').bind(targetId).first(),
      ).toBeNull()
      const closed = await services.billing.store.get(authority.id)
      expect(closed).toMatchObject({
        ownerId: null,
        chargeable: false,
        requestId: authority.requestId,
        customerId: `cus_${prefix}Fixture`,
      })
      vi.unstubAllGlobals()
      services.billing.provider = undefined
      const rejoined = new TestClient(app, env)
      await rejoined.signUpAndVerify(services.devMailbox, identity)
      const nextId = z
        .object({ user: z.object({ id: z.string() }) })
        .parse(await responseJson(rejoined.get('/api/auth/get-session'))).user.id
      expect(nextId).not.toBe(targetId)
      const nextWorkspace = await services.accounts.ensurePrivateWorkspace(nextId)
      expect(await services.billing.store.get(authority.id)).toEqual(closed)
      expect(await units(nextWorkspace)).toEqual({
        workspace: 0,
        site: CLOUD_OPERATION_POLICY.limits.site,
      })
      expect(await responseStatus(rejoined.get(`/api/orgs/${nextWorkspace}/watermarks`))).toBe(429)
      expect(await units(nextWorkspace)).toEqual({
        workspace: 0,
        site: CLOUD_OPERATION_POLICY.limits.site,
      })
    },
  )
})
