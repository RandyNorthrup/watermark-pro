import { env } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { createDrizzleGuidanceStore } from './db/guidance-store'
import { createApp } from './index'
import { getServices } from './services'
import { TestClient } from './test-support/client'
import { responseJson } from './test-support/response'

describe('guidance migration and atomic real D1 claims', () => {
  it('persists a single claim through new service instances, keeps accounts separate, and cascades deleted accounts', async () => {
    const services = getServices(env)
    const mailbox = services.devMailbox
    if (mailbox === undefined) throw new Error('Test mailbox required')
    const app = createApp()
    const client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox, {
      name: 'D1 Guidance',
      email: 'guide-d1@example.test',
      password: 'correct horse battery',
    })
    const endpoint = '/api/me/guidance/claim'
    const first = await Promise.all([
      responseJson(client.post(endpoint, { topic: 'tour' })),
      responseJson(client.post(endpoint, { topic: 'tour' })),
    ])
    expect(first).toEqual(expect.arrayContaining([{ claimed: true }, { claimed: false }]))
    const claims = await services.db.query.guidanceClaim.findMany()
    expect(claims).toHaveLength(1)
    const userId = claims[0]?.userId
    if (userId === undefined) throw new Error('Expected the claimed account')
    expect(await createDrizzleGuidanceStore(services.db).claim(userId, 'tour')).toBe(false)
    const other = new TestClient(app, env)
    await other.signUpAndVerify(mailbox, {
      name: 'Other Guide',
      email: 'other-guide-d1@example.test',
      password: 'correct horse battery',
    })
    expect(await responseJson(other.post(endpoint, { topic: 'tour' }))).toEqual({ claimed: true })
    expect(await services.db.query.guidanceClaim.findMany()).toHaveLength(2)
    await env.DB.prepare('DELETE FROM user WHERE id = ?').bind(userId).run()
    const remaining = await services.db.query.guidanceClaim.findMany()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.userId).not.toBe(userId)
  })
})
