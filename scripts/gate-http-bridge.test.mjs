/** Real loopback HTTP exercises framing, cancellation and failure isolation at the SDK boundary. */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { test } from 'node:test'

import {
  classifyGateFailure,
  createGateBridge,
  createNativeGateDispatcher,
} from './lib/gate-http-bridge.mjs'
import gateRouter from './lib/gate-router-worker.mjs'
import { loopbackRequest as request } from './lib/test-http-request.mjs'

function expectedFailure() {
  // Intentional client aborts and gateway failures are asserted through their result and signal.
}

test('native listener restores trusted URL and preserves Origin, account, bytes and cookies while stripping forged routing headers', async () => {
  const bridge = await createGateBridge(0)
  const listener = await createGateBridge(0)
  const cookies = ['first=1; Path=/; HttpOnly', 'second=2; Path=/; SameSite=Lax']
  const inspectRequest = (destination) => ({
    async fetch(request) {
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
      })
      for (const cookie of cookies) headers.append('set-cookie', cookie)
      return Response.json(
        {
          destination,
          url: request.url,
          origin: request.headers.get('origin'),
          account: request.headers.get('x-lumafoil-account-id'),
          cookie: request.headers.get('cookie'),
          internal: request.headers
            .keys()
            .filter((name) => name.startsWith('mf-'))
            .toArray(),
          body: await request.text(),
        },
        { headers },
      )
    },
  })
  listener.ready((url, init) =>
    gateRouter.fetch(new Request(url, init), {
      GATE_ORIGIN: bridge.origin,
      APP: inspectRequest('worker'),
      ASSETS: inspectRequest('assets'),
    }),
  )
  bridge.ready(createNativeGateDispatcher(listener.origin))
  try {
    for (const [pathname, destination] of [
      ['/api/echo?preserved=yes', 'worker'],
      ['/app/editor?preserved=yes', 'assets'],
    ]) {
      const response = await request(
        bridge.origin,
        pathname,
        {
          method: 'POST',
          headers: {
            origin: 'https://foreign.example',
            'x-lumafoil-account-id': 'account-a',
            cookie: 'session=synthetic',
            'mf-original-url': 'https://forged.example/api/private',
            'mf-probe': 'untrusted',
            'mf-route-override': 'other-worker',
          },
        },
        'Exact bytes \u{0} ©',
      )
      assert.equal(response.status, 200)
      assert.deepEqual(JSON.parse(response.bytes), {
        destination,
        url: bridge.origin + pathname,
        origin: 'https://foreign.example',
        account: 'account-a',
        cookie: 'session=synthetic',
        internal: [],
        body: 'Exact bytes \u{0} ©',
      })
      assert.deepEqual(response.headers['set-cookie'], cookies)
      assert.equal(response.headers['cache-control'], 'private, no-store')
    }
  } finally {
    await bridge.close()
    await listener.close()
  }
})

test('native listener refuses remote origins, credentials and non-origin URLs', () => {
  const remote = new URL('http://127.0.0.1/')
  remote.hostname = 'remote.example'
  for (const url of [
    'https://127.0.0.1/',
    remote,
    'http://user@127.0.0.1/',
    'http://user:password@127.0.0.1/',
    'http://127.0.0.1/path',
    'http://127.0.0.1/?query=value',
    'http://127.0.0.1/#fragment',
  ])
    assert.throws(() => createNativeGateDispatcher(url), /plain loopback HTTP origin/)
  for (const url of ['http://127.0.0.1:1234/', 'http://localhost:1234/', 'http://[::1]:1234/'])
    assert.equal(typeof createNativeGateDispatcher(url), 'function')
})

async function expectStatus(origin, pathname, status, options = {}, body) {
  const response = await request(origin, pathname, options, body)
  assert.equal(response.status, status)
}

test('readiness is a failure until a dispatcher exists, then exact POST bytes, Origin and cookies survive', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  const payload = Buffer.from('Bytes: \u{0}\u{FF} and JSON {"value":true}\n')
  const observed = []
  const cookies = [
    'one=1; Path=/; HttpOnly',
    'two=2; Expires=Wed, 21 Oct 2037 07:28:00 GMT; SameSite=Lax',
  ]
  try {
    const unready = await request(bridge.origin, '/api/health')
    assert.equal(unready.status, 503)
    bridge.ready(async (url, init) => {
      const bytes = Buffer.from(await new Response(init.body).arrayBuffer())
      observed.push({
        url: url.pathname + url.search,
        headers: init.headers,
        redirect: init.redirect,
        bytes,
      })
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.length),
        'content-security-policy': "default-src 'none'",
        'cache-control': 'private, no-store',
        connection: 'x-response-hop',
        'x-response-hop': 'removed',
      })
      for (const cookie of cookies) headers.append('set-cookie', cookie)
      return new Response(bytes, { status: 201, headers })
    })
    const response = await request(
      bridge.origin,
      '/api/example?preserved=yes',
      {
        method: 'POST',
        headers: {
          origin: 'https://foreign.example',
          cookie: 'account=synthetic; second=value',
          'content-type': 'application/octet-stream',
          'content-length': String(payload.length),
          'accept-encoding': 'br, gzip',
          connection: 'x-hop',
          'x-hop': 'removed',
        },
      },
      payload,
    )
    assert.equal(observed.length, 1)
    assert.equal(observed[0].url, '/api/example?preserved=yes')
    assert.equal(observed[0].headers.get('origin'), 'https://foreign.example')
    assert.equal(observed[0].headers.get('cookie'), 'account=synthetic; second=value')
    assert.equal(observed[0].headers.get('accept-encoding'), 'identity')
    assert.equal(observed[0].headers.get('x-hop'), null)
    assert.equal(observed[0].redirect, 'manual')
    assert.deepEqual(observed[0].bytes, payload)
    assert.equal(response.status, 201)
    assert.deepEqual(response.bytes, payload)
    assert.deepEqual(response.headers['set-cookie'], cookies)
    assert.equal(response.headers['content-length'], String(payload.length))
    assert.equal(response.headers['content-security-policy'], "default-src 'none'")
    assert.equal(response.headers['cache-control'], 'private, no-store')
    assert.equal(response.headers['x-response-hop'], undefined)
  } finally {
    await bridge.close()
  }
})

test('dispatcher exceptions and mislabeled encoded responses fail without killing subsequent requests', async (context) => {
  const diagnostic = context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  bridge.ready(async (url) => {
    if (url.pathname === '/throw') throw new Error('Synthetic SDK failure')
    if (url.pathname === '/encoded')
      return new Response('already decoded', { headers: { 'content-encoding': 'gzip' } })
    return new Response('still alive')
  })
  try {
    for (const pathname of ['/throw', '/encoded']) {
      const failed = await request(bridge.origin, pathname)
      assert.equal(failed.status, 502)
      assert.deepEqual(JSON.parse(failed.bytes), { error: 'gate_request_failed' })
      assert.equal(failed.headers['content-encoding'], undefined)
      const next = await request(bridge.origin, '/healthy')
      assert.equal(next.status, 200)
      assert.equal(next.bytes.toString(), 'still alive')
    }
    assert.deepEqual(
      diagnostic.mock.calls.map((call) => call.arguments[0]),
      [
        'Gate request failed (forwarding_failed; runtime_dispatch; unclassified).',
        'Gate request failed (forwarding_failed; response_headers; response_encoding_mismatch).',
      ],
    )
  } finally {
    await bridge.close()
  }
})

test('response chunks stream before completion and an unread client cancellation cancels only that request', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  const listener = await createGateBridge(0)
  const streamed = Promise.withResolvers()
  const cancelled = Promise.withResolvers()
  let requestSignal
  listener.ready(async (url, init) => {
    if (url.pathname === '/healthy') return new Response('still alive')
    requestSignal = init.signal
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('first live chunk'))
          streamed.resolve()
        },
        cancel() {
          cancelled.resolve()
        },
      }),
    )
  })
  bridge.ready(createNativeGateDispatcher(listener.origin))
  try {
    const url = new URL(bridge.origin)
    const received = Promise.withResolvers()
    const client = httpRequest(
      { hostname: '127.0.0.1', port: url.port, path: '/stream', headers: { host: url.host } },
      (response) => {
        response.once('data', (chunk) => {
          received.resolve(chunk.toString())
          client.destroy()
        })
        response.on('error', expectedFailure)
      },
    )
    client.on('error', expectedFailure)
    client.end()
    await streamed.promise
    assert.equal(await received.promise, 'first live chunk')
    await cancelled.promise
    assert.equal(requestSignal.aborted, true)
    const healthy = await request(bridge.origin, '/healthy')
    assert.equal(healthy.status, 200)
    assert.equal(healthy.bytes.toString(), 'still alive')
  } finally {
    await bridge.close()
    await listener.close()
  }
})

test('an upload interrupted after dispatch aborts its body read and leaves the bridge usable', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  const listener = await createGateBridge(0)
  const entered = Promise.withResolvers()
  const failed = Promise.withResolvers()
  listener.ready(async (url, init) => {
    if (url.pathname === '/healthy') return new Response('still alive')
    entered.resolve()
    try {
      await new Response(init.body).arrayBuffer()
      assert.fail('A truncated upload cannot finish as a valid request')
    } catch (error) {
      failed.resolve(init.signal.aborted)
      throw error
    }
  })
  bridge.ready(createNativeGateDispatcher(listener.origin))
  try {
    const url = new URL(bridge.origin)
    const client = httpRequest({
      hostname: '127.0.0.1',
      port: url.port,
      path: '/upload',
      method: 'POST',
      headers: { host: url.host, 'content-length': '1000000' },
    })
    client.on('error', expectedFailure)
    client.write('partial body')
    await entered.promise
    client.destroy()
    assert.equal(await failed.promise, true)
    await expectStatus(bridge.origin, '/healthy', 200)
  } finally {
    await bridge.close()
    await listener.close()
  }
})

test('foreign targets, forged Host and GET bodies are refused before SDK dispatch', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  let calls = 0
  bridge.ready(async () => {
    calls++
    return new Response('valid')
  })
  try {
    for (const pathname of [
      'https://foreign.example/path',
      '//foreign.example/path',
      String.raw`/\foreign.example/path`,
    ])
      await expectStatus(bridge.origin, pathname, 400)
    await expectStatus(bridge.origin, '/valid', 400, { headers: { host: 'forged.example' } })
    await expectStatus(
      bridge.origin,
      '/valid',
      400,
      { method: 'GET', headers: { 'content-length': '4' } },
      'body',
    )
    assert.equal(calls, 0)
    await expectStatus(bridge.origin, '/valid', 200)
    assert.equal(calls, 1)
    const port = Number(new URL(bridge.origin).port)
    await assert.rejects(createGateBridge(port), /EADDRINUSE/)
    await expectStatus(bridge.origin, '/valid', 200)
  } finally {
    await bridge.close()
  }
})

test('finite SDK diagnostics identify nested transport, fetch-policy and I/O failures without leaking arbitrary text', async (context) => {
  const canary = randomBytes(32).toString('hex')
  const cases = [
    [
      new TypeError('fetch failed', {
        cause: Object.assign(new Error(canary), { code: 'UND_ERR_HEADERS_TIMEOUT' }),
      }),
      'UND_ERR_HEADERS_TIMEOUT',
    ],
    [
      Object.assign(new Error(canary), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
      'UND_ERR_CONNECT_TIMEOUT',
    ],
    [Object.assign(new Error(canary), { code: 'UND_ERR_BODY_TIMEOUT' }), 'UND_ERR_BODY_TIMEOUT'],
    [
      new TypeError('fetch failed', {
        cause: Object.assign(new Error(canary), { code: 'EADDRINUSE' }),
      }),
      'EADDRINUSE',
    ],
    [
      new TypeError('fetch failed', { cause: new Error('unexpected redirect') }),
      'unexpected_redirect',
    ],
    [
      new TypeError("'only-if-cached' can be set only with 'same-origin' mode"),
      'invalid_cache_mode',
    ],
    [new TypeError('Body is unusable: Body has already been read'), 'body_already_read'],
    [
      new TypeError(`Cannot perform I/O on behalf of a different request. ${canary}`),
      'cross_request_io',
    ],
    [new DOMException(canary, 'AbortError'), 'abort_error'],
    [Object.assign(new TypeError(canary), { code: canary }), 'type_error'],
  ]
  const diagnostic = context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  let failure
  bridge.ready(async () => {
    throw failure
  })
  try {
    for (const [error, classification] of cases) {
      failure = error
      assert.equal(classifyGateFailure(error), classification)
      const response = await request(bridge.origin, '/diagnostic')
      assert.equal(response.status, 502)
      assert.equal(response.bytes.toString(), '{"error":"gate_request_failed"}')
      const logged = diagnostic.mock.calls.at(-1).arguments
      assert.deepEqual(logged, [
        `Gate request failed (forwarding_failed; runtime_dispatch; ${classification}).`,
      ])
      assert.equal(JSON.stringify(logged).includes(canary), false)
    }
    const cycle = { message: canary, cause: null }
    cycle.cause = cycle
    assert.equal(classifyGateFailure(cycle), 'unclassified')
    const inaccessible = Object.defineProperty({}, 'cause', {
      get() {
        throw new Error(canary)
      },
    })
    assert.equal(classifyGateFailure(inaccessible), 'unclassified')
    assert.equal(classifyGateFailure(canary), 'unclassified')
  } finally {
    await bridge.close()
  }
})
