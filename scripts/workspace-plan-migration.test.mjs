/** Run the actual plan migration over legacy data, then exercise its production triggers. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'

const directory = new URL('../migrations/', import.meta.url)
const migration = readFileSync(new URL('0020_workspace_plans.sql', directory), 'utf8')
const memberMigration = readFileSync(
  new URL('0021_workspace_member_capacity.sql', directory),
  'utf8',
)
const databases = []

function database() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  const historical = readdirSync(directory)
    .filter((name) => /^00\d\d_.*\.sql$/.test(name) && name < '0020')
    .toSorted((a, b) => a.localeCompare(b))
  for (const name of historical) {
    db.exec(readFileSync(new URL(name, directory), 'utf8'))
  }
  return db
}
function person(db, id, cohort = 'private') {
  db.prepare(
    'INSERT INTO user(id,name,email,email_verified,membership_cohort,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
  ).run(id, id, `${id}@example.test`, 1, cohort, 1, 1)
}
function workspace(db, id, ownerId) {
  db.prepare('INSERT INTO organization(id,name,slug,metadata,created_at) VALUES(?,?,?,?,?)').run(
    id,
    id,
    id,
    JSON.stringify({ paidPlan: 'team', private: true }),
    1,
  )
  db.prepare(
    'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
  ).run(`${id}-${ownerId}`, id, ownerId, 'owner', 1)
}
function plan(db, id) {
  const record = db.prepare('SELECT * FROM workspace_plan WHERE organization_id=?').get(id)
  assert.ok(record)
  return { ...record }
}
afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})

describe('workspace plan migration and server-only grants', () => {
  it('preserves private/public personal grants and all historical shared members and content', () => {
    const db = database()
    person(db, 'private')
    person(db, 'public', 'public')
    workspace(db, 'private-personal', 'private')
    workspace(db, 'public-personal', 'public')
    db.exec(
      "INSERT INTO private_workspace(user_id,organization_id) VALUES('private','private-personal'),('public','public-personal')",
    )
    workspace(db, 'historical-shared', 'private')
    for (let index = 0; index < 6; index += 1) {
      const id = `member-${index}`
      person(db, id, 'public')
      db.prepare(
        'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
      ).run(id, 'historical-shared', id, 'viewer', 1)
    }
    db.exec(
      "INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES('content-canary','historical-shared','Retain','{}',1,1)",
    )
    const members = db.prepare('SELECT * FROM member ORDER BY id').all()
    const content = db.prepare('SELECT * FROM watermark').all()
    db.exec(migration)
    assert.equal(plan(db, 'private-personal').base_plan, 'private')
    assert.equal(plan(db, 'public-personal').base_plan, 'free')
    for (const id of ['private-personal', 'public-personal']) {
      assert.equal(plan(db, id).kind, 'personal')
      assert.equal(plan(db, id).base_member_limit, 1)
      assert.equal(plan(db, id).paid_plan, null)
    }
    assert.equal(plan(db, 'historical-shared').base_plan, 'legacy')
    assert.equal(plan(db, 'historical-shared').base_member_limit, 7)
    assert.deepEqual(db.prepare('SELECT * FROM member ORDER BY id').all(), members)
    assert.deepEqual(db.prepare('SELECT * FROM watermark').all(), content)
    db.exec(memberMigration)
    assert.equal(plan(db, 'historical-shared').retained_member_limit, 7)
    assert.deepEqual(db.prepare('SELECT * FROM member ORDER BY id').all(), members)
    person(db, 'excess-member')
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES('excess','historical-shared','excess-member','viewer',1)",
        ),
      /workspace_member_quota/,
    )
  })
  it('retains historical public and private primary rosters without opening additional seats', () => {
    const db = database()
    person(db, 'public-owner', 'public')
    person(db, 'private-owner')
    workspace(db, 'public-primary', 'public-owner')
    workspace(db, 'private-primary', 'private-owner')
    db.exec(
      "INSERT INTO private_workspace(user_id,organization_id) VALUES('public-owner','public-primary'),('private-owner','private-primary')",
    )
    person(db, 'existing-public-member', 'public')
    db.exec(
      "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES('public-existing','public-primary','existing-public-member','viewer',1)",
    )
    for (const index of [0, 1, 2, 3]) {
      const id = `private-existing-${index}`
      person(db, id)
      db.prepare(
        'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
      ).run(id, 'private-primary', id, 'viewer', 1)
    }
    const members = db.prepare('SELECT * FROM member ORDER BY id').all()
    db.exec(migration)
    db.exec(memberMigration)
    assert.equal(plan(db, 'public-primary').retained_member_limit, 2)
    assert.equal(plan(db, 'private-primary').retained_member_limit, 5)
    assert.deepEqual(db.prepare('SELECT * FROM member ORDER BY id').all(), members)
    person(db, 'next-member')
    const insert = db.prepare(
      'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
    )
    for (const id of ['public-primary', 'private-primary']) {
      assert.throws(
        () => insert.run(`new-${id}`, id, 'next-member', 'viewer', 1),
        /workspace_member_quota/,
      )
    }
    db.exec("DELETE FROM member WHERE id='public-existing'")
    insert.run('replacement-public', 'public-primary', 'next-member', 'viewer', 1)
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM member WHERE organization_id='public-primary'").get().n,
      2,
    )
    assert.throws(
      () =>
        db.exec(
          "UPDATE workspace_plan SET retained_member_limit=0 WHERE organization_id='public-primary'",
        ),
      /CHECK constraint failed/,
    )
  })
  it('assigns future capacity by server identity and purpose, never organization metadata', () => {
    const db = database()
    db.exec(migration)
    person(db, 'private')
    person(db, 'public', 'public')
    person(db, 'pending', 'pending')
    workspace(db, 'private-shared', 'private')
    workspace(db, 'public-personal', 'public')
    workspace(db, 'pending-shared', 'pending')
    assert.equal(plan(db, 'private-shared').base_plan, 'private')
    assert.equal(plan(db, 'private-shared').base_member_limit, 3)
    assert.equal(plan(db, 'pending-shared').base_plan, 'free')
    assert.equal(plan(db, 'pending-shared').paid_plan, null)
    assert.equal(plan(db, 'public-personal').base_plan, 'free')
    db.exec(
      "INSERT INTO private_workspace(user_id,organization_id) VALUES('public','public-personal')",
    )
    assert.equal(plan(db, 'public-personal').kind, 'personal')
    assert.equal(plan(db, 'public-personal').base_member_limit, 1)
    assert.equal(plan(db, 'public-personal').paid_plan, null)
    db.prepare('UPDATE organization SET metadata=? WHERE id=?').run(
      JSON.stringify({ paidPlan: 'pro', paidThrough: Date.UTC(2030, 0, 1) }),
      'public-personal',
    )
    assert.equal(plan(db, 'public-personal').base_plan, 'free')
    assert.equal(plan(db, 'public-personal').paid_plan, null)
    db.exec("DELETE FROM organization WHERE id='public-personal'")
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM workspace_plan WHERE organization_id='public-personal'")
        .get().n,
      0,
    )
  })
  it('rejects incompatible paid purposes and malformed authority at the database boundary', () => {
    const db = database()
    db.exec(migration)
    person(db, 'private')
    workspace(db, 'shared', 'private')
    assert.throws(
      () => db.exec("UPDATE workspace_plan SET paid_plan='pro' WHERE organization_id='shared'"),
      /CHECK constraint failed/,
    )
    assert.throws(
      () => db.exec("UPDATE workspace_plan SET base_plan='admin' WHERE organization_id='shared'"),
      /CHECK constraint failed/,
    )
    assert.throws(
      () => db.exec("UPDATE workspace_plan SET revision=-1 WHERE organization_id='shared'"),
      /CHECK constraint failed/,
    )
    assert.throws(
      () =>
        db.exec("UPDATE workspace_plan SET paid_access_suspended=2 WHERE organization_id='shared'"),
      /CHECK constraint failed/,
    )
    assert.throws(
      () => db.exec("UPDATE workspace_plan SET kind='personal' WHERE organization_id='shared'"),
      /CHECK constraint failed/,
    )
    db.exec("UPDATE workspace_plan SET paid_plan='team' WHERE organization_id='shared'")
    assert.equal(plan(db, 'shared').paid_plan, 'team')
  })
})
