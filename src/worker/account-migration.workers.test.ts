import { env } from 'cloudflare:workers'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getServices } from './services'
import { privateWorkspaceSplit } from '../../scripts/private-workspace-sql'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const LEGACY_ORGANIZATION = 'fixture-legacy-workspace'
const FIRST = 'fixture-private-account-a'
const SECOND = 'fixture-private-account-b'

function migrationStatements(): D1PreparedStatement[] {
  return privateWorkspaceSplit({ workspaceId: LEGACY_ORGANIZATION, expectedMembers: 2 }).map(
    (query) => env.DB.prepare(query),
  )
}

beforeEach(async () => {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).bind(FIRST, 'Fixture A', 'fixture-a@example.test', 1, now, now),
    env.DB.prepare(
      'INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).bind(SECOND, 'Fixture B', 'fixture-b@example.test', 0, now, now),
    env.DB.prepare('INSERT INTO organization (id,name,slug,created_at) VALUES (?,?,?,?)').bind(
      LEGACY_ORGANIZATION,
      'Legacy fixture',
      'legacy-fixture',
      now,
    ),
    env.DB.prepare(
      'INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)',
    ).bind('legacy-member-a', LEGACY_ORGANIZATION, FIRST, 'owner', now),
    env.DB.prepare(
      'INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)',
    ).bind('legacy-member-b', LEGACY_ORGANIZATION, SECOND, 'admin', now),
  ])
})
afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM watermark WHERE id = ? AND organization_id = ?').bind(
      'cutover-canary',
      LEGACY_ORGANIZATION,
    ),
    env.DB.prepare('DELETE FROM organization WHERE id IN (?,?,?)').bind(
      LEGACY_ORGANIZATION,
      `personal-${FIRST}`,
      `personal-${SECOND}`,
    ),
    env.DB.prepare('DELETE FROM user WHERE id IN (?,?)').bind(FIRST, SECOND),
  ])
})

describe('initial account isolation migration', () => {
  it('preserves account identity and verification while replacing only the empty shared workspace', async () => {
    await env.DB.batch(migrationStatements())
    const services = getServices(env)
    const users = await services.db.query.user.findMany()
    expect(
      users
        .map((user) => ({ id: user.id, verified: user.emailVerified }))
        .toSorted((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      { id: FIRST, verified: true },
      { id: SECOND, verified: false },
    ])
    const memberships = await services.db.query.member.findMany()
    expect(
      memberships
        .map((member) => ({ userId: member.userId, org: member.organizationId, role: member.role }))
        .toSorted((a, b) => a.userId.localeCompare(b.userId)),
    ).toEqual([
      { userId: FIRST, org: `personal-${FIRST}`, role: 'owner' },
      { userId: SECOND, org: `personal-${SECOND}`, role: 'owner' },
    ])
    expect(await services.db.query.privateWorkspace.findMany()).toHaveLength(2)
    // Repeating an operator action refuses an absent target without touching the completed split.
    await expect(env.DB.batch(migrationStatements())).rejects.toThrow(/CHECK constraint failed/)
    expect(await services.db.query.member.findMany()).toHaveLength(2)
  })
  it('fails and rolls back if content has appeared, preserving the shared workspace and its data', async () => {
    const services = getServices(env)
    await services.watermarks.create({
      id: 'cutover-canary',
      organizationId: LEGACY_ORGANIZATION,
      name: 'Do not lose this preset',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: FIRST,
    })
    await expect(env.DB.batch(migrationStatements())).rejects.toThrow(/CHECK constraint failed/)
    expect(await services.db.query.privateWorkspace.findMany()).toHaveLength(0)
    expect(await services.db.query.member.findMany()).toHaveLength(2)
    expect(await services.watermarks.find(LEGACY_ORGANIZATION, 'cutover-canary')).toMatchObject({
      name: 'Do not lose this preset',
    })
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE name = '_private_workspace_cutover_guard'",
    ).all()
    expect(tables.results).toEqual([])
  })
})
