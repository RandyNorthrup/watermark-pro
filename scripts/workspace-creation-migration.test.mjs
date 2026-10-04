/** Exercise the actual creation migration against retained data and guarded writes. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'

const directory = new URL('../migrations/', import.meta.url)
const migration = readFileSync(new URL('0022_workspace_creation_capacity.sql', directory), 'utf8')
const databases = []
function database() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  const prerequisites = readdirSync(directory)
    .filter((name) => /^00\d\d_.*\.sql$/.test(name) && name < '0022')
    .toSorted((left, right) => left.localeCompare(right))
  for (const name of prerequisites) db.exec(readFileSync(new URL(name, directory), 'utf8'))
  return db
}
function person(db, id, cohort = 'private', verified = 1, banned = 0) {
  db.prepare(
    'INSERT INTO user(id,name,email,email_verified,membership_cohort,banned,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(id, id, `${id}@example.test`, verified, cohort, banned, 1, 1)
}
function oldWorkspace(db, id, owner) {
  db.prepare('INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)').run(id, id, id, 1)
  db.prepare(
    'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
  ).run(id, id, owner, 'owner', 1)
}
function create(db, id, owner, kind = 'shared', slug = id) {
  db.prepare(
    'INSERT INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES(?,?,?,?,?,?)',
  ).run(id, id, slug, 1, owner, kind)
}
afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})
describe('server-owned workspace creation migration', () => {
  it('preserves historical rosters and data, credits the stable first owner and refuses extra creation', () => {
    const db = database()
    person(db, 'old')
    person(db, 'co-owner')
    oldWorkspace(db, 'first', 'old')
    oldWorkspace(db, 'second', 'old')
    db.prepare(
      'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
    ).run('later-owner', 'first', 'co-owner', 'owner', 2)
    db.exec(
      "INSERT INTO watermark(id,organization_id,name,spec,created_at,updated_at) VALUES('canary','first','Keep','{}',1,1)",
    )
    const members = db.prepare('SELECT * FROM member ORDER BY id').all()
    const content = db.prepare('SELECT * FROM watermark').all()
    const plans = db.prepare('SELECT * FROM workspace_plan ORDER BY organization_id').all()
    db.exec(migration)
    assert.deepEqual(
      db
        .prepare('SELECT creation_owner_id,creation_kind FROM organization ORDER BY id')
        .all()
        .map((x) => ({ ...x })),
      [
        { creation_owner_id: 'old', creation_kind: 'historical' },
        { creation_owner_id: 'old', creation_kind: 'historical' },
      ],
    )
    assert.deepEqual(db.prepare('SELECT * FROM member ORDER BY id').all(), members)
    assert.deepEqual(db.prepare('SELECT * FROM watermark').all(), content)
    assert.deepEqual(
      db.prepare('SELECT * FROM workspace_plan ORDER BY organization_id').all(),
      plans,
    )
    assert.throws(() => create(db, 'extra', 'old'), /workspace_creation_quota/)
    create(db, 'co-owner-new', 'co-owner')
  })
  it('keeps personal provisioning idempotent and separate from the one shared slot', () => {
    const db = database()
    person(db, 'private')
    person(db, 'pending', 'pending', 0)
    db.exec(migration)
    create(db, 'personal-private', 'private', 'personal')
    db.prepare(
      "INSERT INTO private_workspace(user_id,organization_id) VALUES('private','personal-private')",
    ).run()
    db.prepare(
      "INSERT OR IGNORE INTO organization(id,name,slug,created_at,creation_owner_id,creation_kind) VALUES('personal-private','My workspace','personal-private',1,'private','personal')",
    ).run()
    create(db, 'first', 'private')
    assert.throws(() => create(db, 'second', 'private'), /workspace_creation_quota/)
    create(db, 'personal-pending', 'pending', 'personal')
    assert.throws(() => create(db, 'public-shared', 'pending'), /workspace_creation_quota/)
    assert.throws(
      () => create(db, 'spoof-personal', 'private', 'personal'),
      /workspace_creation_quota/,
    )
    db.prepare("DELETE FROM organization WHERE id='first'").run()
    create(db, 'replacement', 'private')
  })
  it('refuses missing authority, public and pending claims, bans and unverified creation', () => {
    const db = database()
    person(db, 'good')
    person(db, 'public', 'public')
    person(db, 'pending', 'pending')
    person(db, 'unverified', 'private', 0)
    person(db, 'banned', 'private', 1, 1)
    db.exec(migration)
    for (const owner of [null, 'unknown', 'public', 'pending', 'unverified', 'banned'])
      assert.throws(() => create(db, `denied-${owner}`, owner), /workspace_creation_quota/)
    for (const kind of ['historical', 'paid'])
      assert.throws(() => create(db, `forged-${kind}`, 'good', kind), /workspace_creation_quota/)
    create(db, 'valid', 'good')
  })
  it('does not release capacity after role transfer or mutable organization metadata', () => {
    const db = database()
    person(db, 'first')
    person(db, 'other')
    db.exec(migration)
    create(db, 'shared', 'first')
    db.prepare("UPDATE organization SET metadata=? WHERE id='shared'").run(
      JSON.stringify({ paidPlan: 'team', creationOwnerId: 'other', creationKind: 'personal' }),
    )
    db.prepare(
      'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
    ).run('owner', 'shared', 'other', 'owner', 1)
    assert.throws(() => create(db, 'second', 'first'), /workspace_creation_quota/)
    assert.throws(
      () => db.exec("UPDATE organization SET creation_owner_id='other' WHERE id='shared'"),
      /workspace_creation_owner_immutable/,
    )
    assert.throws(
      () => db.exec("UPDATE organization SET creation_kind='personal' WHERE id='shared'"),
      /workspace_creation_owner_immutable/,
    )
    create(db, 'other-shared', 'other')
    db.exec("DELETE FROM user WHERE id='first'")
    assert.equal(
      db.prepare("SELECT creation_owner_id FROM organization WHERE id='shared'").get()
        .creation_owner_id,
      null,
    )
  })
})
