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
 * Safari users see. `android` uses Pixel 7 Chromium. `all` captures all four.
 * Every profile covers English/Arabic, light/dark, and per-capture axe/reflow checks.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, devices, expect, webkit } from '@playwright/test'

import {
  createAuditAccount,
  createAuditReset,
  fixtureJson,
  fixtureLink,
} from './fixtures/audit-accounts.mjs'
import {
  auditLabel,
  AUDIT_SURFACES,
  PUBLIC_SURFACES,
  reserveCapture,
  WORKSPACE_SURFACES,
} from './lib/audit-surfaces.mjs'
import { waitForLink } from './lib/dev-mailbox.mjs'
import { ensureTestSiteOwner, TEST_SITE_OWNER } from './lib/test-site-owner.ts'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5273'
const MILESTONE = process.argv[2] ?? 'm1'
const PROFILE_ARGUMENT = process.argv[3] ?? 'all'
const LOCALES = ['en', 'ar']
const LOCALE_NAMES = { en: 'English', ar: 'العربية' }
const CATALOGUES = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => [
      locale,
      JSON.parse(
        await readFile(
          new URL(`../src/client/locales/${locale}/common.json`, import.meta.url),
          'utf8',
        ),
      ),
    ]),
  ),
)
if (!/^[a-z][a-z0-9-]*$/.test(MILESTONE))
  throw new Error('Use a milestone name without path separators.')
const CAPTURES = new Map()
const VISUAL_READY_TIMEOUT_MS = 30_000
const SAVED_PHOTO_NAME = 'sample-photo-watermarked.png'
const PROFILES = {
  desktop: { browser: chromium, options: { viewport: { width: 1440, height: 900 } } },
  phone: { browser: webkit, options: devices['iPhone 14'] },
  tablet: { browser: webkit, options: devices['iPad Mini'] },
  android: { browser: chromium, options: devices['Pixel 7'] },
}
const PUBLIC_PAGES = PUBLIC_SURFACES.map(({ id, route }) => [id, route])
const AUTHENTICATED_PAGES = WORKSPACE_SURFACES.filter(({ id }) => id !== 'dashboard').map(
  ({ id, route }) => [id, route],
)
const REQUIRED_SURFACES = new Set([
  ...AUDIT_SURFACES.map(({ id }) => id),
  'language-menu',
  'share-dialog',
  ...['watermark', 'crop', 'adjust', 'resize', 'export'].map((tab) => `editor-${tab}`),
  ...['users', 'organizations', 'audit', 'health', 'clientErrors'].map((tab) => `admin-${tab}`),
])

const profileNames =
  PROFILE_ARGUMENT === 'all' ? Object.keys(PROFILES) : PROFILE_ARGUMENT.split(',')
for (const name of profileNames) {
  if (!Object.hasOwn(PROFILES, name)) {
    throw new Error(`unknown profile ${name}; use desktop, phone, tablet, android or all`)
  }
}

function label(locale, key) {
  return auditLabel(CATALOGUES[locale], key)
}

async function chooseLocale(page, locale) {
  const current = await page.locator('html').getAttribute('lang')
  if (current !== locale) {
    await page
      .getByRole('button', { name: label(current, 'language.menuLabel'), exact: true })
      .click()
    await page.getByRole('menuitem', { name: LOCALE_NAMES[locale], exact: true }).click()
  }
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
}

async function imagesReady(page) {
  await page.evaluate("for (const image of document.images) image.loading = 'eager'")
  await page.waitForFunction(
    "document.fonts.status === 'loaded' && [...document.images].every(image => image.complete && image.naturalWidth > 0)",
    undefined,
    { timeout: VISUAL_READY_TIMEOUT_MS },
  )
}

async function captureRecentViews(page, shoot, locale, kind) {
  const surface = kind === 'preset' ? 'library' : 'gallery'
  await page.goto(`${BASE_URL}/app/${surface}`, { waitUntil: 'networkidle' })
  const recent = page.getByRole('region', { name: label(locale, 'recent.heading'), exact: true })
  if (kind === 'preset') {
    await expect(recent.getByRole('link', { name: 'Studio signature', exact: true })).toBeVisible()
  } else {
    await expect(recent.getByRole('button', { name: SAVED_PHOTO_NAME, exact: true })).toBeVisible()
  }
  for (const mode of ['thumbnails', 'list', 'details']) {
    const button = recent.getByRole('button', {
      name: label(locale, `recent.views.${mode}`),
      exact: true,
    })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await shoot(`${surface}-recent-${mode}`)
  }
}

async function captureNormalGlass(page, context, browserType, colorScheme, shoot) {
  if (browserType !== chromium) return
  const session = await context.newCDPSession(page)
  try {
    await session.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: colorScheme },
        { name: 'prefers-reduced-transparency', value: 'no-preference' },
      ],
    })
    await shoot('workspace-normal-glass')
  } finally {
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: colorScheme }],
    })
    await session.detach()
  }
}

/** Reaches a destination the way a user of this layout would: sidebar, tab bar, or the menu sheet. */
async function navigateTo(page, destinationLabel) {
  for (const navigation of ['Primary', 'Administration sections', 'Tools']) {
    const link = page
      .getByRole('navigation', { name: navigation, exact: true })
      .getByRole('link', { name: destinationLabel, exact: true })
    if (await link.isVisible()) {
      await link.click()
      return
    }
  }
  const accountMenu = page.locator('header button[aria-haspopup="menu"]').last()
  await accountMenu.click()
  const accountDestination = page.getByRole('menuitem', { name: destinationLabel, exact: true })
  if ((await accountDestination.count()) > 0) {
    await accountDestination.click()
    return
  }
  await page.keyboard.press('Escape')
  const locale = await page.locator('html').getAttribute('lang')
  if (!LOCALES.includes(locale)) throw new Error('Unsupported navigation locale')
  const menuLabel = label(locale, 'shell.menu')
  const menu = page.getByRole('button', { name: menuLabel, exact: true })
  if (await menu.isVisible()) {
    await menu.click()
    const dialog = page.getByRole('dialog', { name: menuLabel, exact: true })
    await dialog.getByRole('link', { name: destinationLabel, exact: true }).click()
    await expect(dialog).toHaveCount(0)
    return
  }
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true })
  await primary
    .getByRole('link', { name: label(locale, 'shell.nav.dashboard'), exact: true })
    .click()
  const workspaceTarget = page
    .getByRole('navigation', { name: 'Primary', exact: true })
    .getByRole('link', { name: destinationLabel, exact: true })
  await expect(workspaceTarget).toBeVisible()
  await workspaceTarget.click()
}

function createCapture(page, outputDir, profileName, colorScheme) {
  let browserErrors = 0
  page.on('pageerror', () => {
    browserErrors += 1
  })
  return async (name, { isFullPage = true, locale: expectedLocale } = {}) => {
    await imagesReady(page)
    if (browserErrors > 0) throw new Error(`Browser error on screenshot surface ${name}`)
    const result = await new AxeBuilder({ page }).analyze()
    if (result.violations.length > 0)
      throw new Error(
        `Accessibility failure on ${name}: ${result.violations.map((item) => item.id).join(', ')}`,
      )
    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    )
    if (overflow > 0) throw new Error(`Document overflows horizontally on ${name}`)
    const locale = await page.locator('html').getAttribute('lang')
    if (!LOCALES.includes(locale)) throw new Error('Unsupported screenshot locale')
    if (expectedLocale !== undefined)
      await expect(page.locator('html')).toHaveAttribute('lang', expectedLocale)
    const filename = `${name}-${locale}-${colorScheme}.png`
    const captureKey = `${profileName}/${filename}`
    reserveCapture(CAPTURES, captureKey, {
      profile: profileName,
      locale,
      theme: colorScheme,
      surface: name,
      file: captureKey,
      reducedTransparency: await page.evaluate(
        "matchMedia('(prefers-reduced-transparency: reduce)').matches",
      ),
    })
    await page.screenshot({
      path: path.join(outputDir, filename),
      fullPage: isFullPage,
    })
  }
}

async function expectSeededSurface(page, locale, name) {
  switch (name) {
    case 'library': {
      await page
        .getByRole('region', { name: label(locale, 'library.heading'), exact: true })
        .getByRole('link', { name: 'Studio signature', exact: true })
        .waitFor()
      break
    }
    case 'gallery': {
      await page
        .getByRole('button', {
          name: label(locale, 'gallery.openPhoto').replace('{{name}}', () => SAVED_PHOTO_NAME),
          exact: true,
        })
        .waitFor()
      break
    }
    case 'shares': {
      {
        await page.getByText('Client preview', { exact: true }).waitFor()
        // No default
      }
      break
    }
  }
}

async function captureProfile(profileName) {
  const { browser: browserType, options } = PROFILES[profileName]
  const outputDir = path.join('docs', 'screenshots', MILESTONE, profileName)
  await mkdir(outputDir, { recursive: true })
  const browser = await browserType.launch()
  try {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ ...options, colorScheme, baseURL: BASE_URL })
      const page = await context.newPage()
      const responseFailures = []
      page.on('response', (response) => {
        if (response.status() >= 400) responseFailures.push(response.status())
      })
      const shoot = createCapture(page, outputDir, profileName, colorScheme)
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })

      const runId = `${Date.now().toString(36)}-${profileName}-${colorScheme}`
      const email = `shots-${runId}@example.test`
      const signup = await context.request.post(`${BASE_URL}/api/auth/sign-up/email`, {
        headers: { origin: BASE_URL },
        data: {
          name: 'Sam Screenshot',
          email,
          password: 'screenshot session passphrase',
          callbackURL: '/app',
        },
      })
      if (!signup.ok()) throw new Error(`Screenshot fixture signup failed: ${signup.status()}`)
      await page.goto(`${BASE_URL}/check-email?email=${encodeURIComponent(email)}`)
      await page.getByRole('heading', { level: 1, name: 'Check your inbox' }).waitFor()
      await shoot('check-email')
      await chooseLocale(page, 'ar')
      await shoot('check-email')
      await chooseLocale(page, 'en')

      const link = await waitForLink(
        async () => {
          const response = await context.request.get(`${BASE_URL}/api/dev/mailbox`)
          return await response.json()
        },
        email,
        '/api/auth/verify-email',
      )
      await page.goto(link)
      await page.waitForURL('**/app/editor')
      await page.getByRole('heading', { level: 1, name: 'Editor' }).waitFor()
      for (const locale of LOCALES) {
        await chooseLocale(page, locale)
        await shoot('private-editor-empty', { locale })
      }
      await chooseLocale(page, 'en')
      // Unique per run: the local database keeps earlier runs' organizations.
      const organizationName = `Screenshot Studio ${runId}`
      await page.goto(`${BASE_URL}/app/organizations/new`)
      await page.getByLabel('Name').fill(organizationName)
      await page.getByRole('button', { name: 'Create organization' }).click()
      await page.waitForURL('**/app/editor')

      await navigateTo(page, 'Members')
      await page.getByRole('heading', { level: 1, name: 'Members' }).waitFor()
      await page.getByLabel('Email').fill('teammate@example.test')
      await page.getByRole('button', { name: 'Send invitation' }).click()
      await page.getByText('Invitation sent to teammate@example.test.').waitFor()
      const inviteEmail = `invited-${runId}@example.test`
      await page.goto(`${BASE_URL}/app/invitations`, { waitUntil: 'networkidle' })
      await page.getByLabel('Email address').fill(inviteEmail)
      await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
      await page.getByText('Invitation sent. It expires in seven days.').waitFor()
      const invitationUrl = await waitForLink(
        async () => {
          const response = await context.request.get(`${BASE_URL}/api/dev/mailbox`)
          return await response.json()
        },
        inviteEmail,
        '/signup?invitation=',
      )

      // A saved preset so the library has content, then the designer with a live preview.
      await page.goto(`${BASE_URL}/app/library/new`)
      await page.getByRole('textbox', { name: 'Text' }).fill(`© ${organizationName}`)
      const fontPicker = page.getByRole('combobox', { name: 'Font', exact: true })
      await fontPicker.click()
      await page
        .getByRole('searchbox', { name: 'Search fonts', exact: true })
        .fill('Playfair Display Variable')
      await page.getByRole('option', { name: 'Playfair Display Variable', exact: true }).click()
      await page.getByLabel('Preset name').fill('Studio signature')
      await page.getByRole('img', { name: 'Watermark preview on the subject photo' }).waitFor()
      await page.waitForLoadState('networkidle')
      for (const locale of LOCALES) {
        await chooseLocale(page, locale)
        await shoot('designer-new', { locale })
      }
      await chooseLocale(page, 'en')
      await page.getByRole('button', { name: 'Save preset' }).click()
      const savedPresetLink = page
        .getByRole('region', { name: label('en', 'library.heading'), exact: true })
        .getByRole('link', { name: 'Studio signature', exact: true })
      await savedPresetLink.waitFor()
      const presetPath = await savedPresetLink.getAttribute('href')
      if (presetPath === null) throw new Error('Saved preset link is missing')

      // The editor with the preset loaded, then with the crop tool open.
      await page.getByRole('link', { name: 'Open Studio signature in the editor' }).click()
      await page.getByRole('group', { name: /Watermark position/ }).waitFor()
      const editorUrl = page.url()
      await page.waitForLoadState('networkidle')
      await shoot('editor')
      // A saved photo so the gallery has content.
      await page.getByRole('tab', { name: 'Export' }).click()
      await page.getByRole('combobox', { name: 'Format', exact: true }).click()
      await page.getByRole('option', { name: 'PNG', exact: true }).click()
      await page.getByRole('button', { name: 'Save to gallery' }).click()
      await page.getByText(/Saved .* to the/).waitFor()
      await page.getByRole('tab', { name: 'Crop' }).click()
      const preview = page.getByRole('img', { name: /^Photo with/ })
      const beforeCrop = await preview.getAttribute('src')
      await page.getByRole('button', { name: '4:3' }).click()
      await page.getByRole('group', { name: /Crop area/ }).waitFor()
      if (beforeCrop === null) throw new Error('The crop preview has no source')
      await expect(preview).not.toHaveAttribute('src', beforeCrop)
      await shoot('editor-crop-applied')

      // The Adjust tab: filters and colour sliders.
      await page.getByRole('tab', { name: 'Adjust' }).click()
      const beforeFilter = await preview.getAttribute('src')
      await page.getByRole('radio', { name: 'Vivid' }).click()
      await page.getByText('Filter: Vivid').waitFor()
      if (beforeFilter === null) throw new Error('The adjustment preview has no source')
      await expect(preview).not.toHaveAttribute('src', beforeFilter)
      await shoot('editor-adjust-applied')

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
      await shoot('share-dialog-created')
      await page.keyboard.press('Escape')

      for (const locale of LOCALES) {
        await chooseLocale(page, locale)
        for (const [name, pathname] of AUTHENTICATED_PAGES) {
          responseFailures.length = 0
          await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle' })
          try {
            await page.getByRole('heading', { level: 1 }).waitFor()
            if (responseFailures.length > 0)
              throw new Error('An authenticated surface request failed.')
            await expectSeededSurface(page, locale, name)
          } catch (error) {
            await page.screenshot({
              path: path.join(outputDir, `failed-${name}-${locale}-${colorScheme}.png`),
              fullPage: true,
            })
            throw new Error(
              `Screenshot surface ${name}/${locale}/${colorScheme} did not load; HTTP statuses: ${responseFailures.join(',')}`,
              { cause: error },
            )
          }
          await shoot(name)
        }
        await captureRecentViews(page, shoot, locale, 'preset')
        await captureRecentViews(page, shoot, locale, 'photo')
        await captureNormalGlass(page, context, browserType, colorScheme, shoot)
        await page.goto(new URL(presetPath, BASE_URL).href, { waitUntil: 'networkidle' })
        await shoot('designer-edit')
        await page.goto(editorUrl, { waitUntil: 'networkidle' })
        for (const tab of ['watermark', 'crop', 'adjust', 'resize', 'export']) {
          await page
            .getByRole('tab', { name: label(locale, `editor.tabs.${tab}`), exact: true })
            .click()
          await shoot(`editor-${tab}`)
        }
        const menu = page.getByRole('button', { name: label(locale, 'shell.menu'), exact: true })
        if (await menu.isVisible()) {
          await menu.click()
          await page
            .getByRole('dialog', { name: label(locale, 'shell.menu'), exact: true })
            .evaluate(async (element) => {
              await Promise.all(element.getAnimations().map((animation) => animation.finished))
            })
          await shoot('menu', { isFullPage: false })
          await page
            .getByRole('button', { name: label(locale, 'shell.closeMenu'), exact: true })
            .click()
        }
        await page
          .getByRole('button', { name: label(locale, 'language.menuLabel'), exact: true })
          .click()
        await page.getByRole('menuitem', { name: LOCALE_NAMES[locale], exact: true }).waitFor()
        await shoot('language-menu', { isFullPage: false })
        await page.keyboard.press('Escape')
        await page.goto(`${BASE_URL}/app/gallery`, { waitUntil: 'networkidle' })
        await page.getByRole('checkbox').first().check()
        await page
          .getByRole('button', { name: `${label(locale, 'gallery.share')} 1`, exact: true })
          .click()
        await page
          .getByRole('dialog')
          .getByLabel(label(locale, 'gallery.title'), { exact: true })
          .fill('Client preview')
        await shoot('share-dialog', { locale })
        await page.keyboard.press('Escape')
      }
      await chooseLocale(page, 'en')
      const resetPath = await createAuditReset(context.request, BASE_URL, email)

      // The invitation remains pending; capture with its matching verified recipient.
      const recipient = await createAuditAccount(BASE_URL, 'Alex Audit')
      try {
        const organization = await fixtureJson(
          await context.request.get('/api/auth/organization/get-full-organization'),
        )
        await fixtureJson(
          await context.request.post('/api/auth/organization/invite-member', {
            headers: { origin: BASE_URL },
            data: {
              organizationId: organization.id,
              email: recipient.person.email,
              role: 'editor',
            },
          }),
        )
        const acceptPath = await fixtureLink(
          recipient.context,
          BASE_URL,
          recipient.person.email,
          '/accept-invitation/',
        )
        const recipientContext = await browser.newContext({
          ...options,
          colorScheme,
          storageState: await recipient.context.storageState(),
        })
        try {
          const recipientPage = await recipientContext.newPage()
          const shootRecipient = createCapture(recipientPage, outputDir, profileName, colorScheme)
          await recipientPage.goto(`${BASE_URL}${acceptPath}`, { waitUntil: 'networkidle' })
          for (const locale of LOCALES) {
            await chooseLocale(recipientPage, locale)
            await expect(recipientPage.getByRole('heading', { level: 1 })).toHaveText(
              label(locale, 'auth.acceptInvitation.title').replace(
                '{{organizationName}}',
                () => organizationName,
              ),
            )
            await shootRecipient('accept-invitation', { locale })
          }
        } finally {
          await recipientContext.close()
        }
      } finally {
        await recipient.context.dispose()
      }

      // Each capture uses a separate session for the one synthetic site owner.
      await ensureTestSiteOwner(BASE_URL)
      await context.request.post(`${BASE_URL}/api/auth/sign-out`, {
        data: {},
        headers: { origin: BASE_URL },
      })
      const signedIn = await context.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
        data: TEST_SITE_OWNER,
        headers: { origin: BASE_URL },
      })
      if (!signedIn.ok())
        throw new Error(`Screenshot administrator sign-in failed: ${signedIn.status()}`)
      for (const locale of LOCALES) {
        await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' })
        await chooseLocale(page, locale)
        await page
          .getByRole('heading', {
            level: 1,
            name: label(locale, 'dashboard.overviewHeading'),
            exact: true,
          })
          .waitFor()
        await shoot('dashboard', { locale })
      }
      await chooseLocale(page, 'en')
      await page.goto(`${BASE_URL}/app/admin?section=users`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { level: 1, name: 'Administration' }).waitFor()
      await page.getByText(/\d+ users?[,.]/).waitFor()
      await navigateTo(page, 'Organizations')
      // The local database keeps every earlier run's organizations and audit
      // entries; these tables run to thousands of pixels, so only the viewport.
      await page.getByRole('table', { name: /Organizations/ }).waitFor()
      await navigateTo(page, 'Audit trail')
      await page.getByRole('table', { name: /Audit entries/ }).waitFor()
      const adminSections = [
        ['users', 'users'],
        ['organizations', 'organizations'],
        ['audit', 'audit'],
        ['health', 'health'],
        ['clientErrors', 'client-errors'],
      ]
      for (const locale of LOCALES) {
        await chooseLocale(page, locale)
        for (const [labelKey, section] of adminSections) {
          const sectionLabel = label(locale, `admin.tabs.${labelKey}`)
          await navigateTo(page, sectionLabel)
          await expect(page).toHaveURL(new RegExp(`[?&]section=${section}(?:&|$)`))
          await page.getByRole('heading', { level: 2, name: sectionLabel, exact: true }).waitFor()
          await shoot(`admin-${labelKey}`, { isFullPage: false })
        }
      }
      await chooseLocale(page, 'en')

      await context.close()

      const visitorContext = await browser.newContext({ ...options, colorScheme })
      const visitor = await visitorContext.newPage()
      const shootVisitor = createCapture(visitor, outputDir, profileName, colorScheme)
      for (const locale of LOCALES) {
        await visitor.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
        await chooseLocale(visitor, locale)
        for (const [name, pathname] of [
          ...PUBLIC_PAGES,
          [
            'signup-valid-invitation',
            new URL(invitationUrl).pathname + new URL(invitationUrl).search,
          ],
          ['share-public', new URL(shareUrl).pathname + new URL(shareUrl).search],
          ['reset-password-valid', resetPath],
          ['reset-password-invalid', '/reset-password'],
        ]) {
          const route = locale === 'ar' && pathname === '/' ? '/ar' : pathname
          await visitor.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' })
          if (name === 'reset-password-valid')
            await visitor
              .getByLabel(label(locale, 'auth.resetPassword.newPasswordLabel'), { exact: true })
              .waitFor()
          else if (name === 'reset-password-invalid')
            await visitor
              .getByText(label(locale, 'auth.resetPassword.invalidTitle'), { exact: true })
              .waitFor()
          await shootVisitor(name, { locale })
        }
      }
      await visitorContext.close()
    }
    console.info(`${profileName} screenshots written to ${outputDir}`)
  } finally {
    await browser.close()
  }
}

await ensureTestSiteOwner(BASE_URL)
for (const profileName of profileNames) {
  await captureProfile(profileName)
}
for (const profile of profileNames) {
  for (const theme of ['light', 'dark']) {
    for (const locale of LOCALES) {
      for (const surface of REQUIRED_SURFACES) {
        if (!CAPTURES.has(`${profile}/${surface}-${locale}-${theme}.png`))
          throw new Error(`Required screenshot missing: ${profile}/${surface}/${locale}/${theme}`)
      }
    }
  }
}
await writeFile(
  path.join('docs', 'screenshots', MILESTONE, 'inventory.json'),
  JSON.stringify(
    { profiles: profileNames, locales: LOCALES, captures: CAPTURES.values().toArray() },
    null,
    2,
  ) + '\n',
)
