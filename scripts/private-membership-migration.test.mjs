/** Execute the real membership cutover against legacy SQLite rows and independent privacy canaries. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'

const directory = new URL('../migrations/', import.meta.url)
const migration = readFileSync(new URL('0018_private-membership.sql', directory), 'utf8')
const databases = []
const policy = { futureMs: 60_000, expiredMs: 60_000 }

function legacyDatabase() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const files = readdirSync(directory)
    .filter((name) => /^00\d\d_.*\.sql$/.test(name) && name < '0018')
    .toSorted((a, b) => a.localeCompare(b))
  for (const name of files) db.exec(readFileSync(new URL(name, directory), 'utf8'))
  db.exec(
    "INSERT INTO user(id,name,email,email_verified,role,created_at,updated_at) VALUES('private','Private','private@example.test',1,'user',1,1),('unverified','Unverified','unverified@example.test',0,'user',1,1)",
  )
  db.exec(
    "INSERT INTO organization(id,name,slug,created_at) VALUES('personal-private','Private workspace','personal-private',1)",
  )
  db.exec(
    "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES('private-owner','personal-private','private','owner',1)",
  )
  db.exec(
    "INSERT INTO private_workspace(user_id,organization_id) VALUES('private','personal-private')",
  )
  return db
}

function invitation(
  db,
  {
    id,
    createdAt = 1,
    acceptedAt = null,
    revokedAt = null,
    expiresAt = Date.now() + policy.futureMs,
  },
) {
  db.prepare(
    'INSERT INTO site_invitation(id,inviter_id,email,token_hash,created_at,expires_at,accepted_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(
    id,
    'private',
    `${id}@example.test`,
    `${id}-hash`,
    createdAt,
    expiresAt,
    acceptedAt,
    revokedAt,
  )
}

afterEach(() => {
  for (const db of databases) db.close()
  databases.length = 0
})

describe('private membership cutover', () => {
  it('preserves every historical identity and workspace grant while blocking activation of new unadmitted accounts', () => {
    const db = legacyDatabase()
    const identities = db
      .prepare(
        'SELECT id,name,email,email_verified,role,created_at,updated_at FROM user ORDER BY id',
      )
      .all()
    const members = db.prepare('SELECT * FROM member').all()
    const mappings = db.prepare('SELECT * FROM private_workspace').all()
    db.exec(migration)
    assert.deepEqual(
      db
        .prepare(
          'SELECT id,name,email,email_verified,role,created_at,updated_at FROM user ORDER BY id',
        )
        .all(),
      identities,
    )
    assert.deepEqual(db.prepare('SELECT * FROM member').all(), members)
    assert.deepEqual(db.prepare('SELECT * FROM private_workspace').all(), mappings)
    assert.deepEqual(
      db
        .prepare('SELECT membership_cohort FROM user')
        .all()
        .map((row) => row.membership_cohort),
      ['private', 'private'],
    )
    db.exec(
      "INSERT INTO user(id,name,email,email_verified,role,created_at,updated_at) VALUES('new','New','new@example.test',1,'user',1,1)",
    )
    assert.equal(
      db.prepare("SELECT membership_cohort FROM user WHERE id='new'").get().membership_cohort,
      'pending',
    )
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM user WHERE membership_cohort='private'").get()
        .total,
      2,
    )
  })

  it('excludes historical spend and retains only the two oldest live promises without reviving expired or revoked tokens', () => {
    const db = legacyDatabase()
    invitation(db, { id: 'accepted', acceptedAt: 1 })
    invitation(db, { id: 'revoked', revokedAt: 1 })
    invitation(db, { id: 'expired', expiresAt: Date.now() - policy.expiredMs })
    invitation(db, { id: 'oldest-a', createdAt: 2 })
    invitation(db, { id: 'oldest-b', createdAt: 2 })
    invitation(db, { id: 'excess', createdAt: 3 })
    db.exec(migration)
    const rows = db
      .prepare('SELECT id,grant_version,accepted_at,revoked_at FROM site_invitation ORDER BY id')
      .all()
    const retained = rows.filter((row) => row.grant_version === 1)
    assert.deepEqual(
      retained.map((row) => row.id),
      ['oldest-a', 'oldest-b'],
    )
    assert.ok(retained.every((row) => row.accepted_at === null && row.revoked_at === null))
    assert.equal(rows.find((row) => row.id === 'accepted').accepted_at, 1)
    assert.equal(rows.find((row) => row.id === 'accepted').grant_version, 0)
    assert.equal(rows.find((row) => row.id === 'revoked').revoked_at, 1)
    assert.equal(rows.find((row) => row.id === 'expired').revoked_at, null)
    assert.ok(rows.find((row) => row.id === 'excess').revoked_at > 0)
    db.exec(
      "INSERT INTO site_invitation(id,inviter_id,email,token_hash,created_at,expires_at) VALUES('new','private','new@example.test','new-hash',1,9999999999999)",
    )
    assert.equal(
      db.prepare("SELECT grant_version FROM site_invitation WHERE id='new'").get().grant_version,
      1,
    )
  })
})
