import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { ownerInsert, ownerSelection } from './bootstrap-owner.mjs'

const SCHEMA =
  'CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, email_verified INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, role TEXT)'

test('initial owner starts unverified without password or token material, and the gate refuses repeat bootstrap', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(SCHEMA)
    const first = ownerInsert(
      { email: 'OWNER@example.test', name: "Owner O'Connor" },
      'fixture-owner',
      1000,
    )
    assert.deepEqual(
      db
        .prepare(first.sql)
        .all()
        .map((row) => row.id),
      ['fixture-owner'],
    )
    const second = ownerInsert({ email: 'other@example.test', name: 'Other' }, 'other-owner', 2000)
    assert.deepEqual(db.prepare(second.sql).all(), [])
    const row = db.prepare('SELECT * FROM user').get()
    assert.equal(row.email, 'owner@example.test')
    assert.equal(row.email_verified, 0)
    assert.equal(row.role, 'owner')
    assert.equal(row.name, "Owner O'Connor")
    assert.equal(Object.hasOwn(row, 'password'), false)
    assert.equal(Object.hasOwn(row, 'token'), false)
  } finally {
    db.close()
  }
})

test('SQL metacharacters in a real name remain data and invalid emails are rejected before any write', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(SCHEMA)
    const name = "Name'); DROP TABLE user; --"
    db.prepare(ownerInsert({ email: 'safe@example.test', name }).sql).all()
    assert.equal(db.prepare('SELECT name FROM user').get().name, name)
    assert.throws(() => ownerInsert({ email: 'not-an-email', name: 'Bad' }))
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1)
  } finally {
    db.close()
  }
})

test('explicit owner selection requires verification and preserves accounts and content', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(SCHEMA)
    db.exec(
      "CREATE TABLE content (id TEXT PRIMARY KEY, value TEXT); INSERT INTO content VALUES ('canary', 'keep this content')",
    )
    db.prepare(ownerInsert({ email: 'first@example.test', name: 'First' }, 'first-user').sql).all()
    db.prepare('INSERT INTO user VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'chosen-user',
      'Chosen',
      'chosen@example.test',
      0,
      1,
      1,
      'user',
    )
    assert.deepEqual(db.prepare(ownerSelection('chosen-user').sql).all(), [])
    assert.equal(db.prepare("SELECT role FROM user WHERE id = 'first-user'").get().role, 'owner')
    db.exec("UPDATE user SET email_verified = 1 WHERE id = 'chosen-user'")
    db.prepare(ownerSelection('chosen-user').sql).all()
    assert.equal(db.prepare("SELECT id FROM user WHERE role = 'owner'").get().id, 'chosen-user')
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM user WHERE role = 'admin'").get().total,
      0,
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM user').get().total, 2)
    assert.equal(db.prepare('SELECT value FROM content').get().value, 'keep this content')
    assert.throws(() => ownerSelection("bad/id'; DROP TABLE user; --"))
  } finally {
    db.close()
  }
})

test('selection leaves exactly one global owner and ordinary users while preserving workspace roles', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(SCHEMA)
    db.exec('CREATE TABLE member (user_id TEXT, organization_id TEXT, role TEXT)')
    const roles = ['owner', 'admin', 'admin,user', 'owner,user', null, 'viewer', 'user']
    for (const [index, role] of roles.entries()) {
      const id = `user-${index}`
      db.prepare('INSERT INTO user VALUES (?, ?, ?, 1, 1000, 2000, ?)').run(
        id,
        `Name ${index}`,
        `${id}@example.test`,
        role,
      )
      db.prepare('INSERT INTO member VALUES (?, ?, ?)').run(
        id,
        'workspace',
        index === 0 ? 'owner' : 'admin',
      )
    }
    const identities = db
      .prepare('SELECT id,name,email,email_verified,created_at,updated_at FROM user ORDER BY id')
      .all()
    const members = db.prepare('SELECT * FROM member ORDER BY user_id').all()
    assert.deepEqual(db.prepare(ownerSelection('missing').sql).all(), [])
    db.prepare(ownerSelection('user-6').sql).all()
    assert.deepEqual(
      db
        .prepare('SELECT id,role FROM user ORDER BY id')
        .all()
        .map((row) => ({ ...row })),
      roles.map((_, index) => ({ id: `user-${index}`, role: index === 6 ? 'owner' : 'user' })),
    )
    assert.deepEqual(
      db
        .prepare('SELECT id,name,email,email_verified,created_at,updated_at FROM user ORDER BY id')
        .all(),
      identities,
    )
    assert.deepEqual(db.prepare('SELECT * FROM member ORDER BY user_id').all(), members)
  } finally {
    db.close()
  }
})

test('fresh bootstrap works with all real migrations and cannot transfer the resulting anchor', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const directory = new URL('../migrations/', import.meta.url)
    const migrations = readdirSync(directory)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .toSorted((first, second) => first.localeCompare(second))
    for (const file of migrations) {
      db.exec(readFileSync(new URL(file, directory), 'utf8'))
    }
    const created = ownerInsert(
      { email: 'owner@example.test', name: 'Owner' },
      'anchored-owner',
      1000,
    )
    assert.equal(db.prepare(created.sql).all().length, 1)
    assert.equal(db.prepare('SELECT user_id FROM site_owner').get().user_id, 'anchored-owner')
    assert.equal(db.prepare('SELECT role FROM user').get().role, 'owner')
    assert.equal(db.prepare('SELECT email_verified FROM user').get().email_verified, 0)
    db.exec(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at,role) VALUES ('other-user','Other','other@example.test',1,1000,1000,'user')",
    )
    const before = db.prepare('SELECT id,role FROM user ORDER BY id').all()
    assert.throws(() => db.prepare(ownerSelection('other-user').sql).all(), /owner/i)
    assert.deepEqual(db.prepare('SELECT id,role FROM user ORDER BY id').all(), before)
    assert.equal(db.prepare('SELECT user_id FROM site_owner').get().user_id, 'anchored-owner')
    assert.deepEqual(
      db.prepare(ownerInsert({ email: 'third@example.test', name: 'Third' }).sql).all(),
      [],
    )
  } finally {
    db.close()
  }
})
