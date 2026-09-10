import assert from 'node:assert/strict'
/** Execute the real migration against SQLite, preserving independent legacy row canaries. */
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'

const directory = new URL('../migrations/', import.meta.url)
const migration = readFileSync(new URL('0012_site_roles.sql', directory), 'utf8')
const databases = []
function legacyDatabase() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const files = readdirSync(directory)
    .filter((name) => /^00\d\d_.*\.sql$/.test(name) && name < '0012')
    .toSorted((a, b) => a.localeCompare(b))
  for (const name of files) db.exec(readFileSync(new URL(name, directory), 'utf8'))
  return db
}
function insertUser(db, id, role) {
  db.prepare(
    'INSERT INTO user(id,name,email,email_verified,role,created_at,updated_at) VALUES(?,?,?,1,?,1,1)',
  ).run(id, `Account ${id}`, `${id}@example.test`, role)
}
function populatedDatabase() {
  const db = legacyDatabase()
  insertUser(db, 'anchored', 'admin')
  insertUser(db, 'ordinary', 'user')
  for (const id of ['anchored', 'ordinary']) {
    const organization = `personal-${id}`
    db.prepare('INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,1)').run(
      organization,
      'Private workspace',
      organization,
    )
    db.prepare(
      'INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,1)',
    ).run(organization, organization, id, 'owner')
    db.prepare('INSERT INTO private_workspace(user_id,organization_id) VALUES(?,?)').run(
      id,
      organization,
    )
  }
  db.exec(
    "INSERT INTO site_invitation(id,inviter_id,email,token_hash,created_at,expires_at) VALUES('existing-invite','ordinary','invited@example.test','fixture-hash',1,9999999999999)",
  )
  return db
}
afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})
describe('site role migration', () => {
  it('preserves identities and private memberships while producing one owner and zero admins', () => {
    const db = populatedDatabase()
    const identities = db
      .prepare('SELECT id,name,email,email_verified,created_at,updated_at FROM user ORDER BY id')
      .all()
    const memberships = db.prepare('SELECT * FROM member ORDER BY id').all()
    const workspaces = db.prepare('SELECT * FROM private_workspace ORDER BY user_id').all()
    db.exec(migration)
    assert.deepEqual(
      structuredClone(db.prepare('SELECT id,role FROM user ORDER BY id').all()),
      structuredClone([
        { id: 'anchored', role: 'owner' },
        { id: 'ordinary', role: 'user' },
      ]),
    )
    assert.deepEqual(
      structuredClone(db.prepare('SELECT * FROM site_owner').all()),
      structuredClone([{ id: 1, user_id: 'anchored' }]),
    )
    assert.deepEqual(
      structuredClone(
        db
          .prepare(
            'SELECT id,name,email,email_verified,created_at,updated_at FROM user ORDER BY id',
          )
          .all(),
      ),
      structuredClone(identities),
    )
    assert.deepEqual(
      structuredClone(db.prepare('SELECT * FROM member ORDER BY id').all()),
      structuredClone(memberships),
    )
    assert.deepEqual(
      structuredClone(db.prepare('SELECT * FROM private_workspace ORDER BY user_id').all()),
      structuredClone(workspaces),
    )
    assert.deepEqual(
      structuredClone(db.prepare('SELECT role FROM site_invitation').all()),
      structuredClone([{ role: 'user' }]),
    )
    assert.deepEqual(
      structuredClone(db.prepare("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'").get()),
      structuredClone({ count: 0 }),
    )
  })
  it('permits multiple explicit administrators while preserving the sole owner', () => {
    const db = populatedDatabase()
    db.exec(migration)
    db.exec("UPDATE user SET role='admin' WHERE id='ordinary'")
    insertUser(db, 'appointed-admin', 'admin')
    assert.deepEqual(
      structuredClone(db.prepare("SELECT COUNT(*) AS count FROM user WHERE role='admin'").get()),
      structuredClone({ count: 2 }),
    )
    assert.deepEqual(
      structuredClone(db.prepare("SELECT id FROM user WHERE role='owner'").all()),
      structuredClone([{ id: 'anchored' }]),
    )
    db.exec("UPDATE user SET role='user' WHERE id='ordinary'")
    assert.deepEqual(
      structuredClone(db.prepare("SELECT role FROM user WHERE id='ordinary'").get()),
      structuredClone({ role: 'user' }),
    )
  })
  for (const statement of [
    "UPDATE user SET role='user' WHERE id='anchored'",
    "UPDATE user SET role='admin' WHERE id='anchored'",
    "UPDATE user SET id='replacement' WHERE id='anchored'",
    "UPDATE user SET banned=1 WHERE id='anchored'",
    "DELETE FROM user WHERE id='anchored'",
    "UPDATE user SET role='owner' WHERE id='ordinary'",
    "UPDATE user SET role='user,admin' WHERE id='ordinary'",
    "UPDATE site_owner SET user_id='ordinary'",
    'DELETE FROM site_owner',
    "UPDATE site_invitation SET role='owner'",
  ]) {
    it('refuses forbidden database mutation: ' + statement, () => {
      const db = populatedDatabase()
      db.exec(migration)
      assert.throws(() => db.exec(statement))
      assert.deepEqual(
        structuredClone(db.prepare("SELECT id,role,banned FROM user WHERE id='anchored'").get()),
        structuredClone({ id: 'anchored', role: 'owner', banned: 0 }),
      )
      assert.deepEqual(
        structuredClone(db.prepare('SELECT * FROM site_owner').all()),
        structuredClone([{ id: 1, user_id: 'anchored' }]),
      )
    })
  }
  it('supports an empty install, but refuses administrators before the initial owner', () => {
    const db = legacyDatabase()
    db.exec(migration)
    assert.throws(() => insertUser(db, 'premature-admin', 'admin'))
    insertUser(db, 'first', 'owner')
    assert.deepEqual(
      structuredClone(db.prepare('SELECT * FROM site_owner').all()),
      structuredClone([{ id: 1, user_id: 'first' }]),
    )
    assert.throws(() => insertUser(db, 'second', 'owner'))
    insertUser(db, 'appointed-admin', 'admin')
  })
  it('refuses an occupied database without its prior anchor before changing roles', () => {
    const db = legacyDatabase()
    insertUser(db, 'unselected', 'user')
    db.exec('BEGIN')
    assert.throws(() => db.exec(migration), /CHECK constraint/)
    db.exec('ROLLBACK')
    assert.deepEqual(
      structuredClone(db.prepare('SELECT id,role FROM user').all()),
      structuredClone([{ id: 'unselected', role: 'user' }]),
    )
    assert.notEqual(
      db.prepare("SELECT name FROM sqlite_master WHERE name='user_single_site_admin'").get(),
      undefined,
    )
  })
})
