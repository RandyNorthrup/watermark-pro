import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:http2'
import { test } from 'node:test'
import { brotliDecompressSync, gzipSync } from 'node:zlib'

import { createAuditCertificate } from './lib/audit-certificate.mjs'
import { startCompressingProxy } from './lib/compressing-proxy.mjs'

test('audit proxy preserves real decoded HTML, private no-store responses, and same-origin request semantics', async () => {
  const requests = []
  const html =
    '<!doctype html><html lang="en"><title>Actual app</title><main>Visible page</main></html>'
  const upstream = createServer((request, response) => {
    requests.push({
      encoding: request.headers['accept-encoding'],
      origin: request.headers.origin,
      cookie: request.headers.cookie,
    })
    response.setHeader('content-type', 'text/html')
    response.setHeader('cache-control', 'no-store')
    response.setHeader('vary', 'Cookie, Accept-Language')
    if (request.headers['accept-encoding'] === 'identity') {
      response.end(html)
    } else {
      response.setHeader('content-encoding', 'gzip')
      response.end(gzipSync(html))
    }
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  assert.ok(address !== null && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const proxy = await startCompressingProxy({ upstream: origin, port: 0 })
  try {
    for (const pathname of ['/', '/api/me/example']) {
      const response = await fetch(proxy.origin + pathname, {
        headers: { 'accept-encoding': 'br', origin: proxy.origin, cookie: 'audit=synthetic' },
      })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), html)
      assert.equal(response.headers.get('content-encoding'), 'br')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.match(response.headers.get('vary'), /Cookie/)
      assert.match(response.headers.get('vary'), /Accept-Encoding/i)
    }
    await fetch(proxy.origin + '/api/me/example', { headers: { origin: 'https://other.example' } })
    assert.equal(requests.length, 3)
    assert.deepEqual(requests[0], { encoding: 'identity', origin, cookie: 'audit=synthetic' })
    assert.equal(requests[2].origin, 'https://other.example')
  } finally {
    await proxy.close()
    await new Promise((resolve) => upstream.close(resolve))
  }
})

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  return 'http://127.0.0.1:' + String(address.port)
}

async function http2Request(proxy, certificate, pathname, headers = {}, body = '') {
  const session = connect(proxy.origin, { ca: certificate.cert })
  try {
    return await new Promise((resolve, reject) => {
      session.once('error', reject)
      const request = session.request({ ':path': pathname, ...headers }, { endStream: false })
      const chunks = []
      let responseHeaders
      request.on('response', (value) => {
        responseHeaders = value
      })
      request.on('data', (chunk) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        const encoded = Buffer.concat(chunks)
        resolve({
          headers: responseHeaders,
          body:
            responseHeaders['content-encoding'] === 'br' ? brotliDecompressSync(encoded) : encoded,
          protocol: session.socket.alpnProtocol,
        })
      })
      request.on('error', reject)
      request.end(body)
    })
  } finally {
    session.close()
  }
}

function rawRequest(origin, pathname, headers = {}) {
  const url = new URL(origin)
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: pathname,
        headers,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => {
          chunks.push(chunk)
        })
        response.on('end', () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks) }),
        )
        response.on('error', reject)
      },
    )
    request.on('error', reject)
    request.end()
  })
}

async function readProxyBody(proxy, pathname) {
  const response = await fetch(proxy.origin + pathname, {
    headers: { 'accept-encoding': 'br' },
  })
  return await response.text()
}

test('HTTP2 TLS preserves POST bytes, status, security headers and cookies while stripping hop headers', async () => {
  const observed = []
  const cookieHeaders = ['one=1; Path=/; HttpOnly', 'two=2; Path=/; SameSite=Lax']
  const upstream = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => {
      chunks.push(chunk)
    })
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      observed.push({ url: request.url, headers: request.headers, body })
      response.writeHead(request.headers['x-status'] === 'foreign' ? 403 : 201, {
        'content-type': 'text/plain',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'cache-control': 'private, no-store',
        vary: 'Cookie',
        'set-cookie': cookieHeaders,
        connection: 'x-hop',
        'x-hop': 'not-forwarded',
        'x-preserved': 'exact-value',
      })
      response.end(body)
    })
  })
  const origin = await listen(upstream)
  const certificate = await createAuditCertificate()
  const proxy = await startCompressingProxy({ upstream: origin, port: 0, tls: certificate })
  try {
    const payload = Buffer.from('Exact bytes: \u{0}\u{FF}, JSON punctuation {[]} and newline\n')
    const response = await http2Request(
      proxy,
      certificate,
      '/api/example?retained=yes',
      {
        ':method': 'POST',
        origin: proxy.origin,
        cookie: 'audit=synthetic; second=2',
        'accept-encoding': 'br',
        'content-type': 'application/octet-stream',
      },
      payload,
    )
    assert.equal(response.protocol, 'h2')
    assert.equal(response.headers[':status'], 201)
    assert.deepEqual(response.body, payload)
    assert.equal(
      response.headers['content-security-policy'],
      "default-src 'none'; frame-ancestors 'none'",
    )
    assert.equal(response.headers['cache-control'], 'private, no-store')
    assert.deepEqual(response.headers['set-cookie'], cookieHeaders)
    assert.equal(response.headers['x-preserved'], 'exact-value')
    assert.equal(response.headers['x-hop'], undefined)
    assert.equal(response.headers.connection, undefined)
    assert.match(response.headers.vary, /Cookie/)
    assert.match(response.headers.vary, /Accept-Encoding/)
    assert.deepEqual(observed[0].body, payload)
    assert.equal(observed[0].url, '/api/example?retained=yes')
    assert.equal(observed[0].headers.origin, origin)
    assert.equal(observed[0].headers.cookie, 'audit=synthetic; second=2')
    assert.equal(observed[0].headers['accept-encoding'], 'identity')
    assert.equal(
      Object.keys(observed[0].headers).some((name) => name.startsWith(':')),
      false,
    )
    const foreign = await http2Request(
      proxy,
      certificate,
      '/api/example',
      {
        ':method': 'POST',
        origin: 'https://foreign.example',
        'x-status': 'foreign',
        'accept-encoding': 'br;q=0',
      },
      'blocked',
    )
    assert.equal(foreign.headers[':status'], 403)
    assert.equal(foreign.headers['content-encoding'], undefined)
    assert.equal(foreign.body.toString(), 'blocked')
    assert.equal(observed[1].headers.origin, 'https://foreign.example')
    const escaped = await http2Request(proxy, certificate, '//foreign.invalid/steal')
    assert.equal(escaped.headers[':status'], 400)
    assert.equal(observed.length, 2)
  } finally {
    await proxy.close()
    await certificate.dispose()
    await new Promise((resolve) => upstream.close(resolve))
  }
})

test('absolute and network-path targets cannot dispatch to another origin, and Host cannot authorize Origin rewriting', async () => {
  let trapped = 0
  const observedOrigins = []
  const upstream = createServer((request, response) => {
    observedOrigins.push(request.headers.origin)
    response.end('upstream')
  })
  const trap = createServer((_request, response) => {
    trapped += 1
    response.end('wrong upstream')
  })
  const origin = await listen(upstream)
  const trapOrigin = await listen(trap)
  const proxy = await startCompressingProxy({ upstream: origin, port: 0 })
  try {
    const embedded = new URL('/steal', origin)
    embedded.username = 'embedded'
    embedded.password = 'credentials'
    for (const target of [
      trapOrigin + '/steal',
      '//' + new URL(trapOrigin).host + '/steal',
      embedded.href,
    ]) {
      const response = await rawRequest(proxy.origin, target, { cookie: 'audit=synthetic' })
      assert.equal(response.status, 400)
    }
    assert.equal(trapped, 0)
    assert.equal(observedOrigins.length, 0)
    const valid = await rawRequest(proxy.origin, '/valid', { origin: proxy.origin })
    assert.equal(valid.status, 200)
    assert.equal(observedOrigins[0], origin)
    const forged = new URL(proxy.origin)
    forged.hostname = 'forged.example'
    forged.port = ''
    await rawRequest(proxy.origin, '/valid', { host: forged.host, origin: forged.origin })
    assert.equal(observedOrigins[1], forged.origin)
  } finally {
    await proxy.close()
    await new Promise((resolve) => upstream.close(resolve))
    await new Promise((resolve) => trap.close(resolve))
  }
})

test('asset compression caches are isolated between proxies and never reuse private responses', async () => {
  let privateReads = 0
  let publicReads = 0
  const makeUpstream = (name) =>
    createServer((request, response) => {
      response.setHeader('content-type', 'application/javascript')
      if (request.url.includes('private') || request.url.includes('cookie')) {
        privateReads += 1
        if (request.url.includes('private'))
          response.setHeader('cache-control', 'private, no-store')
        else response.setHeader('set-cookie', 'audit=synthetic; Path=/; HttpOnly')
        response.end(name + ':' + String(privateReads))
      } else {
        publicReads += 1
        response.end(name)
      }
    })
  const firstServer = makeUpstream('first')
  const secondServer = makeUpstream('second')
  const firstOrigin = await listen(firstServer)
  const secondOrigin = await listen(secondServer)
  const first = await startCompressingProxy({ upstream: firstOrigin, port: 0 })
  const second = await startCompressingProxy({ upstream: secondOrigin, port: 0 })
  try {
    assert.equal(await readProxyBody(first, '/assets/shared.js'), 'first')
    assert.equal(await readProxyBody(first, '/assets/shared.js'), 'first')
    assert.equal(publicReads, 1)
    assert.equal(await readProxyBody(second, '/assets/shared.js'), 'second')
    assert.equal(publicReads, 2)
    assert.equal(await readProxyBody(first, '/assets/private.js'), 'first:1')
    assert.equal(await readProxyBody(first, '/assets/private.js'), 'first:2')
    assert.equal(await readProxyBody(first, '/assets/cookie.js'), 'first:3')
    assert.equal(await readProxyBody(first, '/assets/cookie.js'), 'first:4')
  } finally {
    await first.close()
    await second.close()
    await new Promise((resolve) => firstServer.close(resolve))
    await new Promise((resolve) => secondServer.close(resolve))
  }
})

test('HTTP2 proxy survives a caller disconnect while an upstream response is pending', async () => {
  const started = Promise.withResolvers()
  const release = Promise.withResolvers()
  const upstream = createServer(async (request, response) => {
    if (request.url === '/pending') {
      started.resolve()
      await release.promise
    }
    response.setHeader('content-type', 'text/plain')
    response.end('healthy')
  })
  const origin = await listen(upstream)
  const certificate = await createAuditCertificate()
  const proxy = await startCompressingProxy({ upstream: origin, port: 0, tls: certificate })
  const client = connect(proxy.origin, { ca: certificate.cert })
  try {
    const request = client.request({ ':path': '/pending' })
    request.on('error', (error) => {
      assert.match(error.code, /ERR_HTTP2|ECONNRESET/)
    })
    request.end()
    await started.promise
    client.destroy()
    release.resolve()
    const healthy = await http2Request(proxy, certificate, '/healthy')
    assert.equal(healthy.headers[':status'], 200)
    assert.equal(healthy.body.toString(), 'healthy')
  } finally {
    release.resolve()
    client.destroy()
    await proxy.close()
    await certificate.dispose()
    await new Promise((resolve) => upstream.close(resolve))
  }
})
