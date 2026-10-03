import { env } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import { TestClient } from './test-support/client'
import { responseStatus } from './test-support/response'
import { watermarkDtoSchema } from '../shared/api-watermark'
import { PUBLIC_PLANS } from '../shared/plans'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

async function fixture() {
  const app = createApp()
  const client = new TestClient(app, env)
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) throw new Error('Preset fixture requires the test mailbox')
  const identity = crypto.randomUUID()
  await client.signUpAndVerify(devMailbox, {
    name: 'Preset Capacity Owner',
    email: `${identity}@example.test`,
    password: 'preset capacity integration fixture password',
  })
  const organizationId = await client.createOrganization('Preset Capacity', `preset-${identity}`)
  await env.DB.prepare("UPDATE workspace_plan SET base_plan = 'free' WHERE organization_id = ?")
    .bind(organizationId)
    .run()
  return { client, organizationId, path: `/api/orgs/${organizationId}/watermarks` }
}

async function seed(organizationId: string, count: number) {
  await env.DB.batch(
    Array.from({ length: count }, (_, index) =>
      env.DB.prepare(
        'INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      ).bind(
        `${organizationId}-${String(index)}`,
        organizationId,
        `Retained ${String(index)}`,
        JSON.stringify(DEFAULT_TEXT_SPEC),
        1,
        1,
      ),
    ),
  )
}

describe('actual D1 saved-preset capacity', () => {
  it('admits one competing last-slot write and rolls back the denied audit', async () => {
    const { client, organizationId, path } = await fixture()
    await seed(organizationId, PUBLIC_PLANS.free.presets - 1)
    const responses = await Promise.all(
      ['First contender', 'Second contender'].map(
        async (name) => await client.post(path, { name, spec: DEFAULT_TEXT_SPEC }),
      ),
    )
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1)
    expect(
      responses.filter((response) => response.status === 400 || response.status === 409),
    ).toHaveLength(1)
    expect(await getServices(env).watermarks.countForOrganization(organizationId)).toBe(20)
    const audit = await getServices(env).audit.listForOrganization(organizationId)
    expect(audit.filter((entry) => entry.action === 'watermark.created')).toHaveLength(1)
    await expect(seed(organizationId, 1)).rejects.toThrow('workspace_preset_quota')
  })

  it('retains paid presets on expiry and suspension while refusing additions', async () => {
    const { client, organizationId, path } = await fixture()
    await env.DB.prepare(
      "UPDATE workspace_plan SET paid_plan = 'team', paid_through = ?, paid_access_suspended = 0 WHERE organization_id = ?",
    )
      .bind(Date.now() + 60_000, organizationId)
      .run()
    await seed(organizationId, PUBLIC_PLANS.free.presets + 1)
    const existing = await client.get(path)
    expect(existing.status).toBe(200)
    const paid = await client.post(path, { name: 'Paid extra', spec: DEFAULT_TEXT_SPEC })
    expect(paid.status).toBe(201)
    const preset = watermarkDtoSchema.parse(await paid.json())
    for (const state of ['expired', 'suspended'] as const) {
      await env.DB.prepare(
        'UPDATE workspace_plan SET paid_through = ?, paid_access_suspended = ? WHERE organization_id = ?',
      )
        .bind(
          state === 'expired' ? 1 : Date.now() + 60_000,
          state === 'suspended' ? 1 : 0,
          organizationId,
        )
        .run()
      expect(
        await responseStatus(client.post(path, { name: 'Denied extra', spec: DEFAULT_TEXT_SPEC })),
      ).toBe(400)
      expect(await responseStatus(client.get(path))).toBe(200)
      const updatedBody = JSON.stringify({ name: `Retained ${state}`, spec: DEFAULT_TEXT_SPEC })
      expect(
        await responseStatus(
          client.request(`${path}/${preset.id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: updatedBody,
          }),
        ),
      ).toBe(200)
    }
    expect(await responseStatus(client.request(`${path}/${preset.id}`, { method: 'DELETE' }))).toBe(
      204,
    )
    expect(await getServices(env).watermarks.countForOrganization(organizationId)).toBe(21)
  })
})
