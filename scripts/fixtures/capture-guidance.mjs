/** Real opt-in, route-by-route touring, replay, permanent offers and mobile touch behavior. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, devices, expect, webkit } from '@playwright/test'

import { createAuditAccount } from './audit-accounts.mjs'

const PROFILES = {
  desktop: { engine: chromium, options: { viewport: { width: 1280, height: 900 } } },
  android: { engine: chromium, options: devices['Pixel 7'] },
  iphone: { engine: webkit, options: devices['iPhone 14'] },
}
const selectedProfile = process.argv[2]
if (selectedProfile !== undefined && !Object.hasOwn(PROFILES, selectedProfile))
  throw new Error('Unknown guidance QA profile')
const ORIGIN = process.env.APP_URL ?? 'http://localhost:5273'
const OUTPUT = 'temp/guidance-qa'
const reports = []
const TOUR_STOPS = [
  ['Images', '/app/editor'],
  ['Create A Watermark', '/app/editor'],
  ['Included Presets', '/app/editor'],
  ['Your Saved Designs', '/app/editor'],
  ['Crop, Adjust And Resize', '/app/editor'],
  ['Save Your Image', '/app/editor'],
  ['Documents', '/app/documents'],
  ['Videos', '/app/video'],
  ['Bulk', '/app/bulk'],
  ['Saved Watermarks', '/app/library'],
  ['Watermarked Images', '/app/gallery'],
  ['Account And Cloud', '/app/account'],
  ['Workspaces And Access', '/app/account'],
]
await mkdir(OUTPUT, { recursive: true })

async function openEditor(page) {
  const claimed = page.waitForResponse((response) =>
    response.url().endsWith('/api/me/guidance/claim'),
  )
  await page.goto('/app/editor')
  const response = await claimed
  assert.equal(response.status(), 200)
  await expect(page.getByRole('heading', { level: 1, name: 'Images', exact: true })).toBeVisible()
  return response.json()
}

async function swipe(page, context, direction) {
  const body = page.locator('[data-first-use-tip] p').first()
  const box = await body.boundingBox()
  assert.ok(box)
  const session = await context.newCDPSession(page)
  const y = box.y + box.height / 2
  const start = box.x + box.width * (direction === 'next' ? 0.8 : 0.2)
  const distance = box.width * (direction === 'next' ? -0.6 : 0.6)
  const point = (x) => ({ id: 1, x, y, radiusX: 2, radiusY: 2, force: 1 })
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(start)],
    })
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point(start + distance * fraction)],
      })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await session.detach()
  }
}

async function verifySuppression(page) {
  const tip = page.locator('[data-first-use-tip]')
  await page.getByRole('combobox', { name: 'Font', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: /Search Fonts/i })).toBeVisible()
  await expect(tip).toHaveCount(0)
  await page.getByRole('searchbox', { name: /Search Fonts/i }).press('Escape')
  await expect(tip).toHaveCount(1)
  await page.getByRole('button', { name: /Account Menu For Guidance QA/i }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(tip).toHaveCount(0)
  await page.getByRole('menuitem', { name: /Manage Access/i }).click()
  const access = page.getByRole('dialog', { name: /Manage Access/i })
  await expect(access).toBeVisible()
  await expect(tip).toHaveCount(0)
  await access.getByRole('button', { name: /^Close$/i }).click()
  await expect(tip).toHaveCount(1)
}

for (const [name, profile] of Object.entries(PROFILES)) {
  if (selectedProfile !== undefined && name !== selectedProfile) continue
  const actor = await createAuditAccount(ORIGIN, 'Guidance QA')
  const browser = await profile.engine.launch()
  try {
    const { cookies } = await actor.context.storageState()
    const context = await browser.newContext({
      ...profile.options,
      colorScheme: 'dark',
      baseURL: ORIGIN,
    })
    await context.addCookies(cookies)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => {
      errors.push(error.name)
    })
    assert.deepEqual(await openEditor(page), { claimed: true })
    const tip = page.locator('[data-first-use-tip]')
    await expect(tip).toHaveCount(1)
    await expect(tip.getByRole('heading', { name: 'Take A Quick Tour?' })).toBeVisible()
    await expect(page).toHaveURL(`${ORIGIN}/app/editor`)
    await expect(tip.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0)
    await tip.getByRole('button', { name: 'No Thanks', exact: true }).click()
    await expect(tip).toHaveCount(0)
    assert.deepEqual(await openEditor(page), { claimed: false })
    await expect(tip).toHaveCount(0)

    const otherDevice = await browser.newContext({ ...profile.options, baseURL: ORIGIN })
    await otherDevice.addCookies(cookies)
    const otherPage = await otherDevice.newPage()
    assert.deepEqual(await openEditor(otherPage), { claimed: false })
    await expect(otherPage.locator('[data-first-use-tip]')).toHaveCount(0)
    await otherDevice.close()

    await page.goto('/app/account')
    await page.getByRole('button', { name: 'View Product Tour' }).click()
    await expect(page).toHaveURL(`${ORIGIN}/app/editor`)
    await expect(tip.getByRole('heading', { name: 'Images', exact: true })).toBeVisible()
    await tip.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(tip.getByRole('heading', { name: 'Create A Watermark' })).toBeVisible()
    await tip.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(tip.getByRole('heading', { name: 'Images', exact: true })).toBeVisible()
    if (name === 'android') {
      await swipe(page, context, 'next')
      try {
        await expect(tip.getByRole('heading', { name: 'Create A Watermark' })).toBeVisible()
      } catch (error) {
        await page.screenshot({ path: `${OUTPUT}/android-swipe-failure.png`, fullPage: true })
        throw error
      }
      await swipe(page, context, 'back')
      await expect(tip.getByRole('heading', { name: 'Images', exact: true })).toBeVisible()
    }
    await tip.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(tip.getByRole('heading', { name: 'Create A Watermark' })).toBeVisible()
    await verifySuppression(page)
    await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: true, animations: 'disabled' })
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    assert.deepEqual(
      accessibility.violations.map(({ id }) => id),
      [],
      `${name}: accessibility`,
    )
    const geometry = await tip.boundingBox()
    const viewport = page.viewportSize()
    assert.ok(
      geometry &&
        viewport &&
        geometry.width <= viewport.width &&
        geometry.height <= viewport.height,
    )
    for (const [heading, route] of TOUR_STOPS.slice(2)) {
      await tip.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(tip.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page).toHaveURL(`${ORIGIN}${route}`)
      await expect(tip).toHaveCount(1)
    }
    await tip.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(tip).toHaveCount(0)
    await page.getByRole('button', { name: 'View Product Tour' }).click()
    await expect(tip.getByRole('heading', { name: 'Images', exact: true })).toBeVisible()
    if (name === 'desktop') await page.keyboard.press('Escape')
    else await tip.getByRole('button', { name: 'Exit Tour', exact: true }).click()
    await expect(tip).toHaveCount(0)
    assert.deepEqual(await openEditor(page), { claimed: false })
    await expect(tip).toHaveCount(0)

    const second = await createAuditAccount(ORIGIN, 'Independent Guide')
    try {
      const secondContext = await browser.newContext({ ...profile.options, baseURL: ORIGIN })
      const secondStorage = await second.context.storageState()
      await secondContext.addCookies(secondStorage.cookies)
      const secondPage = await secondContext.newPage()
      assert.deepEqual(await openEditor(secondPage), { claimed: true })
      await expect(secondPage.locator('[data-first-use-tip]')).toHaveCount(1)
      if (name !== 'desktop') {
        await secondPage.setViewportSize({ width: 844, height: 390 })
        await expect
          .poll(async () => {
            const bounds = await secondPage.locator('[data-first-use-tip]').boundingBox()
            return (
              bounds !== null &&
              bounds.x >= 0 &&
              bounds.y >= 0 &&
              bounds.x + bounds.width <= 844 &&
              bounds.y + bounds.height <= 390
            )
          })
          .toBe(true)
        await secondPage.screenshot({
          path: `${OUTPUT}/${name}-landscape.png`,
          animations: 'disabled',
        })
      }
      await secondContext.close()
    } finally {
      await second.context.dispose()
    }
    assert.deepEqual(errors, [], `${name}: uncaught errors`)
    reports.push({
      profile: name,
      explicitOptIn: true,
      routeTour: TOUR_STOPS.length,
      settingsReplay: true,
      exitAtAnyStep: true,
      singleCard: true,
      suppression: true,
      permanentAcrossDevices: true,
      accountIsolation: true,
      nativeSwipe: name === 'android',
    })
    await writeFile(`${OUTPUT}/report.json`, JSON.stringify(reports, null, 2) + '\n')
    console.info(
      `${name}: opt-in tour, all routes, replay, exit, mobile controls and account isolation passed`,
    )
  } finally {
    await browser.close()
    await actor.context.dispose()
  }
}
