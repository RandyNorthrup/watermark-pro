import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { auditLog, organization, user } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'

const app = createApp()
const services = getServices(env)
const sessionSchema = z.object({ user: z.object({ id: z.string() }) })
const creation = '/api/auth/organization/create'
let actor: TestClient
let actorId: string
beforeEach(async () => {
  const mailbox = services.devMailbox
  if (mailbox === undefined) throw new Error('Creation fixture requires console mailbox')
  actor = new TestClient(app, env)
  await actor.signUpAndVerify(mailbox, {
    name: 'Creation owner',
    email: `${crypto.randomUUID()}@example.test`,
    password: 'a creation guard fixture passphrase',
  })
  actorId = sessionSchema.parse(await responseJson(actor.get('/api/auth/get-session'))).user.id
})
describe('D1 serializes workspace creation against live authority', () => {
  it('prepares a public one-seat personal workspace repeatedly without another insert or grant', async () => {
    await services.db.update(user).set({ membershipCohort: 'public' }).where(eq(user.id, actorId))
    const first = await actor.post('/api/me/workspace', {})
    expect(first.status).toBe(200)
    const initial = await first.json()
    for (const attempt of [0, 1, 2]) {
      const repeated = await actor.post('/api/me/workspace', { attempt })
      expect(repeated.status).toBe(200)
      expect(await repeated.json()).toEqual(initial)
    }
    const personal = await services.db.query.organization.findMany()
    expect(personal.filter((row) => row.creationOwnerId === actorId)).toHaveLength(1)
    const members = await services.db.query.member.findMany()
    expect(members.filter((row) => row.userId === actorId)).toHaveLength(1)
    expect(await services.accounts.canCreateSharedWorkspace(actorId)).toBe(false)
  })
  it('admits one of three concurrent authenticated creates and writes only one success audit', async () => {
    expect(await responseStatus(actor.post('/api/me/workspace', {}))).toBe(200)
    const responses = await Promise.all(
      [0, 1, 2].map((index) =>
        actor.post(creation, { name: 'Shared', slug: `race-${String(index)}` }),
      ),
    )
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect(responses.filter((response) => [403, 409].includes(response.status))).toHaveLength(2)
    const workspaces = await services.db.query.organization.findMany()
    const rows = workspaces.filter((row) => row.creationOwnerId === actorId)
    expect(rows.filter((row) => row.creationKind === 'shared')).toHaveLength(1)
    expect(rows.filter((row) => row.creationKind === 'personal')).toHaveLength(1)
    expect(
      rows.filter((row) => row.creationKind === 'shared').map((row) => row.creationOwnerId),
    ).toEqual([actorId])
    const audit = await services.db.select().from(auditLog)
    expect(
      audit.filter(
        (entry) => entry.action === 'organization.created' && entry.actorUserId === actorId,
      ),
    ).toHaveLength(1)
    expect(await responseStatus(actor.post('/api/me/workspace', {}))).toBe(200)
  })
  it('also fences three direct competing D1 writes, rejecting missing provenance', async () => {
    const results = await Promise.allSettled(
      [0, 1, 2].map((index) =>
        services.db.insert(organization).values({
          id: `direct-${String(index)}`,
          name: 'Direct',
          slug: `direct-${String(index)}`,
          createdAt: new Date(),
          creationOwnerId: actorId,
          creationKind: 'shared',
        }),
      ),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2)
    await expect(
      services.db.insert(organization).values({
        id: 'missing-owner',
        name: 'Missing',
        slug: 'missing-owner',
        createdAt: new Date(),
      }),
    ).rejects.toThrow()
    expect(await services.accounts.canCreateSharedWorkspace(actorId)).toBe(false)
    const workspaces = await services.db.query.organization.findMany()
    expect(workspaces.filter((row) => row.creationOwnerId === actorId)).toHaveLength(1)
  })
  it('rechecks admission after the precheck, returning a neutral denial and allowing a genuine retry', async () => {
    const check = services.accounts.canCreateSharedWorkspace.bind(services.accounts)
    const precheck = vi
      .spyOn(services.accounts, 'canCreateSharedWorkspace')
      .mockImplementationOnce(async (id) => {
        expect(await check(id)).toBe(true)
        await services.db.update(user).set({ banned: true }).where(eq(user.id, id))
        return true
      })
    try {
      const denied = await actor.post(creation, { name: 'Race', slug: 'race-proof' })
      expect(denied.status).toBe(409)
      expect(await denied.json()).toEqual({ error: 'conflict' })
      const workspaces = await services.db.query.organization.findMany()
      expect(workspaces.filter((row) => row.creationOwnerId === actorId)).toHaveLength(0)
      const audits = await services.db.select().from(auditLog)
      expect(
        audits.filter(
          (entry) => entry.action === 'organization.created' && entry.actorUserId === actorId,
        ),
      ).toHaveLength(0)
    } finally {
      precheck.mockRestore()
    }
    await services.db.update(user).set({ banned: false }).where(eq(user.id, actorId))
    expect(await responseStatus(actor.post(creation, { name: 'Race', slug: 'race-proof' }))).toBe(
      200,
    )
  })
})
