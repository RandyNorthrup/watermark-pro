import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { assertAuditContent } from './lib/audit-content.mjs'
import { requireSurface } from './lib/audit-surfaces.mjs'

const ASSERTION_TIMEOUT_MS = 100
const DELAYED_CONTENT_MS = 10
const QUICK_ASSERTION = { timeout: ASSERTION_TIMEOUT_MS }

test('default designer audit rejects the distinct QR creation screen', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const catalogue = { library: { newPreset: 'New preset' } }
    const surface = requireSurface('designer-new')
    await page.setContent('<h1>New preset</h1>')
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)
    await page.setContent('<h1>New QR code</h1>')
    await assert.rejects(
      assertAuditContent(page, surface, catalogue, QUICK_ASSERTION),
      /expected heading/,
    )
  } finally {
    await browser.close()
  }
})

test('rendered audit checks refuse successful HTTP error screens, missing content, and wrong views', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const catalogue = { recent: { heading: 'Recent work', details: 'Details' } }
    const surface = {
      ...requireSurface('library-recent-details'),
      headingText: 'Watermark library',
      checks: [
        { role: 'region', nameKey: 'recent.heading', contains: 'Studio signature' },
        { role: 'button', nameKey: 'recent.details', pressed: true },
      ],
    }
    const good =
      '<h1>Watermark library</h1><section aria-label="Recent work">Studio signature<button aria-pressed="true">Details</button></section>'
    await page.setContent(good)
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)
    for (const [html, failure] of [
      [good.replace('Watermark library', 'Something went wrong'), /expected heading/],
      [good.replace('Studio signature', 'No saved work'), /fixture content/],
      [good.replace('aria-pressed="true"', 'aria-pressed="false"'), /expected view/],
      [good.replace('<section', '<section hidden'), /required state/],
    ]) {
      await page.setContent(html)
      await assert.rejects(assertAuditContent(page, surface, catalogue, QUICK_ASSERTION), failure)
    }
    await page.setContent(good)
    await page.evaluate(async () => {
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const data = canvas.toDataURL('image/png')
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      for (const source of [data, URL.createObjectURL(blob)]) {
        const image = new globalThis.Image()
        image.src = source
        globalThis.document.body.append(image)
        await image.decode()
      }
    })
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)
    await page.evaluate(() => {
      const broken = globalThis.document.createElement('img')
      broken.src = 'data:image/png,broken'
      broken.width = 20
      broken.height = 20
      broken.id = 'broken-audit-image'
      globalThis.document.body.append(broken)
    })
    await assert.rejects(
      assertAuditContent(page, surface, catalogue, QUICK_ASSERTION),
      /undecoded visible image/,
    )
    await page.locator('#broken-audit-image').evaluate((image) => {
      image.hidden = true
    })
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)
    await page.locator('#broken-audit-image').evaluate((image) => {
      image.hidden = false
      image.loading = 'lazy'
      image.style.cssText = 'position:absolute;top:10000px'
    })
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)
  } finally {
    await browser.close()
  }
})

test('waits for the final asynchronous heading but still refuses the wrong screen', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const catalogue = { library: { newPreset: 'New preset' } }
    const surface = requireSurface('designer-new')
    await page.setContent('<h1>Loading</h1>')
    await page.evaluate(
      ({ delay, heading }) => {
        setTimeout(() => {
          const element = globalThis.document.querySelector('h1')
          if (element !== null) element.textContent = heading
        }, delay)
      },
      { delay: DELAYED_CONTENT_MS, heading: catalogue.library.newPreset },
    )
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)

    await page.setContent('<h1>New QR code</h1>')
    await assert.rejects(
      assertAuditContent(page, surface, catalogue, QUICK_ASSERTION),
      /expected heading/,
    )
  } finally {
    await browser.close()
  }
})

test('waits for a visible image to decode and still rejects a decode timeout', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const catalogue = { library: { newPreset: 'New preset' } }
    const surface = requireSurface('designer-new')
    await page.setContent('<h1>New preset</h1><img id="preview" width="20" height="20">')
    await page.locator('#preview').evaluate((image, delay) => {
      Object.defineProperties(image, {
        complete: { configurable: true, value: false },
        naturalWidth: { configurable: true, value: 0 },
        naturalHeight: { configurable: true, value: 0 },
      })
      image.decode = async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        Object.defineProperties(image, {
          complete: { configurable: true, value: true },
          naturalWidth: { configurable: true, value: 20 },
          naturalHeight: { configurable: true, value: 20 },
        })
      }
    }, DELAYED_CONTENT_MS)
    await assertAuditContent(page, surface, catalogue, QUICK_ASSERTION)

    await page.locator('#preview').evaluate((image, delay) => {
      image.decode = async () => await new Promise((resolve) => setTimeout(resolve, delay))
    }, ASSERTION_TIMEOUT_MS * 2)
    await assert.rejects(
      assertAuditContent(page, surface, catalogue, QUICK_ASSERTION),
      /undecoded visible image/,
    )
  } finally {
    await browser.close()
  }
})
