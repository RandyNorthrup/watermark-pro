import { env } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import { watermarkDtoSchema } from '../shared/api-watermark'
import { recentWorkResponseSchema } from '../shared/recent-work'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

describe('recent activity over real D1', () => {
  it('applies migration0011 and keeps account history, upserts, and preferences independent', async () => {
    const app = createApp()
    const services = getServices(env)
    const mailbox = services.devMailbox
    if (mailbox === undefined) throw new Error('Test mailbox required')
    const client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox, {
      name: 'D1 Recent',
      email: 'recent-d1@example.test',
      password: 'correct horse battery',
    })
    const organizationId = await client.createOrganization('D1 Recents', 'd1-recents')
    const created = await client.post(`/api/orgs/${organizationId}/watermarks`, {
      name: 'Real saved preset',
      spec: DEFAULT_TEXT_SPEC,
    })
    const preset = watermarkDtoSchema.parse(await created.json())
    const endpoint = `/api/orgs/${organizationId}/recent-work`
    const recent = { kind: 'preset', resourceId: preset.id, usedAt: '2026-02-01T00:00:00.000Z' }
    expect(await responseStatus(client.post(endpoint, recent))).toBe(204)
    expect(
      await responseStatus(
        client.post(endpoint, { ...recent, usedAt: '2026-01-01T00:00:00.000Z' }),
      ),
    ).toBe(204)
    const response = recentWorkResponseSchema.parse(await responseJson(client.get(endpoint)))
    expect(response.items).toHaveLength(1)
    expect(response.items[0]?.usedAt).toBe(recent.usedAt)
    expect(await services.db.query.recentActivity.findMany()).toHaveLength(1)
    const preferenceResponse = await client.request('/api/me/recent-view', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view: 'list' }),
    })
    expect(preferenceResponse.status).toBe(200)
    expect(await responseJson(client.get('/api/me/recent-view'))).toEqual({ view: 'list' })
    const other = new TestClient(app, env)
    await other.signUpAndVerify(mailbox, {
      name: 'Other D1',
      email: 'other-recent-d1@example.test',
      password: 'correct horse battery',
    })
    expect(await responseJson(other.get('/api/me/recent-view'))).toEqual({ view: 'thumbnails' })
    expect(await responseStatus(other.get(endpoint))).toBe(403)
  })
})
