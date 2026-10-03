import { describe, expect, it } from 'vitest'

import { PRIVATE_PLAN_CAPACITY, PUBLIC_PLANS, workspaceCapacitySchema } from '../../shared/plans'
import { joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Capacity Owner',
  email: 'capacity-owner@example.test',
  password: 'capacity owner fixture passphrase',
}
const OTHER = {
  name: 'Capacity Member',
  email: 'capacity-member@example.test',
  password: 'capacity member fixture passphrase',
}

async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Capacity',
    slug: 'capacity',
  })
  return { harness, owner, organizationId, path: `/api/orgs/${organizationId}/capacity` }
}

describe('member-visible authoritative workspace capacity', () => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'allows only actual workspace members to read capacity as %s',
    async (role) => {
      const { harness, owner, organizationId, path } = await fixture()
      let actor = owner
      if (role === 'non-member' || role === 'anonymous') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, OTHER)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, OTHER, role)
      const isReadable = !['non-member', 'anonymous'].includes(role)
      const response = await actor.get(path)
      const deniedStatus = role === 'anonymous' ? 401 : 403
      expect(response.status).toBe(isReadable ? 200 : deniedStatus)
      if (isReadable)
        expect(workspaceCapacitySchema.parse(await response.json())).toEqual({
          storageBytes: PRIVATE_PLAN_CAPACITY.storageBytes,
          photos: PRIVATE_PLAN_CAPACITY.photos,
          logos: PRIVATE_PLAN_CAPACITY.logos,
          presets: PRIVATE_PLAN_CAPACITY.presets,
          members: PRIVATE_PLAN_CAPACITY.sharedMembers,
        })
      expect(
        await responseStatus(actor.get('/api/orgs/unrelated-private-workspace/capacity')),
      ).toBe(role === 'anonymous' ? 401 : 403)
      expect(
        await responseStatus(
          actor.post(path, { paidPlan: 'team', storageBytes: PUBLIC_PLANS.team.storageBytes }),
        ),
      ).toBe(404)
    },
  )
  it('projects limits without disclosing subscription or private admission authority', async () => {
    const { harness, owner, organizationId, path } = await fixture()
    const record = await harness.plans.get(organizationId)
    harness.plans.seed({ ...record, paidPlan: 'team', paidThrough: new Date(Date.UTC(2030, 0, 1)) })
    expect(await responseJson(owner.get(path))).toEqual({
      storageBytes: PUBLIC_PLANS.team.storageBytes,
      photos: PUBLIC_PLANS.team.photos,
      logos: PUBLIC_PLANS.team.logos,
      presets: PUBLIC_PLANS.team.presets,
      members: PUBLIC_PLANS.team.members,
    })
    harness.plans.seed({ ...record, basePlan: 'free', baseMemberLimit: 1 })
    expect(await responseJson(owner.get(path))).toEqual({
      storageBytes: PUBLIC_PLANS.free.storageBytes,
      photos: PUBLIC_PLANS.free.photos,
      logos: PUBLIC_PLANS.free.logos,
      presets: PUBLIC_PLANS.free.presets,
      members: PUBLIC_PLANS.free.members,
    })
    const usage = await responseJson(owner.get(`/api/orgs/${organizationId}/photos/usage`))
    expect(usage).toEqual({
      count: 0,
      bytes: 0,
      maxCount: PUBLIC_PLANS.free.photos,
      maxBytes: PUBLIC_PLANS.free.storageBytes,
    })
  })
  it('does not grant paid limits from writable organization metadata', async () => {
    const { harness, owner, organizationId, path } = await fixture()
    const record = await harness.plans.get(organizationId)
    harness.plans.seed({ ...record, basePlan: 'free', baseMemberLimit: 1 })
    const update = await owner.post('/api/auth/organization/update', {
      organizationId,
      data: { metadata: { paidPlan: 'team', paidThrough: '2030-01-01', private: true } },
    })
    expect(update.status).toBe(200)
    const capacity = workspaceCapacitySchema.parse(await responseJson(owner.get(path)))
    expect(capacity.storageBytes).toBe(PUBLIC_PLANS.free.storageBytes)
    expect(await harness.plans.get(organizationId)).toMatchObject({
      basePlan: 'free',
      paidPlan: null,
    })
  })
})
