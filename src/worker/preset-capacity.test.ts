import { describe, expect, it } from 'vitest'

import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import { createTestHarness } from './test-support/test-app'
import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { API_ERROR_CODE } from '../shared/constants'
import { PUBLIC_PLANS } from '../shared/plans'
import { shellSessionSchema } from '../shared/shell-cache'
import { SYNC_OPERATION_HEADER } from '../shared/sync'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const OWNER = {
  name: 'Preset Limit Owner',
  email: 'preset-limit-owner@example.test',
  password: 'preset limit owner fixture password',
}
const MEMBER = {
  name: 'Preset Limit Member',
  email: 'preset-limit-member@example.test',
  password: 'preset limit member fixture password',
}

async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Preset Limits',
    slug: 'preset-limits',
  })
  return { harness, owner, organizationId, path: `/api/orgs/${organizationId}/watermarks` }
}

describe('saved preset capacity through real authentication', () => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'enforces role and live quota for %s without writing a denied preset or audit',
    async (role) => {
      const { harness, owner, organizationId, path } = await fixture()
      let actor = owner
      if (role === 'non-member' || role === 'anonymous') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, MEMBER)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, MEMBER, role)
      const record = await harness.plans.get(organizationId)
      harness.plans.seed({ ...record, basePlan: 'free' })
      for (let index = 0; index < PUBLIC_PLANS.free.presets - 1; index += 1)
        await harness.services.watermarks.create({
          id: `retained-${String(index)}`,
          organizationId,
          name: `Retained ${String(index)}`,
          spec: DEFAULT_TEXT_SPEC,
          createdBy: null,
        })
      const canWrite = ['owner', 'admin', 'editor'].includes(role)
      const first = await actor.post(path, {
        name: 'Last available preset',
        spec: DEFAULT_TEXT_SPEC,
      })
      const deniedStatus = role === 'anonymous' ? 401 : 403
      expect(first.status).toBe(canWrite ? 201 : deniedStatus)
      const second = await actor.post(path, { name: 'Beyond allowance', spec: DEFAULT_TEXT_SPEC })
      expect(second.status).toBe(canWrite ? 400 : deniedStatus)
      if (canWrite) expect(await second.json()).toEqual({ error: API_ERROR_CODE.quotaExceeded })
      expect(await harness.services.watermarks.countForOrganization(organizationId)).toBe(
        PUBLIC_PLANS.free.presets - (canWrite ? 0 : 1),
      )
      const audit = await harness.audit.listForOrganization(organizationId)
      expect(audit.filter((entry) => entry.action === 'watermark.created')).toHaveLength(
        canWrite ? 1 : 0,
      )
    },
  )

  it('acknowledges exact offline retry at capacity while refusing changed-content reuse', async () => {
    const { harness, owner, organizationId, path } = await fixture()
    const record = await harness.plans.get(organizationId)
    harness.plans.seed({ ...record, basePlan: 'free' })
    const session = shellSessionSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const operationId = crypto.randomUUID()
    const save = (name: string) =>
      owner.request(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_ID_HEADER]: session.user.id,
          [SYNC_OPERATION_HEADER]: operationId,
        },
        body: JSON.stringify({ name, spec: DEFAULT_TEXT_SPEC }),
      })
    expect(await responseStatus(save('Offline original'))).toBe(201)
    for (let index = 1; index < PUBLIC_PLANS.free.presets; index += 1)
      await harness.services.watermarks.create({
        id: `other-${String(index)}`,
        organizationId,
        name: `Other ${String(index)}`,
        spec: DEFAULT_TEXT_SPEC,
        createdBy: null,
      })
    expect(await responseStatus(save('Offline original'))).toBe(200)
    expect(await responseStatus(save('Changed retry'))).toBe(409)
    expect(await harness.services.watermarks.countForOrganization(organizationId)).toBe(20)
    const audit = await harness.audit.listForOrganization(organizationId)
    expect(audit.filter((entry) => entry.action === 'watermark.created')).toHaveLength(1)
  })
})
