import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiErrors } from './errors'
import { signShareToken } from './share-token'
import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { CLOUD_OPERATION_POLICY } from '../shared/cloud-operations'
import { folderWriteResultSchema } from '../shared/folders'
import { SYNC_OPERATION_HEADER } from '../shared/sync'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'
import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import { createTestHarness } from './test-support/test-app'

const OWNER = {
  name: 'Operations owner',
  email: 'ops-owner@example.test',
  password: 'operations owner fixture password',
}
const GUEST = {
  name: 'Operations guest',
  email: 'ops-guest@example.test',
  password: 'operations guest fixture password',
}
const personSchema = z.object({ user: z.object({ id: z.string() }) })
async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Operations studio',
    slug: 'operations-studio',
  })
  const spend = vi.spyOn(harness.services.plans, 'spendOperations')
  return { harness, owner, organizationId, spend }
}
describe('real-auth ordinary operation admission', () => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'retains cleanup permission after exhaustion for %s',
    async (role) => {
      const { harness, owner, organizationId, spend } = await fixture()
      const created = z.object({ id: z.string() }).parse(
        await responseJson(
          owner.post(`/api/orgs/${organizationId}/watermarks`, {
            name: 'Cleanup fixture',
            spec: DEFAULT_TEXT_SPEC,
          }),
        ),
      )
      let actor = owner
      if (role === 'anonymous' || role === 'non-member') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, GUEST)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, GUEST, role)
      spend.mockClear()
      spend.mockRejectedValue(apiErrors.rateLimited(1))
      const canDelete = ['owner', 'admin', 'editor'].includes(role)
      const denied = role === 'anonymous' ? 401 : 403
      expect(
        await responseStatus(
          actor.request(`/api/orgs/${organizationId}/watermarks/${created.id}`, {
            method: 'DELETE',
          }),
        ),
      ).toBe(canDelete ? 204 : denied)
      expect(spend).not.toHaveBeenCalled()
      expect(await harness.services.watermarks.countForOrganization(organizationId)).toBe(
        canDelete ? 0 : 1,
      )
    },
  )
  it('charges admitted upload failures and bounded bulk replays at their request weights', async () => {
    const { harness, owner, organizationId, spend } = await fixture()
    const body = new FormData()
    expect(
      await responseStatus(
        owner.request(`/api/orgs/${organizationId}/photos`, {
          method: 'POST',
          body,
        }),
      ),
    ).toBe(400)
    expect(spend).toHaveBeenLastCalledWith(
      expect.objectContaining({ units: CLOUD_OPERATION_POLICY.weights.upload }),
    )
    const person = personSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const preset = await harness.services.watermarks.create({
      id: crypto.randomUUID(),
      organizationId,
      name: 'Bulk fixture',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: person.user.id,
    })
    const operationId = crypto.randomUUID()
    const move = () =>
      owner.request(`/api/orgs/${organizationId}/folders/move-content`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_ID_HEADER]: person.user.id,
          [SYNC_OPERATION_HEADER]: operationId,
        },
        body: JSON.stringify({
          kind: 'preset',
          folderId: null,
          items: [{ id: preset.id, expectedFolderRevision: 0 }],
        }),
      })
    spend.mockClear()
    const firstResponse = await move(),
      secondResponse = await move()
    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    const first = folderWriteResultSchema.parse(await firstResponse.json()),
      second = folderWriteResultSchema.parse(await secondResponse.json())
    expect(second).toEqual(first)
    expect(first.moved).toEqual([expect.objectContaining({ id: preset.id, folderRevision: 1 })])
    expect(spend).toHaveBeenCalledTimes(2)
    expect(spend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        units: CLOUD_OPERATION_POLICY.weights.read + CLOUD_OPERATION_POLICY.weights.write,
      }),
    )
  })
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'charges authorized work only for %s',
    async (role) => {
      const { harness, owner, organizationId, spend } = await fixture()
      let actor = owner
      if (role === 'non-member' || role === 'anonymous') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, GUEST)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, GUEST, role)
      const canRead = !['anonymous', 'non-member'].includes(role)
      const canWrite = ['owner', 'admin', 'editor'].includes(role)
      const refused = role === 'anonymous' ? 401 : 403
      expect(await responseStatus(actor.get(`/api/orgs/${organizationId}/watermarks`))).toBe(
        canRead ? 200 : refused,
      )
      expect(
        await responseStatus(
          actor.post(`/api/orgs/${organizationId}/watermarks`, {
            name: 'Metered preset',
            spec: DEFAULT_TEXT_SPEC,
          }),
        ),
      ).toBe(canWrite ? 201 : refused)
      expect(spend).toHaveBeenCalledTimes(Number(canRead) + Number(canWrite))
      if (canRead) {
        const person = personSchema.parse(await responseJson(actor.get('/api/auth/get-session')))
        expect(spend).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'member',
            organizationId,
            userId: person.user.id,
            units: CLOUD_OPERATION_POLICY.weights.read,
          }),
        )
      }
      spend.mockClear()
      expect(await responseStatus(actor.get('/api/orgs/foreign-workspace/watermarks'))).toBe(
        refused,
      )
      expect(spend).not.toHaveBeenCalled()
    },
  )
  it('refuses ordinary work before persistence but allows authorized deletion after exhausted allowance', async () => {
    const { harness, owner, organizationId, spend } = await fixture()
    const created = z.object({ id: z.string() }).parse(
      await responseJson(
        owner.post(`/api/orgs/${organizationId}/watermarks`, {
          name: 'Existing',
          spec: DEFAULT_TEXT_SPEC,
        }),
      ),
    )
    spend.mockRejectedValue(apiErrors.rateLimited(1))
    expect(await responseStatus(owner.get(`/api/orgs/${organizationId}/watermarks`))).toBe(429)
    expect(
      await responseStatus(
        owner.post(`/api/orgs/${organizationId}/watermarks`, {
          name: 'Refused',
          spec: DEFAULT_TEXT_SPEC,
        }),
      ),
    ).toBe(429)
    expect(await harness.services.watermarks.countForOrganization(organizationId)).toBe(1)
    spend.mockClear()
    expect(
      await responseStatus(
        owner.request(`/api/orgs/${organizationId}/watermarks/${created.id}`, { method: 'DELETE' }),
      ),
    ).toBe(204)
    expect(spend).not.toHaveBeenCalled()
    expect(await harness.services.watermarks.countForOrganization(organizationId)).toBe(0)
  })
  it('debits a valid anonymous share but never invalid, expired or revoked share authority', async () => {
    const { harness, owner, organizationId, spend } = await fixture()
    const session = personSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const share = await harness.services.shares.create({
      id: crypto.randomUUID(),
      organizationId,
      title: 'Metered public gallery',
      photoIds: [],
      createdBy: session.user.id,
      expiresAt: 0,
    })
    const token = await signShareToken(harness.services.config.BETTER_AUTH_SECRET, {
      id: share.id,
      expiresAt: 0,
    })
    const publicClient = new TestClient(harness.app, harness.env)
    expect(await responseStatus(publicClient.get(`/api/share/${token}`))).toBe(200)
    expect(spend).toHaveBeenCalledWith({
      kind: 'share',
      organizationId,
      shareId: share.id,
      expiresAt: 0,
      units: CLOUD_OPERATION_POLICY.weights.read,
    })
    spend.mockClear()
    expect(await responseStatus(publicClient.get('/api/share/not-a-token'))).toBe(404)
    const expired = await signShareToken(harness.services.config.BETTER_AUTH_SECRET, {
      id: share.id,
      expiresAt: 1,
    })
    expect(await responseStatus(publicClient.get(`/api/share/${expired}`))).toBe(404)
    expect(
      await responseStatus(publicClient.get(`/api/share/${token}/photos/foreign-photo/file`)),
    ).toBe(404)
    await harness.services.shares.revoke(organizationId, share.id)
    expect(await responseStatus(publicClient.get(`/api/share/${token}`))).toBe(404)
    expect(spend).not.toHaveBeenCalled()
  })
})
