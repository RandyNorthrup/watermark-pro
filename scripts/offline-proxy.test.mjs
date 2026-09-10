/** Real HTTP and CONNECT traffic proves outage scope, byte preservation and same-port recovery. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { expect, request } from '@playwright/test'

import { createOfflineProxy } from './lib/offline-proxy.mjs'
import { loopbackRequest } from './lib/test-http-request.mjs'

async function upstreamServer(handler) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  let closing
  return {
    origin: `http://127.0.0.1:${String(server.address().port)}`,
    async close() {
      closing ??= new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
      await closing
    },
  }
}

function through(proxy, target, { headers = {}, method = 'GET', body } = {}) {
  return loopbackRequest(proxy, target, { host: new URL(target).host, headers, method }, body)
}

test('exact-origin forwarding preserves raw POST bytes, Origin, cookie and separate response cookies', async () => {
  const payload = Buffer.from([0, 1, 2, 100, 255])
  const received = []
  const cookies = ['one=1; HttpOnly', 'two=2; Expires=Wed, 21 Oct 2037 07:28:00 GMT']
  const upstream = await upstreamServer((incoming, outgoing) => {
    const chunks = []
    incoming.on('data', (chunk) => {
      chunks.push(chunk)
    })
    incoming.on('end', () => {
      received.push({ headers: incoming.headers, bytes: Buffer.concat(chunks), path: incoming.url })
      outgoing.writeHead(201, {
        'set-cookie': cookies,
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length),
        'cache-control': 'private, no-store',
      })
      outgoing.end(payload)
    })
  })
  const proxy = await createOfflineProxy(upstream.origin)
  try {
    const response = await through(proxy.origin, `${upstream.origin}/write?exact=yes`, {
      method: 'POST',
      headers: { origin: 'https://foreign.example', cookie: 'session=synthetic' },
      body: payload,
    })
    assert.equal(response.status, 201)
    assert.deepEqual(response.bytes, payload)
    assert.deepEqual(response.headers['set-cookie'], cookies)
    assert.equal(response.headers['cache-control'], 'private, no-store')
    assert.equal(received.length, 1)
    assert.equal(received[0].path, '/write?exact=yes')
    assert.equal(received[0].headers.origin, 'https://foreign.example')
    assert.equal(received[0].headers.cookie, 'session=synthetic')
    assert.deepEqual(received[0].bytes, payload)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})

test('disconnect breaks HTTP and exact-gate CONNECT while the independent observer and same-port reconnect work', async () => {
  const upstream = await upstreamServer((_incoming, outgoing) => outgoing.end('real gate'))
  const proxy = await createOfflineProxy(upstream.origin)
  const client = await request.newContext({
    baseURL: upstream.origin,
    proxy: { server: proxy.origin },
  })
  try {
    const initial = await client.get('/health')
    assert.equal(initial.status(), 200)
    assert.equal(await initial.text(), 'real gate')
    assert.ok(proxy.forwardedRequests > 0)
    const origin = proxy.origin
    const before = proxy.forwardedRequests
    proxy.setDisconnected(true)
    await assert.rejects(client.get('/health'))
    await assert.rejects(through(proxy.origin, `${upstream.origin}/health`))
    assert.equal(proxy.forwardedRequests, before)
    const observer = await fetch(`${upstream.origin}/health`)
    assert.equal(observer.status, 200)
    assert.equal(await observer.text(), 'real gate')
    proxy.setDisconnected(false)
    const restored = await client.get('/health')
    assert.equal(restored.status(), 200)
    assert.equal(await restored.text(), 'real gate')
    assert.equal(proxy.origin, origin)
    assert.ok(proxy.forwardedRequests > before)
    await upstream.close()
    await assert.rejects(through(proxy.origin, `${upstream.origin}/health`))
  } finally {
    await client.dispose()
    await proxy.close()
    await upstream.close()
  }
})

test('other origins and forged Host values are denied without upstream traffic', async () => {
  let calls = 0
  const upstream = await upstreamServer((_incoming, outgoing) => {
    calls++
    outgoing.end('allowed')
  })
  const proxy = await createOfflineProxy(upstream.origin)
  const foreign = await request.newContext({ proxy: { server: proxy.origin } })
  try {
    for (const target of ['https://foreign.example/path', 'http://127.0.0.1:1/path']) {
      const denied = await through(proxy.origin, target)
      assert.equal(denied.status, 403)
      await assert.rejects(foreign.get(target))
    }
    const credentials = new URL(upstream.origin)
    credentials.username = 'synthetic'
    credentials.password = 'not-a-secret'
    for (const target of [credentials.href, `${upstream.origin}/allowed#fragment`]) {
      const denied = await through(proxy.origin, target)
      assert.equal(denied.status, 403)
    }
    const forged = await through(proxy.origin, `${upstream.origin}/allowed`, {
      headers: { host: 'foreign.example' },
    })
    assert.equal(forged.status, 403)
    assert.equal(calls, 0)
    assert.equal(proxy.forwardedRequests, 0)
    const allowed = await through(proxy.origin, `${upstream.origin}/allowed`)
    assert.equal(allowed.status, 200)
    assert.equal(calls, 1)
  } finally {
    await foreign.dispose()
    await proxy.close()
    await upstream.close()
  }
})

test('one photo acknowledgement is lost only after the real201 completes; other writes and refusals stay visible', async () => {
  const photoPath = '/api/orgs/test-workspace/photos'
  const committed = Promise.withResolvers()
  let writes = 0
  const upstream = await upstreamServer((incoming, outgoing) => {
    const chunks = []
    incoming.on('data', (chunk) => {
      chunks.push(chunk)
    })
    incoming.on('end', () => {
      if (incoming.url !== photoPath) {
        outgoing.end('unrelated')
        return
      }
      if (Buffer.concat(chunks).toString() === 'refuse') {
        outgoing.writeHead(403)
        outgoing.end('real refusal')
        return
      }
      writes++
      outgoing.writeHead(201, { 'content-type': 'application/json' })
      if (writes === 1) {
        outgoing.write('{"stored":')
        committed.resolve(() => outgoing.end('true}'))
      } else outgoing.end('{"stored":true}')
    })
  })
  const proxy = await createOfflineProxy(upstream.origin)
  try {
    const drop = proxy.dropNextPhotoAcknowledgement(photoPath)
    const other = await through(proxy.origin, `${upstream.origin}/other`, {
      method: 'POST',
      body: 'other',
    })
    assert.equal(other.status, 200)
    assert.equal(drop.responseStatus, null)
    const first = through(proxy.origin, upstream.origin + photoPath, {
      method: 'POST',
      body: 'photo',
    })
    const finishAcknowledgement = await committed.promise
    await expect.poll(() => drop.responseStatus).toBe(201)
    assert.equal(drop.didDrop, false)
    assert.equal(writes, 1)
    finishAcknowledgement()
    await assert.rejects(first)
    await expect.poll(() => drop.didDrop).toBe(true)
    const replay = await through(proxy.origin, upstream.origin + photoPath, {
      method: 'POST',
      body: 'photo',
    })
    assert.equal(replay.status, 201)
    assert.deepEqual(JSON.parse(replay.bytes), { stored: true })
    assert.equal(writes, 2)
    const refusal = proxy.dropNextPhotoAcknowledgement(photoPath)
    const denied = await through(proxy.origin, upstream.origin + photoPath, {
      method: 'POST',
      body: 'refuse',
    })
    assert.equal(denied.status, 403)
    assert.equal(denied.bytes.toString(), 'real refusal')
    assert.equal(refusal.responseStatus, 403)
    assert.equal(refusal.didDrop, false)
  } finally {
    await proxy.close()
    await upstream.close()
  }
})
