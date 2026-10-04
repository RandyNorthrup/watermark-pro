/** Real SDK startup checks use disposable built fixtures and isolated D1/R2 state. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { createTestHarness } from 'wrangler'

import { GATE_WORKER_PATTERNS } from './lib/gate-routing.mjs'
import { startGateServer } from './lib/gate-runtime.mjs'

const STREAM_OBSERVATION_TIMEOUT_MS = 5000
const STATIC_RESPONSE_BYTES = 2 * 1024 * 1024

const FIXTURE_WORKER = `export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/api/health') return Response.json({ status: 'ok', environment: env.APP_ENV })
    if (pathname === '/api/deny') return new Response('forbidden', { status: 403 })
    if (pathname === '/api/request') {
      const headers = new Headers({ 'cache-control': 'private, no-store' })
      headers.append('set-cookie', 'first=1; Path=/; HttpOnly')
      headers.append('set-cookie', 'second=2; Path=/; SameSite=Lax')
      return Response.json({
        url: request.url,
        origin: request.headers.get('origin'),
        account: request.headers.get('x-lumafoil-account-id'),
        cookie: request.headers.get('cookie'),
        internal: Array.from(request.headers.keys()).filter(name => name.startsWith('mf-')),
        body: await request.text(),
      }, { headers })
    }
    if (pathname === '/api/redirect') return new Response(null, {
      status: 302, headers: { location: env.APP_URL + '/api/request?preserved=yes' },
    })
    if (pathname === '/api/stream') return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('first live chunk')) },
    }))
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
  await mkdir('temp', { recursive: true })
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
      run_worker_first: GATE_WORKER_PATTERNS,
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

test('public SDK debug distinguishes a healthy proxy listener request from named runtime dispatch', async (context) => {
  const { root, configPath } = await fixture(context)
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const workerName = 'sdk-contract-fixture'
  // Only controlled fixture requests run here; all SDK debug output stays captured.
  const output = context.mock.method(console, 'log', () => {
    // SDK debug output is captured for assertions without publishing it.
  })
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
  // Retain the fixture config's relative paths while refusing all remote bindings.
  await writeFile(
    configPath,
    JSON.stringify({
      ...config,
      name: workerName,
      vars: { APP_ENV: 'test' },
      d1_databases: config.d1_databases.map((binding) => ({ ...binding, remote: false })),
      r2_buckets: config.r2_buckets.map((binding) => ({ ...binding, remote: false })),
    }),
  )
  const harness = createTestHarness({ root, workers: [{ configPath }] })
  try {
    const listener = await harness.listen()
    const target = new URL('/api/health', listener.url).href
    const proxy = await fetch(target, { redirect: 'manual' })
    assert.equal(proxy.status, 200)
    assert.deepEqual(await proxy.json(), { status: 'ok', environment: 'test' })
    harness.debug()
    const baseline = output.mock.calls.at(-1)?.arguments
    assert.equal(baseline?.length, 1)
    assert.equal(typeof baseline[0], 'string')
    const workerTag = `[server] [${workerName}] `
    const requestContext = `fetch - GET ${target}`
    assert.equal(baseline[0].includes(workerTag + requestContext), false)
    const direct = await harness.getWorker(workerName).fetch(target, { redirect: 'manual' })
    assert.equal(direct.status, 200)
    assert.deepEqual(await direct.json(), { status: 'ok', environment: 'test' })
    harness.debug()
    const completed = output.mock.calls.at(-1)?.arguments
    assert.equal(completed?.length, 1)
    assert.equal(typeof completed[0], 'string')
    const requestEntries = completed[0]
      .split('\n')
      .filter((line) => line.includes(workerTag + requestContext))
      .map((line) => line.slice(line.indexOf(workerTag)))
    assert.deepEqual(requestEntries, [
      `${workerTag}${requestContext} - started`,
      `${workerTag}${requestContext} - 200`,
    ])
    assert.equal(completed[0].includes('synthetic-parent-canary'), false)
  } finally {
    await harness.close()
  }
})

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
    const echoed = await fetch(gate.origin + '/api/request?preserved=yes', {
      method: 'POST',
      headers: {
        origin: 'https://foreign.example',
        'x-lumafoil-account-id': 'account-a',
        cookie: 'session=synthetic',
        'mf-original-url': 'https://forged.example/api/private',
        'mf-probe': 'forged',
        'mf-route-override': 'lumafoil-local-gates',
      },
      body: 'Exact bytes \u{0} ©',
    })
    assert.equal(echoed.status, 200)
    assert.deepEqual(await echoed.json(), {
      url: gate.origin + '/api/request?preserved=yes',
      origin: 'https://foreign.example',
      account: 'account-a',
      cookie: 'session=synthetic',
      internal: [],
      body: 'Exact bytes \u{0} ©',
    })
    assert.deepEqual(echoed.headers.getSetCookie(), [
      'first=1; Path=/; HttpOnly',
      'second=2; Path=/; SameSite=Lax',
    ])
    assert.equal(echoed.headers.get('cache-control'), 'private, no-store')
    const redirect = await fetch(gate.origin + '/api/redirect', { redirect: 'manual' })
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), gate.origin + '/api/request?preserved=yes')
    const stream = await fetch(gate.origin + '/api/stream', {
      signal: AbortSignal.timeout(STREAM_OBSERVATION_TIMEOUT_MS),
    })
    const reader = stream.body.getReader()
    const first = await reader.read()
    assert.equal(first.done, false)
    assert.equal(new TextDecoder().decode(first.value), 'first live chunk')
    await reader.cancel()
    const afterStream = await fetch(gate.origin + '/api/health')
    assert.equal(afterStream.status, 200)
    await afterStream.text()
    const rejectedUpload = await fetch(gate.origin + '/api/deny', {
      method: 'POST',
      headers: { origin: 'https://foreign.example' },
      body: 'unread rejected body'.repeat(4096),
    })
    assert.equal(rejectedUpload.status, 403)
    assert.equal(await rejectedUpload.text(), 'forbidden')
    const afterRejection = await fetch(gate.origin + '/api/health')
    assert.equal(afterRejection.status, 200)
    assert.deepEqual(await afterRejection.json(), { status: 'ok', environment: 'test' })
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
    for (const pathname of [
      '/app/editor',
      '/privacy/',
      '/terms/',
      '/api',
      '/oauth/microsoft-other',
      '/oauth/dropbox',
    ]) {
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

test('static asset cancellation leaves its sibling and following SDK responses intact', async (context) => {
  // The deliberate client cancellation must not publish request details.
  context.mock.method(console, 'error', () => {
    // Suppress expected client-cancellation diagnostics to keep request details private.
  })
  const { root } = await fixture(context)
  const assets = path.join(root, 'dist/client/assets')
  await mkdir(assets)
  const payload = Buffer.alloc(STATIC_RESPONSE_BYTES, 'gate static fixture')
  await writeFile(path.join(assets, 'shared.bin'), payload)
  const realFetch = fetch
  const staticOrigins = []
  // Observe actual transport calls without replacing responses or request options.
  context.mock.method(globalThis, 'fetch', (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.pathname === '/assets/shared.bin') staticOrigins.push(url.origin)
    return realFetch(input, init)
  })
  const gate = await startGateServer({ root, port: 0 })
  try {
    const target = gate.origin + '/assets/shared.bin'
    const [cancelled, sibling] = await Promise.all([
      fetch(target, { headers: { 'cache-control': 'no-cache', cookie: 'session=synthetic' } }),
      fetch(target, { headers: { 'accept-encoding': 'identity' } }),
    ])
    assert.equal(cancelled.status, 200)
    assert.equal(sibling.status, 200)
    const reader = cancelled.body.getReader()
    const first = await reader.read()
    assert.equal(first.done, false)
    assert.ok(first.value.byteLength < payload.length)
    await reader.cancel()
    const whole = Buffer.from(await sibling.arrayBuffer())
    assert.equal(whole.length, payload.length)
    assert.equal(Buffer.compare(whole, payload), 0)
    const following = await fetch(target)
    assert.equal(following.status, 200)
    const followingBytes = Buffer.from(await following.arrayBuffer())
    assert.equal(Buffer.compare(followingBytes, payload), 0)
    // The removed listener path adds a second, distinct origin for each static call.
    assert.deepEqual(staticOrigins, [gate.origin, gate.origin, gate.origin])
  } finally {
    await gate.close()
  }
  assert.deepEqual(await readdir(path.join(root, 'temp/lumafoil-gates')), [])
})

test('malformed or escaping build configuration fails before a gate can start', async (context) => {
  const { root, config, configPath } = await fixture(context)
  await writeFile(configPath, JSON.stringify({ ...config, main: '../../outside.mjs' }))
  await writeFile(path.join(root, 'outside.mjs'), FIXTURE_WORKER)
  await assert.rejects(startGateServer({ root, port: 0 }), /escapes its allowed root/)
  await writeFile(configPath, JSON.stringify({ ...config, assets: {} }))
  await assert.rejects(startGateServer({ root, port: 0 }), { name: 'ZodError' })
  for (const patterns of [
    GATE_WORKER_PATTERNS.slice(0, -1),
    [...GATE_WORKER_PATTERNS, '/new/*'],
    [...GATE_WORKER_PATTERNS.slice(0, -1), GATE_WORKER_PATTERNS[0]],
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
