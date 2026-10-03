import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { URL as FileUrl } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { CLOUD_OPERATION_POLICY } from '../../shared/cloud-operations'

const directory = new FileUrl('../../../migrations/', import.meta.url)
const migrationName = '0026_cloud_operation_budget.sql'
const migration = readFileSync(new FileUrl(migrationName, directory), 'utf8')
const databases: DatabaseSync[] = []
const month =
  "CAST(strftime('%Y','now') AS INTEGER) * 12 + CAST(strftime('%m','now') AS INTEGER) - 1"
function fixture() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  const prerequisites = readdirSync(directory)
    .filter((item) => /^\d+.*\.sql$/.test(item) && item < migrationName)
    .toSorted((a, b) => a.localeCompare(b))
  for (const name of prerequisites) db.exec(readFileSync(new FileUrl(name, directory), 'utf8'))
  db.exec(
    "INSERT INTO user(id,name,email,email_verified,membership_cohort,banned,created_at,updated_at) VALUES('fixture','Fixture','fixture@example.test',1,'private',0,1,1)",
  )
  const ownerGuards = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE name IN ('site_owner_no_update','site_owner_no_delete') ORDER BY name",
    )
    .all()
  db.exec(migration)
  const currentMonth = db
    .prepare(
      "SELECT CAST(strftime('%Y','now') AS INTEGER) * 12 + CAST(strftime('%m','now') AS INTEGER) - 1 AS month",
    )
    .get()?.['month']
  if (typeof currentMonth !== 'number') throw new Error('Named UTC month fixture missing.')
  db.exec(
    "INSERT INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES('first','First','first',1,'fixture','shared')",
  )
  const spend = (
    units: number,
    limit: number = CLOUD_OPERATION_POLICY.limits.private,
    id = 'first',
  ) =>
    db
      .prepare(
        'UPDATE workspace_plan SET operation_month = ?, operation_units = CASE WHEN operation_month < ? THEN ? ELSE operation_units + ? END WHERE organization_id = ? AND operation_month <= ? AND CASE WHEN operation_month < ? THEN 0 ELSE operation_units END + ? <= ? RETURNING operation_units',
      )
      .all(currentMonth, currentMonth, units, units, id, currentMonth, currentMonth, units, limit)
  const site = () => db.prepare('SELECT month,units FROM cloud_operation_site_budget').get()
  const workspace = () =>
    db
      .prepare(
        "SELECT operation_month,operation_units FROM workspace_plan WHERE organization_id='first'",
      )
      .get()
  return { db, spend, site, workspace, ownerGuards }
}
afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})

describe('actual five-column cloud budget migration', () => {
  it('keeps owner guards unchanged, seeds one durable singleton and debits both with one update', () => {
    const { db, spend, site, workspace, ownerGuards } = fixture()
    expect(
      db
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE name IN ('site_owner_no_update','site_owner_no_delete') ORDER BY name",
        )
        .all(),
    ).toEqual(ownerGuards)
    expect(
      db
        .prepare('PRAGMA table_info(cloud_operation_site_budget)')
        .all()
        .map((row) => row['name']),
    ).toEqual(['id', 'month', 'units'])
    expect(spend(CLOUD_OPERATION_POLICY.weights.read)).toHaveLength(1)
    expect(site()?.['units']).toBe(1)
    expect(workspace()?.['operation_units']).toBe(1)
    expect(() => db.exec('DELETE FROM cloud_operation_site_budget')).toThrow(
      'cloud_operation_authority_invalid',
    )
    expect(() => db.exec('INSERT INTO cloud_operation_site_budget(id) VALUES(2)')).toThrow(
      'CHECK constraint failed',
    )
    expect(() =>
      db.exec('INSERT OR REPLACE INTO cloud_operation_site_budget(id,month,units) VALUES(1,0,0)'),
    ).toThrow('cloud_operation_authority_invalid')
    expect(site()?.['units']).toBe(1)
  })
  it('workspace exhaustion does not spend the site, and site exhaustion rolls back the workspace', () => {
    const { db, spend, site, workspace } = fixture()
    spend(CLOUD_OPERATION_POLICY.limits.private)
    const full = site()
    expect(spend(1)).toHaveLength(0)
    expect(site()).toEqual(full)
    db.prepare('UPDATE cloud_operation_site_budget SET units=?').run(
      CLOUD_OPERATION_POLICY.limits.site,
    )
    const before = workspace()
    expect(() => spend(1, CLOUD_OPERATION_POLICY.limits.team)).toThrow(
      'cloud_operation_site_exhausted',
    )
    expect(workspace()).toEqual(before)
    expect(site()?.['units']).toBe(CLOUD_OPERATION_POLICY.limits.site)
  })
  it('a constraint failure after trigger debit backs out both counters', () => {
    const { db, spend, site, workspace } = fixture()
    const beforeSite = site(),
      beforeWorkspace = workspace()
    db.exec(
      "CREATE TRIGGER deliberate_site_failure AFTER UPDATE ON cloud_operation_site_budget BEGIN SELECT RAISE(ABORT,'named_fixture_failure'); END",
    )
    expect(() => spend(1)).toThrow('named_fixture_failure')
    expect(site()).toEqual(beforeSite)
    expect(workspace()).toEqual(beforeWorkspace)
  })
  it('forward month rollover starts the current allowance, while same-month decreases and future resets are refused', () => {
    const { db, spend, site, workspace } = fixture()
    spend(4)
    expect(spend(1)).toHaveLength(1)
    expect(site()?.['units']).toBe(5)
    const old = workspace()
    expect(() =>
      db.exec("UPDATE workspace_plan SET operation_units=1 WHERE organization_id='first'"),
    ).toThrow('cloud_operation_authority_invalid')
    expect(() =>
      db.exec(
        `UPDATE workspace_plan SET operation_month=${month}+1, operation_units=1 WHERE organization_id='first'`,
      ),
    ).toThrow('cloud_operation_authority_invalid')
    expect(workspace()).toEqual(old)
    expect(() => db.exec('UPDATE cloud_operation_site_budget SET units=1')).toThrow(
      'cloud_operation_authority_invalid',
    )
  })
  it('authorized empty group deletion/replacement and account deletion never erase aggregate site spend', () => {
    const { db, spend, site } = fixture()
    spend(12)
    db.exec("DELETE FROM organization WHERE id='first'")
    db.exec(
      "INSERT INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES('replacement','Replacement','replacement',1,'fixture','shared')",
    )
    expect(spend(1, CLOUD_OPERATION_POLICY.limits.private, 'replacement')).toHaveLength(1)
    expect(site()?.['units']).toBe(13)
    db.exec("DELETE FROM user WHERE id='fixture'")
    expect(site()?.['units']).toBe(13)
  })
  it('rejects fractional/negative aggregate storage without spending the other authority', () => {
    const { db, site } = fixture()
    expect(() =>
      db.exec(
        `UPDATE workspace_plan SET operation_month=${month},operation_units=0.5 WHERE organization_id='first'`,
      ),
    ).toThrow('CHECK constraint failed')
    expect(() => db.exec('UPDATE cloud_operation_site_budget SET units=-1')).toThrow()
    expect(site()?.['units']).toBe(0)
  })
})
