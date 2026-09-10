import assert from 'node:assert/strict'
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
    assert.equal(row.role, 'admin')
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
    assert.equal(db.prepare("SELECT role FROM user WHERE id = 'first-user'").get().role, 'admin')
    db.exec("UPDATE user SET email_verified = 1 WHERE id = 'chosen-user'")
    db.prepare(ownerSelection('chosen-user').sql).all()
    assert.equal(db.prepare("SELECT id FROM user WHERE role = 'admin'").get().id, 'chosen-user')
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM user').get().total, 2)
    assert.equal(db.prepare('SELECT value FROM content').get().value, 'keep this content')
    assert.throws(() => ownerSelection("bad/id'; DROP TABLE user; --"))
  } finally {
    db.close()
  }
})
