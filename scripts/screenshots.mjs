#!/usr/bin/env node
/**
 * Visual verification record for UI milestones. Captures the public and
 * authenticated screens in light and dark themes from a running preview
 * server (see scripts/lighthouse.mjs for the same session bootstrap) into
 * docs/screenshots/<milestone>/<profile>/.
 *
 *   node scripts/screenshots.mjs <milestone> [desktop|phone|tablet|all]
 *
 * `desktop` is a 1440×900 Chromium window; `phone` is an iPhone 14 and
 * `tablet` an iPad Mini, both in WebKit with touch, so the record shows what
 * Safari users see. `all` (the default) captures the three in turn.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium, devices, webkit } from '@playwright/test'

import { waitForLink } from './lib/dev-mailbox.mjs'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173'
const MILESTONE = process.argv[2] ?? 'm1'
const PROFILE_ARGUMENT = process.argv[3] ?? 'all'
const PREVIEW_SETTLE_MS = 600
/** Longer than the sheet's 200 ms slide-in (src/client/styles/app.css). */
const SHEET_SETTLE_MS = 400
const PROFILES = {
  desktop: { browser: chromium, options: { viewport: { width: 1440, height: 900 } } },
  phone: { browser: webkit, options: devices['iPhone 14'] },
  tablet: { browser: webkit, options: devices['iPad Mini'] },
}
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
  ['bulk', '/app/bulk'],
  ['gallery', '/app/gallery'],
  ['shares', '/app/shares'],
]

const profileNames =
  PROFILE_ARGUMENT === 'all' ? Object.keys(PROFILES) : PROFILE_ARGUMENT.split(',')
for (const name of profileNames) {
  if (!Object.hasOwn(PROFILES, name)) {
    throw new Error(`unknown profile ${name}; use desktop, phone, tablet or all`)
  }
}

/** Reaches a destination the way a user of this layout would: sidebar, tab bar, or the menu sheet. */
async function navigateTo(page, label) {
  for (const navigation of ['Primary', 'Tools']) {
    const link = page
      .getByRole('navigation', { name: navigation, exact: true })
      .getByRole('link', { name: label, exact: true })
    if (await link.isVisible()) {
      await link.click()
      return
    }
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Primary (menu)' })
    .getByRole('link', { name: label, exact: true })
    .click()
}

async function captureProfile(profileName) {
  const { browser: browserType, options } = PROFILES[profileName]
  const outputDir = path.join('docs', 'screenshots', MILESTONE, profileName)
  await mkdir(outputDir, { recursive: true })
  const browser = await browserType.launch()
  try {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ ...options, colorScheme })
      const page = await context.newPage()
      const shoot = async (name, { isFullPage = true } = {}) => {
        await page.screenshot({
          path: path.join(outputDir, `${name}-${colorScheme}.png`),
          fullPage: isFullPage,
        })
      }
      for (const [name, pathname] of PUBLIC_PAGES) {
        await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle' })
        await shoot(name)
      }

      const runId = `${Date.now().toString(36)}-${profileName}-${colorScheme}`
      const email = `shots-${runId}@example.test`
      await page.goto(`${BASE_URL}/signup`)
      await page.getByLabel('Name').fill('Sam Screenshot')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill('screenshot session passphrase')
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.getByRole('heading', { level: 1, name: 'Check your inbox' }).waitFor()
      await shoot('check-email')

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

      await navigateTo(page, 'Members')
      await page.getByRole('heading', { level: 1, name: 'Members' }).waitFor()
      await page.getByLabel('Email').fill('teammate@example.test')
      await page.getByRole('button', { name: 'Send invitation' }).click()
      await page.getByText('Invitation sent to teammate@example.test.').waitFor()

      // The phone menu sheet itself, once its slide-in has finished; the
      // sheet is fixed to the viewport, so a full-page capture would smear it.
      if (await page.getByRole('button', { name: 'Menu', exact: true }).isVisible()) {
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
        await page.getByRole('dialog', { name: 'Menu' }).waitFor()
        await page.waitForTimeout(SHEET_SETTLE_MS)
        await shoot('menu', { isFullPage: false })
        await page.getByRole('button', { name: 'Close menu' }).click()
        await page.getByRole('dialog', { name: 'Menu' }).waitFor({ state: 'hidden' })
      }

      // A saved preset so the library has content, then the designer with a live preview.
      await page.goto(`${BASE_URL}/app/library/new`)
      await page.getByRole('textbox', { name: 'Text' }).fill(`© ${organizationName}`)
      await page.getByLabel('Font').selectOption('Playfair Display Variable')
      await page.getByLabel('Preset name').fill('Studio signature')
      await page.getByRole('img', { name: 'Watermark preview on the subject photo' }).waitFor()
      await page.waitForLoadState('networkidle')
      await shoot('designer')
      await page.getByRole('button', { name: 'Save preset' }).click()
      await page.getByRole('link', { name: 'Studio signature', exact: true }).waitFor()

      // The editor with the preset loaded, then with the crop tool open.
      await page.getByRole('link', { name: 'Open Studio signature in the editor' }).click()
      await page.getByRole('group', { name: /Watermark position/ }).waitFor()
      await page.waitForLoadState('networkidle')
      await shoot('editor')
      // A saved photo so the gallery has content.
      await page.getByRole('tab', { name: 'Export' }).click()
      await page.getByRole('button', { name: 'Save to gallery' }).click()
      await page.getByText(/Saved .* to the/).waitFor()
      await page.getByRole('tab', { name: 'Crop' }).click()
      await page.getByRole('button', { name: '4:3' }).click()
      await page.getByRole('group', { name: /Crop area/ }).waitFor()
      // The preview re-renders through the worker after a short debounce.
      await page.waitForTimeout(PREVIEW_SETTLE_MS)
      await shoot('editor-crop')

      // The Adjust tab: filters and colour sliders.
      await page.getByRole('tab', { name: 'Adjust' }).click()
      await page.getByRole('radio', { name: 'Vivid' }).click()
      await page.getByText('Filter: Vivid').waitFor()
      await page.waitForTimeout(PREVIEW_SETTLE_MS)
      await shoot('editor-adjust')

      // Publish the saved photo and capture the link dialog and the visitor's page.
      await page.goto(`${BASE_URL}/app/gallery`, { waitUntil: 'networkidle' })
      await page
        .getByRole('checkbox', { name: /^Select / })
        .first()
        .check()
      await page.getByRole('button', { name: 'Share 1' }).click()
      await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Client preview')
      await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click()
      const shareUrl = await page
        .getByRole('dialog')
        .getByLabel('Link', { exact: true })
        .inputValue()
      await shoot('share-dialog')
      await page.keyboard.press('Escape')

      // The admin console: users, organizations and the global audit trail.
      const promoted = await context.request.post(`${BASE_URL}/api/dev/promote`, {
        data: { email },
        headers: { origin: BASE_URL },
      })
      if (!promoted.ok()) {
        throw new Error(`promotion failed: ${String(promoted.status())}`)
      }
      await page.goto(`${BASE_URL}/app/admin`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { level: 1, name: 'Administration' }).waitFor()
      await page.getByText(/\d+ users?[,.]/).waitFor()
      await shoot('admin-users')
      await page.getByRole('tab', { name: 'Organizations' }).click()
      // The local database keeps every earlier run's organizations and audit
      // entries; these tables run to thousands of pixels, so only the viewport.
      await page.getByRole('table', { name: /Organizations/ }).waitFor()
      await shoot('admin-organizations', { isFullPage: false })
      await page.getByRole('tab', { name: 'Audit trail' }).click()
      await page.getByRole('table', { name: /Audit entries/ }).waitFor()
      await shoot('admin-audit', { isFullPage: false })

      for (const [name, pathname] of AUTHENTICATED_PAGES) {
        await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle' })
        await shoot(name)
      }
      await context.close()

      const visitorContext = await browser.newContext({ ...options, colorScheme })
      const visitor = await visitorContext.newPage()
      await visitor.goto(shareUrl, { waitUntil: 'networkidle' })
      await visitor.getByRole('heading', { level: 1, name: 'Client preview' }).waitFor()
      await visitor.screenshot({
        path: path.join(outputDir, `share-public-${colorScheme}.png`),
        fullPage: true,
      })
      await visitorContext.close()
    }
    console.info(`${profileName} screenshots written to ${outputDir}`)
  } finally {
    await browser.close()
  }
}

for (const profileName of profileNames) {
  await captureProfile(profileName)
}
