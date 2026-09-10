/**
 * Runs inside workerd with real D1. Proves the platform admin overview
 * against the actual grouped query: member counts come from a join and an
 * aggregate, not from a row-limited adapter read (the Node route tests use
 * arrays and would never see a 100-row cap).
 */
import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { member, user } from './db/schema'
import { createApp } from './index'
import { getServices } from './services'
import { adminOrganizationListSchema } from '../shared/api'
import { HTTP_STATUS } from '../shared/constants'
import { joinAsMember, TestClient } from './test-support/client'

const app = createApp()
const owner = {
  name: 'Ada Admin',
  email: 'ada-admin@example.test',
  password: 'a perfectly fine passphrase',
}
const editor = {
  name: 'Edie Editor',
  email: 'edie-admin@example.test',
  password: 'another long passphrase',
}

function harness() {
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) {
    throw new Error('workers tests expect EMAIL_PROVIDER=console')
  }
  return { app, env, mailbox: devMailbox }
}

describe('platform administration over D1', () => {
  let client: TestClient
  let studioId: string
  let soloId: string
  let emptyId: string

  beforeAll(async () => {
    client = new TestClient(app, env)
    await client.signUpAndVerify(harness().mailbox, owner)
    studioId = await client.createOrganization('Admin Studio', 'admin-studio')
    await joinAsMember(harness(), client, studioId, editor, 'editor')
    soloId = await client.createOrganization('Solo Org', 'solo-org')
    // An organization with no members at all only exists through a direct
    // delete; it separates count(member.id) from a bare count() over the join.
    emptyId = await client.createOrganization('Empty Org', 'empty-org')
    const { db } = getServices(env)
    await db.delete(member).where(eq(member.organizationId, emptyId))
  })

  it('promotes through the dev route with a real D1 update, once per existing account', async () => {
    const refused = await client.get('/api/admin/organizations')
    expect(refused.status).toBe(HTTP_STATUS.forbidden)
    const missing = await client.post('/api/dev/promote-site-owner', {
      email: 'nobody@example.test',
    })
    expect(missing.status).toBe(HTTP_STATUS.notFound)
    const promoted = await client.post('/api/dev/promote-site-owner', { email: owner.email })
    expect(promoted.status).toBe(HTTP_STATUS.ok)
    const [row] = await getServices(env)
      .db.select({ role: user.role })
      .from(user)
      .where(eq(user.email, owner.email))
    expect(row?.role).toBe('owner')
  })

  it('counts members per organization with the grouped query', async () => {
    const response = await client.get('/api/admin/organizations')
    expect(response.status).toBe(HTTP_STATUS.ok)
    const { organizations } = adminOrganizationListSchema.parse(await response.json())
    const byId = new Map(organizations.map((entry) => [entry.id, entry]))
    expect(byId.get(studioId)?.memberCount).toBe(2)
    expect(byId.get(soloId)?.memberCount).toBe(1)
    expect(byId.get(emptyId)?.memberCount).toBe(0)
    // Newest first: the solo organization was created last.
    expect(organizations.map((entry) => entry.id).indexOf(soloId)).toBeLessThan(
      organizations.map((entry) => entry.id).indexOf(studioId),
    )
  })
})
