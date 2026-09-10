/** Real SDK startup checks use disposable built fixtures and isolated D1/R2 state. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { startGateServer } from './lib/gate-runtime.mjs'

const FIXTURE_WORKER = `export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/api/health') return Response.json({ status: 'ok', environment: env.APP_ENV })
    if (pathname === '/api/bindings') {
      await env.BUCKET.put('test-value', 'isolated bytes')
      const stored = await env.BUCKET.get('test-value')
      const row = await env.DB.prepare('SELECT value FROM fixture_state').first()
      return Response.json({
        row: row.value,
        object: await stored.text(),
        limiter: typeof env.TEST_RATE_LIMITER.limit === 'function',
        appUrl: env.APP_URL,
        testSecret: typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32,
        inheritedSecrets: ['GOOGLE_AUTH_CLIENT_SECRET', 'GOOGLE_PICKER_API_KEY'].some(key => key in env),
      })
    }
    return new Response('fixture Worker rejection', { status: 404 })
  }
}`

async function fixture(context, { invalidMigration = false } = {}) {
  const parent = await realpath('temp')
  const root = await mkdtemp(path.join(parent, 'lumafoil-gate-fixture-'))
  context.after(async () => {
    const actual = await realpath(root)
    assert.equal(path.dirname(actual), parent)
    assert.ok(path.basename(actual).startsWith('lumafoil-gate-fixture-'))
    await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  for (const directory of ['.wrangler/deploy', 'dist/worker', 'dist/client', 'migrations'])
    await mkdir(path.join(root, directory), { recursive: true })
  await writeFile(
    path.join(root, '.wrangler/deploy/config.json'),
    JSON.stringify({ configPath: '../../dist/worker/wrangler.json' }),
  )
  await writeFile(path.join(root, 'dist/worker/index.mjs'), FIXTURE_WORKER)
  await writeFile(
    path.join(root, 'dist/client/index.html'),
    '<!doctype html><title>Built fixture asset</title>',
  )
  await writeFile(
    path.join(root, '.dev.vars'),
    'GOOGLE_AUTH_CLIENT_SECRET=synthetic-parent-canary\n',
  )
  await writeFile(
    path.join(root, 'migrations/0001-fixture.sql'),
    invalidMigration
      ? 'THIS IS NOT VALID SQL;'
      : "CREATE TABLE fixture_state (value TEXT NOT NULL); INSERT INTO fixture_state VALUES ('real migration');",
  )
  const configPath = path.join(root, 'dist/worker/wrangler.json')
  const config = {
    main: './index.mjs',
    compatibility_date: '2026-09-09',
    compatibility_flags: ['nodejs_compat'],
    assets: {
      directory: '../client',
      binding: 'ASSETS',
      run_worker_first: ['/api/*', '/', '/privacy', '/terms'],
      not_found_handling: 'single-page-application',
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'gate-fixture',
        database_id: '00000000-0000-0000-0000-000000000001',
        migrations_dir: '../../migrations',
        remote: true,
      },
    ],
    r2_buckets: [{ binding: 'BUCKET', bucket_name: 'gate-fixture', remote: true }],
    ratelimits: [
      { name: 'TEST_RATE_LIMITER', namespace_id: '1001', simple: { limit: 10, period: 60 } },
    ],
    vars: { APP_ENV: 'production', GOOGLE_PICKER_API_KEY: 'synthetic-config-canary' },
  }
  await writeFile(configPath, JSON.stringify(config))
  return { root, config, configPath }
}

test('SDK gate uses real migrations, R2 and rate bindings with test-only configuration and owned cleanup', async (context) => {
  const { root } = await fixture(context)
  const gate = await startGateServer({ root, port: 0 })
  try {
    const response = await fetch(gate.origin + '/api/bindings')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      row: 'real migration',
      object: 'isolated bytes',
      limiter: true,
      appUrl: gate.origin,
      testSecret: true,
      inheritedSecrets: false,
    })
    const config = JSON.parse(await readFile(path.join(gate.directory, 'wrangler.json'), 'utf8'))
    assert.equal(config.d1_databases[0].remote, false)
    assert.equal(config.r2_buckets[0].remote, false)
    assert.equal(config.vars.APP_ENV, 'test')
    assert.equal(config.vars.GOOGLE_PICKER_API_KEY, undefined)
    const asset = await fetch(gate.origin + '/application-route')
    assert.equal(asset.status, 200)
    assert.equal(await asset.text(), '<!doctype html><title>Built fixture asset</title>')
    for (const pathname of ['/', '/privacy', '/terms', '/api/', '/api/missing']) {
      const routed = await fetch(gate.origin + pathname)
      assert.equal(routed.status, 404, `${pathname} must reach the actual Worker`)
      assert.equal(await routed.text(), 'fixture Worker rejection')
    }
    for (const pathname of ['/app/editor', '/privacy/', '/terms/', '/api']) {
      const routed = await fetch(gate.origin + pathname, {
        headers: { origin: 'https://foreign.example' },
      })
      assert.equal(routed.status, 200, `${pathname} must reach native assets`)
      assert.equal(await routed.text(), '<!doctype html><title>Built fixture asset</title>')
    }
    const encoded = await fetch(gate.origin + '/%61pi/health', { redirect: 'manual' })
    assert.equal(encoded.status, 307)
    assert.equal(encoded.headers.get('location'), '/api/health')
    await encoded.body?.cancel()
    for (const pathname of ['/api/missing', '/application-route']) {
      const rejected = await fetch(gate.origin + pathname, {
        method: 'POST',
        headers: { origin: 'https://foreign.example' },
        body: 'unread rejected body',
      })
      assert.equal(rejected.status, pathname.startsWith('/api/') ? 404 : 405)
      await rejected.text()
      const following = await fetch(gate.origin + '/api/health')
      assert.equal(following.status, 200)
      assert.deepEqual(await following.json(), { status: 'ok', environment: 'test' })
    }
  } finally {
    await gate.close()
  }
  assert.deepEqual(await readdir(path.join(root, 'temp/lumafoil-gates')), [])
  await assert.rejects(fetch(gate.origin + '/api/health'))
  assert.equal(
    await readFile(path.join(root, '.dev.vars'), 'utf8'),
    'GOOGLE_AUTH_CLIENT_SECRET=synthetic-parent-canary\n',
  )
})

test('malformed or escaping build configuration fails before a gate can start', async (context) => {
  const { root, config, configPath } = await fixture(context)
  await writeFile(configPath, JSON.stringify({ ...config, main: '../../outside.mjs' }))
  await writeFile(path.join(root, 'outside.mjs'), FIXTURE_WORKER)
  await assert.rejects(startGateServer({ root, port: 0 }), /escapes its allowed root/)
  await writeFile(configPath, JSON.stringify({ ...config, assets: {} }))
  await assert.rejects(startGateServer({ root, port: 0 }), { name: 'ZodError' })
  for (const patterns of [
    ['/api/*', '/', '/privacy', '!/terms'],
    ['/api/*', '/', '/privacy', '/terms', '/new/*'],
    ['/api/*', '/', '/privacy', '/privacy'],
  ]) {
    await writeFile(
      configPath,
      JSON.stringify({ ...config, assets: { ...config.assets, run_worker_first: patterns } }),
    )
    await assert.rejects(startGateServer({ root, port: 0 }), { name: 'ZodError' })
  }
  await assert.rejects(readdir(path.join(root, 'temp/lumafoil-gates')), { code: 'ENOENT' })
})

test('invalid D1 migration fails startup and closes its owned runtime and storage', async (context) => {
  const { root } = await fixture(context, { invalidMigration: true })
  await assert.rejects(startGateServer({ root, port: 0 }), /syntax error|SQLITE_ERROR/)
  assert.deepEqual(await readdir(path.join(root, 'temp/lumafoil-gates')), [])
})
