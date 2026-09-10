/** Real loopback HTTP exercises framing, cancellation and failure isolation at the SDK boundary. */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { test } from 'node:test'

import { createGateBridge } from './lib/gate-http-bridge.mjs'
import { loopbackRequest as request } from './lib/test-http-request.mjs'

function expectedFailure() {
  // Intentional client aborts and gateway failures are asserted through their result and signal.
}

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
        'Gate request failed (forwarding_failed; sdk_dispatch; unclassified).',
        'Gate request failed (forwarding_failed; response_headers; unclassified).',
      ],
    )
  } finally {
    await bridge.close()
  }
})

test('response chunks stream before completion and an unread client cancellation cancels only that request', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  const streamed = Promise.withResolvers()
  const cancelled = Promise.withResolvers()
  let requestSignal
  bridge.ready(async (url, init) => {
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
  }
})

test('an upload interrupted after dispatch aborts its body read and leaves the bridge usable', async (context) => {
  context.mock.method(console, 'error', expectedFailure)
  const bridge = await createGateBridge(0)
  const entered = Promise.withResolvers()
  const failed = Promise.withResolvers()
  bridge.ready(async (url, init) => {
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
