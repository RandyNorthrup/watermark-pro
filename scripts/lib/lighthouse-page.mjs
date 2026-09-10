/** Own Lighthouse's exact measured target until its content checks finish. */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'

// Resolve the same locked Puppeteer dependency Lighthouse uses; do not install another browser driver.
const puppeteerEntry = createRequire(import.meta.resolve('lighthouse')).resolve('puppeteer-core')

async function connectPuppeteer(browserURL) {
  const { connect } = await import(pathToFileURL(puppeteerEntry).href)
  return await connect({ browserURL, defaultViewport: null })
}

/** Bind both protocol clients before measurement and verify their target IDs, never their URLs. */
export async function withLighthousePage(port, inspect, overrides = {}) {
  const drivers = {
    connectPuppeteer,
    connectInspector: chromium.connectOverCDP.bind(chromium),
    ...overrides,
  }
  const endpoint = `http://127.0.0.1:${port}`
  let browser
  let inspector
  let page
  try {
    browser = await drivers.connectPuppeteer(endpoint)
    inspector = await drivers.connectInspector(endpoint)
    const contexts = inspector.contexts()
    if (contexts.length !== 1) throw new Error('Audit browser has unexpected contexts.')
    const context = contexts[0]
    const mirrorReady = context.waitForEvent('page')
    async function createPage() {
      page = await browser.newPage()
      return page
    }
    const [created, mirror] = await Promise.all([createPage(), mirrorReady])
    const ownerSession = await created.createCDPSession()
    const mirrorSession = await context.newCDPSession(mirror)
    try {
      const [owner, observed] = await Promise.all([
        ownerSession.send('Target.getTargetInfo'),
        mirrorSession.send('Target.getTargetInfo'),
      ])
      if (owner.targetInfo.targetId !== observed.targetInfo.targetId)
        throw new Error('Audit content inspector does not own the measured target.')
    } finally {
      await ownerSession.detach()
      await mirrorSession.detach()
    }
    return await inspect(created, mirror)
  } finally {
    try {
      await page?.close()
    } finally {
      try {
        await inspector?.close()
      } finally {
        await browser?.disconnect()
      }
    }
  }
}

/** Report only known assertion classes; protocol exceptions may include private page content. */
export function auditContentFailure(error) {
  const classes = new Map([
    ['Audit page did not render its expected heading', 'heading'],
    ['Audit page did not render its required state', 'required-state'],
    ['Audit form did not load its fixture value', 'form-value'],
    ['Audit page did not load its fixture content', 'fixture-content'],
    ['Audit page did not select its expected view', 'view-selection'],
    ['Audit page has an undecoded visible image', 'image-decode'],
  ])
  return classes.get(error instanceof Error ? error.message : '') ?? 'inspection-failed'
}
