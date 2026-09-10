/** A certificate exception is restricted to the run's exact public key, never global trust. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { createAuditCertificate } from './lib/audit-certificate.mjs'
import { startCompressingProxy } from './lib/compressing-proxy.mjs'

test('owned Chromium accepts the pinned HTTP2 certificate and rejects a different untrusted key', async () => {
  const upstream = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><title>Loopback TLS proof</title><main>Real proxy response</main>')
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  assert.ok(address !== null && typeof address !== 'string')
  const origin = 'http://127.0.0.1:' + String(address.port)
  const trusted = await createAuditCertificate()
  const wrong = await createAuditCertificate()
  const correctProxy = await startCompressingProxy({ upstream: origin, port: 0, tls: trusted })
  const wrongProxy = await startCompressingProxy({ upstream: origin, port: 0, tls: wrong })
  let context
  try {
    assert.notEqual(trusted.browserFlag, wrong.browserFlag)
    assert.match(trusted.browserFlag, /^--ignore-certificate-errors-spki-list=/)
    context = await chromium.launchPersistentContext(path.join(trusted.directory, 'browser'), {
      headless: true,
      args: [trusted.browserFlag],
    })
    const page = await context.newPage()
    const response = await page.goto(correctProxy.origin)
    assert.equal(response.status(), 200)
    assert.equal(await page.locator('main').textContent(), 'Real proxy response')
    assert.equal(
      await page.evaluate(() => performance.getEntriesByType('navigation')[0].nextHopProtocol),
      'h2',
    )
    const rejected = await context.newPage()
    await assert.rejects(rejected.goto(wrongProxy.origin), /ERR_CERT_AUTHORITY_INVALID/)
    await rejected.close()
    const back = await page.reload()
    assert.equal(back.status(), 200)
  } finally {
    await context?.close()
    await correctProxy.close()
    await wrongProxy.close()
    await trusted.dispose()
    await wrong.dispose()
    await new Promise((resolve) => upstream.close(resolve))
  }
})
