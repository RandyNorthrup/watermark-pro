#!/usr/bin/env node
/**
 * Visual verification record for UI milestones. Captures the public and
 * authenticated screens in light and dark themes from a running preview
 * server (see scripts/lighthouse.mjs for the same session bootstrap) into
 * docs/screenshots/<milestone>/.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { waitForLink } from './lib/dev-mailbox.mjs'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173'
const MILESTONE = process.argv[2] ?? 'm1'
const VIEWPORT = { width: 1440, height: 900 }
const PUBLIC_PAGES = [
  ['home', '/'],
  ['login', '/login'],
  ['signup', '/signup'],
]
const AUTHENTICATED_PAGES = [
  ['dashboard', '/app'],
  ['members', '/app/members'],
  ['audit', '/app/audit'],
  ['new-organization', '/app/organizations/new'],
  ['library', '/app/library'],
]

const outputDir = path.join('docs', 'screenshots', MILESTONE)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch()
try {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme })
    const page = await context.newPage()
    for (const [name, pathname] of PUBLIC_PAGES) {
      await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle' })
      await page.screenshot({
        path: path.join(outputDir, `${name}-${colorScheme}.png`),
        fullPage: true,
      })
    }

    const runId = `${Date.now().toString(36)}-${colorScheme}`
    const email = `shots-${runId}@example.test`
    await page.goto(`${BASE_URL}/signup`)
    await page.getByLabel('Name').fill('Sam Screenshot')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('screenshot session passphrase')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('heading', { level: 1, name: 'Check your inbox' }).waitFor()
    await page.screenshot({
      path: path.join(outputDir, `check-email-${colorScheme}.png`),
      fullPage: true,
    })

    const link = await waitForLink(
      async () => {
        const response = await context.request.get(`${BASE_URL}/api/dev/mailbox`)
        return await response.json()
      },
      email,
      '/api/auth/verify-email',
    )
    await page.goto(link)
    await page.getByRole('heading', { level: 1 }).waitFor()
    // Unique per run: the local database keeps earlier runs' organizations.
    const organizationName = `Screenshot Studio ${runId}`
    await page.getByLabel('Name').fill(organizationName)
    await page.getByRole('button', { name: 'Create organization' }).click()
    await page.getByRole('heading', { level: 1, name: organizationName }).waitFor()

    await page.getByRole('link', { name: 'Members' }).first().click()
    await page.getByRole('heading', { level: 1, name: 'Members' }).waitFor()
    await page.getByLabel('Email').fill('teammate@example.test')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await page.getByText('Invitation sent to teammate@example.test.').waitFor()

    // A saved preset so the library has content, then the designer with a live preview.
    await page.goto(`${BASE_URL}/app/library/new`)
    await page.getByRole('textbox', { name: 'Text' }).fill(`© ${organizationName}`)
    await page.getByLabel('Font').selectOption('Playfair Display Variable')
    await page.getByLabel('Preset name').fill('Studio signature')
    await page.getByRole('img', { name: 'Watermark preview on the subject photo' }).waitFor()
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outputDir, `designer-${colorScheme}.png`),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Save preset' }).click()
    await page.getByRole('link', { name: 'Studio signature' }).waitFor()

    for (const [name, pathname] of AUTHENTICATED_PAGES) {
      await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle' })
      await page.screenshot({
        path: path.join(outputDir, `${name}-${colorScheme}.png`),
        fullPage: true,
      })
    }
    await context.close()
  }
  console.info(`screenshots written to ${outputDir}`)
} finally {
  await browser.close()
}
