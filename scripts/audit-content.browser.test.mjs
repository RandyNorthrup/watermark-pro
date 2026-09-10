import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { assertAuditContent } from './lib/audit-content.mjs'

test('rendered audit checks refuse successful HTTP error screens, missing content, and wrong views', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const catalogue = { recent: { heading: 'Recent work', details: 'Details' } }
    const surface = {
      id: 'recent-details',
      headingText: 'My workspace',
      checks: [
        { role: 'region', nameKey: 'recent.heading', contains: 'Studio signature' },
        { role: 'button', nameKey: 'recent.details', pressed: true },
      ],
    }
    const good =
      '<h1>My workspace</h1><section aria-label="Recent work">Studio signature<button aria-pressed="true">Details</button></section>'
    await page.setContent(good)
    await assertAuditContent(page, surface, catalogue)
    for (const [html, failure] of [
      [good.replace('My workspace', 'Something went wrong'), /expected heading/],
      [good.replace('Studio signature', 'No saved work'), /fixture content/],
      [good.replace('aria-pressed="true"', 'aria-pressed="false"'), /expected view/],
      [good.replace('<section', '<section hidden'), /required state/],
    ]) {
      await page.setContent(html)
      await assert.rejects(assertAuditContent(page, surface, catalogue), failure)
    }
  } finally {
    await browser.close()
  }
})
