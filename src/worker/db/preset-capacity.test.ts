import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { URL as FileUrl } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const directory = new FileUrl('../../../migrations/', import.meta.url)
const migrationName = '0025_workspace_preset_capacity.sql'
const migration = readFileSync(new FileUrl(migrationName, directory), 'utf8')
const databases: DatabaseSync[] = []
const future = Date.UTC(2030, 0, 1)

function fixture({
  base = 'free',
  paid = null,
}: {
  base?: 'free' | 'private'
  paid?: 'pro' | 'team' | null
} = {}) {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  const prerequisites = readdirSync(directory)
    .filter((name) => /^\d+.*\.sql$/.test(name) && name < migrationName)
    .toSorted((left, right) => left.localeCompare(right))
  for (const name of prerequisites) db.exec(readFileSync(new FileUrl(name, directory), 'utf8'))
  db.prepare(
    "INSERT INTO user(id,name,email,email_verified,membership_cohort,banned,created_at,updated_at) VALUES('fixture','Fixture','fixture@example.test',1,'private',0,1,1)",
  ).run()
  const id = paid === 'team' ? 'shared-fixture' : 'personal-fixture'
  db.prepare(
    'INSERT INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES(?,?,?,1,?,?)',
  ).run(id, id, id, 'fixture', paid === 'team' ? 'shared' : 'personal')
  db.prepare(
    'UPDATE workspace_plan SET kind = ?, base_plan = ?, base_member_limit = 1, paid_plan = ?, paid_through = ? WHERE organization_id = ?',
  ).run(paid === 'team' ? 'shared' : 'personal', base, paid, paid === null ? null : future, id)
  const insert = db.prepare(
    "INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES(?,?,?,'{}',1,1)",
  )
  const create = (index: number) =>
    insert.run(`${id}-${String(index)}`, id, `Preset ${String(index)}`)
  return { db, id, create }
}

afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})

describe('actual saved-preset migration bounds', () => {
  it.each([
    { base: 'free' as const, paid: null, limit: 20 },
    { base: 'private' as const, paid: null, limit: 1000 },
    { base: 'free' as const, paid: 'pro' as const, limit: 1000 },
    { base: 'free' as const, paid: 'team' as const, limit: 2000 },
  ])('enforces $base/$paid exact $limit limit inside INSERT', (configuration) => {
    const { db, create } = fixture(configuration)
    db.exec(migration)
    for (let index = 0; index < configuration.limit; index += 1) create(index)
    expect(() => create(configuration.limit)).toThrow('workspace_preset_quota')
    expect(db.prepare('SELECT COUNT(*) AS total FROM watermark').get()?.['total']).toBe(
      configuration.limit,
    )
  })

  it('keeps historical over-limit rows and permits edit/delete after downgrade', () => {
    const { db, create } = fixture()
    for (let index = 0; index <= 20; index += 1) create(index)
    const retained = db.prepare('SELECT * FROM watermark ORDER BY id').all()
    db.exec(migration)
    expect(db.prepare('SELECT * FROM watermark ORDER BY id').all()).toEqual(retained)
    expect(() => create(21)).toThrow('workspace_preset_quota')
    db.exec("UPDATE watermark SET name = 'Edited retained' WHERE id = 'personal-fixture-0'")
    db.exec("DELETE FROM watermark WHERE id IN ('personal-fixture-0','personal-fixture-1')")
    create(21)
    expect(() => create(22)).toThrow('workspace_preset_quota')
  })

  it('rejects moving a preset into a full workspace and missing plan authority', () => {
    const { db, id, create } = fixture()
    db.exec(migration)
    for (let index = 0; index < 20; index += 1) create(index)
    db.prepare(
      "INSERT INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES('other','Other','other',1,'fixture','shared')",
    ).run()
    db.exec(
      "INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES('moving','other','Moving','{}',1,1)",
    )
    expect(() =>
      db.prepare("UPDATE watermark SET organization_id = ? WHERE id = 'moving'").run(id),
    ).toThrow('workspace_preset_quota')
    expect(
      db.prepare("SELECT organization_id FROM watermark WHERE id = 'moving'").get()?.[
        'organization_id'
      ],
    ).toBe('other')
    db.exec("DELETE FROM workspace_plan WHERE organization_id = 'other'")
    expect(() =>
      db.exec(
        "INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES('missing','other','Missing','{}',1,1)",
      ),
    ).toThrow('workspace_preset_quota')
  })
})
