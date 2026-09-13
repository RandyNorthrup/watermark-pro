import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { chromium, webkit } from '@playwright/test'

const ORIGIN = 'https://referrer.example.test'
const OTHER_ORIGIN = 'https://provider.example.test'
const BEARER_PATH = '/workspace-invitation/synthetic-token?private=canary'
const DOCUMENT =
  '<!doctype html><html lang="en"><title>Referrer fixture</title><main>Private route</main></html>'
const headers = await readFile('public/_headers', 'utf8')
const policy = /^\s*Referrer-Policy:\s*(\S+)$/m.exec(headers)?.[1]
assert.equal(policy, 'strict-origin')

for (const browserType of [chromium, webkit]) {
  test(`${browserType.name()}: actual static policy strips bearer paths but retains provider origin`, async () => {
    const browser = await browserType.launch()
    try {
      const context = await browser.newContext()
      const seen = []
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (![ORIGIN, OTHER_ORIGIN].includes(url.origin)) return await route.abort()
        if (url.pathname === '/probe') {
          seen.push({ origin: url.origin, referrer: route.request().headers().referer })
          return await route.fulfill({
            contentType: 'text/plain',
            body: 'received',
            headers: { 'access-control-allow-origin': ORIGIN },
          })
        }
        await route.fulfill({
          contentType: 'text/html',
          body: DOCUMENT,
          headers: {
            'referrer-policy':
              url.pathname === '/control' ? 'strict-origin-when-cross-origin' : policy,
          },
        })
      })
      const page = await context.newPage()
      await page.goto(`${ORIGIN}${BEARER_PATH}`)
      await page.evaluate(async (provider) => {
        await fetch('/probe')
        await fetch(`${provider}/probe`)
        globalThis.history.pushState({}, '', '/app/editor?private=second-canary')
        await fetch('/probe')
      }, OTHER_ORIGIN)
      assert.deepEqual(seen, [
        { origin: ORIGIN, referrer: `${ORIGIN}/` },
        { origin: OTHER_ORIGIN, referrer: `${ORIGIN}/` },
        { origin: ORIGIN, referrer: `${ORIGIN}/` },
      ])
      // Independent control proves the browser would expose the same-origin
      // path if the previous policy were accidentally restored.
      await page.goto(`${ORIGIN}/control?private=control-canary`)
      await page.evaluate(async () => {
        await fetch('/probe')
      })
      assert.equal(seen.at(-1)?.referrer, `${ORIGIN}/control?private=control-canary`)
    } finally {
      await browser.close()
    }
  })
}
