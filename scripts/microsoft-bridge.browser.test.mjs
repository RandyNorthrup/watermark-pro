import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import AxeAccessibilityBuilder from '@axe-core/playwright'
import { chromium, webkit } from '@playwright/test'

import { buildMicrosoftBridge } from './build-microsoft-bridge.mjs'

const ORIGIN = 'https://bridge.example.test'
const OTHER_ORIGIN = 'https://other.example.test'
const TIMEOUT_MS = 3000
const FIXTURE_DOCUMENT =
  '<!doctype html><html lang="en"><title>Bridge receiver</title><main><h1>Receiver</h1></main></html>'
const BRIDGE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
}
const fixture = { directory: '', html: '', script: '' }

before(async () => {
  fixture.directory = await mkdtemp(path.join(os.tmpdir(), 'lumafoil-msal-bridge-'))
  await buildMicrosoftBridge(fixture.directory)
  fixture.html = await readFile(path.join(fixture.directory, 'microsoft.html'), 'utf8')
  fixture.script = await readFile(path.join(fixture.directory, 'microsoft-bridge.js'), 'utf8')
  assert.ok(fixture.html.includes('/oauth/microsoft-bridge.js'))
  assert.ok(fixture.html.includes('id="microsoft-redirect-bridge"'))
  assert.ok(!fixture.html.includes('id="root"'), 'The callback must not boot the application')
  assert.ok(!fixture.script.includes('import('), 'The bridge must be a self-contained SDK bundle')
  const headers = await readFile('public/_headers', 'utf8')
  assert.match(
    headers,
    /frame-src 'self'/,
    'The application must permit its own silent callback frame',
  )
})

after(async () => {
  if (fixture.directory === '') return
  const target = await realpath(fixture.directory)
  const parent = await realpath(os.tmpdir())
  assert.equal(path.dirname(target), parent)
  assert.ok(path.basename(target).startsWith('lumafoil-msal-bridge-'))
  await rm(target, { recursive: true, force: true })
})

function responseQuery(id, interactionType = 'popup') {
  const state = Buffer.from(JSON.stringify({ id, meta: { interactionType } })).toString('base64')
  return new URLSearchParams({ code: 'synthetic-provider-code', state }).toString()
}

async function receiver(page, id) {
  await page.evaluate((channelId) => {
    const output = globalThis.document.createElement('output')
    output.id = 'bridge-responses'
    output.textContent = '[]'
    const channel = new BroadcastChannel(channelId)
    channel.addEventListener('message', (event) => {
      const responses = JSON.parse(output.textContent ?? '[]')
      responses.push(event.data)
      output.textContent = JSON.stringify(responses)
    })
    output.addEventListener('remove', () => channel.close())
    globalThis.document.body.append(output)
  }, id)
}

async function responses(page) {
  return await page
    .locator('#bridge-responses')
    .evaluate((element) => JSON.parse(element.textContent ?? '[]'))
}

async function setup(browserType) {
  const browser = await browserType.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (![ORIGIN, OTHER_ORIGIN].includes(url.origin)) return await route.abort()
    if (url.pathname === '/oauth/microsoft-bridge.js')
      return await route.fulfill({
        contentType: 'text/javascript',
        body: fixture.script,
        headers: BRIDGE_HEADERS,
      })
    if (url.pathname === '/oauth/microsoft')
      return await route.fulfill({
        contentType: 'text/html',
        body: fixture.html,
        headers: BRIDGE_HEADERS,
      })
    if (url.pathname === '/')
      return await route.fulfill({
        contentType: 'text/html',
        body: FIXTURE_DOCUMENT,
        headers: { 'content-security-policy': "default-src 'self'; frame-src 'self'" },
      })
    return await route.abort()
  })
  const page = await context.newPage()
  await page.goto(ORIGIN)
  return { browser, context, page }
}

async function waitForBroadcast(page) {
  await page.waitForFunction(
    () =>
      JSON.parse(globalThis.document.querySelector('#bridge-responses')?.textContent ?? '[]')
        .length === 1,
    undefined,
    { timeout: TIMEOUT_MS },
  )
}

for (const [name, browserType] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  test(`${name}: official SDK broadcasts popup response only to the matching same-origin channel`, async () => {
    const { browser, context, page } = await setup(browserType)
    try {
      const id = randomUUID()
      const other = await context.newPage()
      await other.goto(OTHER_ORIGIN)
      await receiver(page, id)
      await receiver(other, id)
      const query = responseQuery(id)
      const pending = page.waitForEvent('popup')
      await page.evaluate((url) => globalThis.open(url), `${ORIGIN}/oauth/microsoft?${query}`)
      const popup = await pending
      await waitForBroadcast(page)
      assert.deepEqual(await responses(page), [{ v: 1, payload: query }])
      assert.deepEqual(await responses(other), [])
      if (!popup.isClosed()) await popup.waitForEvent('close', { timeout: TIMEOUT_MS })
    } finally {
      await browser.close()
    }
  })

  test(`${name}: silent iframe relays the response, scrubs its URL and leaves the parent alive`, async () => {
    const { browser, page } = await setup(browserType)
    try {
      const id = randomUUID()
      await receiver(page, id)
      const query = responseQuery(id, 'silent')
      await page.evaluate((url) => {
        const frame = globalThis.document.createElement('iframe')
        frame.src = url
        globalThis.document.body.append(frame)
      }, `${ORIGIN}/oauth/microsoft#${query}`)
      await waitForBroadcast(page)
      assert.deepEqual(await responses(page), [{ v: 1, payload: query }])
      assert.equal(page.isClosed(), false)
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
      assert.equal(frame?.url(), `${ORIGIN}/oauth/microsoft`)
    } finally {
      await browser.close()
    }
  })

  test(`${name}: missing and malformed state never broadcast and expose only accessible recovery text`, async () => {
    const { browser, context, page } = await setup(browserType)
    try {
      await receiver(page, randomUUID())
      for (const query of ['code=secret-fixture', 'code=secret-fixture&state=not-base64']) {
        const popup = await context.newPage()
        await popup.goto(`${ORIGIN}/oauth/microsoft?${query}`)
        await popup.locator('html[data-microsoft-bridge="failed"]').waitFor({ timeout: TIMEOUT_MS })
        assert.equal(popup.url(), `${ORIGIN}/oauth/microsoft`)
        const recoveryText = await popup.locator('body').textContent()
        assert.ok(!(recoveryText ?? '').includes('secret-fixture'))
        assert.deepEqual(await responses(page), [])
        const accessibility = await new AxeAccessibilityBuilder({ page: popup }).analyze()
        assert.deepEqual(accessibility.violations, [])
        await popup.close()
      }
    } finally {
      await browser.close()
    }
  })
}
