import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { auditOrigin } from './fixtures/audit-accounts.mjs'
import {
  auditLabel,
  AUDIT_SURFACES,
  requireSurface,
  reserveCapture,
} from './lib/audit-surfaces.mjs'
import { waitForLink } from './lib/dev-mailbox.mjs'

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) return await routeFiles(filename)
      return entry.name.endsWith('.tsx') &&
        !entry.name.endsWith('.test.tsx') &&
        entry.name !== 'route.tsx'
        ? [filename]
        : []
    }),
  )
  return groups.flat()
}

test('audit inventory covers every actual leaf route with unique safe artifact names', async () => {
  const files = await routeFiles('src/client/routes')
  const routes = new Set()
  for (const filename of files) {
    const source = await readFile(filename, 'utf8')
    const route = /createFileRoute\('([^']+)'\)/.exec(source)?.[1]
    if (route !== undefined) routes.add(route.replace(/\/$/, '') || '/')
  }
  assert.deepEqual(new Set(AUDIT_SURFACES.map(({ route }) => route)), routes)
  assert.equal(new Set(AUDIT_SURFACES.map(({ id }) => id)).size, AUDIT_SURFACES.length)
  for (const { id } of AUDIT_SURFACES) assert.match(id, /^[a-z][a-z0-9-]*$/)
  for (const locale of ['en', 'ar']) {
    const catalogue = JSON.parse(await readFile(`src/client/locales/${locale}/common.json`, 'utf8'))
    for (const { heading } of AUDIT_SURFACES) {
      const keys = heading === null ? [] : [heading].flat()
      for (const key of keys) {
        assert.equal(typeof auditLabel(catalogue, key), 'string', `${locale}:${key}`)
      }
    }
  }
  assert.equal(requireSurface('designer-new').route, '/app/library/new')
  assert.equal(requireSurface('designer-edit').route, '/app/library/$watermarkId')
  for (const untrusted of ['../../private', 'share/secret-token', '/reset-password?token=private'])
    assert.throws(() => requireSurface(untrusted), /Unknown audit surface/)
})

test('catalogue assertions require own translated text rather than inherited or missing values', () => {
  assert.equal(auditLabel({ label: { title: 'Expected page' } }, 'label.title'), 'Expected page')
  for (const catalogue of [
    {},
    { label: null },
    { label: { title: 1 } },
    Object.create({ label: { title: 'Inherited' } }),
  ])
    assert.throws(() => auditLabel(catalogue, 'label.title'), /no translated label/)
})

test('fixture origin refuses remote, credentials, and path/query destinations before writing', () => {
  assert.equal(auditOrigin('http://localhost:5273'), 'http://localhost:5273')
  for (const value of [
    'https://lumafoil.com',
    ['http:', '//localhost.evil.invalid'].join(''),
    'http://user:pass@localhost',
    'http://localhost/private',
    'http://localhost/?token=private',
  ])
    assert.throws(() => auditOrigin(value), /loopback HTTP origin/)
})

test('mailbox chooses the requested flow even when an earlier email belongs to the same fixture', async () => {
  let calls = 0
  const result = await waitForLink(
    async () => {
      calls += 1
      assert.equal(calls, 1, 'The required message already exists; polling must not overlook it')
      return {
        messages: [
          {
            to: 'audit@example.test',
            text: 'http://localhost:5273/api/auth/verify-email?token=verify',
          },
          { to: 'other@example.test', text: 'http://localhost:5273/reset-password?token=other' },
          { to: 'audit@example.test', text: 'http://localhost:5273/reset-password?token=reset' },
        ],
      }
    },
    'audit@example.test',
    '/reset-password',
  )
  assert.equal(result, 'http://localhost:5273/reset-password?token=reset')
})

test('duplicate capture refusal preserves original proof and permits distinct views', () => {
  const captures = new Map()
  const original = { surface: 'designer-new' }
  reserveCapture(captures, 'desktop/designer-new-en-light.png', original)
  assert.throws(
    () =>
      reserveCapture(captures, 'desktop/designer-new-en-light.png', { surface: 'designer-edit' }),
    /Duplicate screenshot/,
  )
  assert.equal(captures.get('desktop/designer-new-en-light.png'), original)
  reserveCapture(captures, 'desktop/designer-edit-en-light.png', { surface: 'designer-edit' })
  assert.equal(captures.size, 2)
})
