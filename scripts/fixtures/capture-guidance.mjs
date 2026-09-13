/** Fresh-account discovery, permanent server claims, and real mobile touch behavior. */
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
const ORIGIN = 'http://localhost:5273'
const OUTPUT = 'temp/guidance-qa'
const reports = []
await mkdir(OUTPUT, { recursive: true })

async function openEditor(page) {
  const claimed = page.waitForResponse((response) =>
    response.url().endsWith('/api/me/guidance/claim'),
  )
  await page.goto('/app/editor')
  const response = await claimed
  assert.equal(response.status(), 200)
  await expect(page.getByRole('textbox', { name: 'Text', exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: 'Account menu for Guidance QA' }).click()
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
    await openEditor(page)
    const tip = page.locator('[data-first-use-tip]')
    await expect(tip).toHaveCount(1)
    await expect(tip.getByRole('heading', { name: 'Image', exact: true })).toBeVisible()
    await tip.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(tip).toContainText('original image')
    await tip.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(tip).toContainText('original file stays untouched')
    if (name === 'android') {
      await swipe(page, context, 'next')
      try {
        await expect(tip).toContainText('original image')
      } catch (error) {
        await page.screenshot({ path: `${OUTPUT}/android-swipe-failure.png`, fullPage: true })
        throw error
      }
      await swipe(page, context, 'back')
      await expect(tip).toContainText('original file stays untouched')
    }
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
    if (name === 'desktop') {
      await tip.getByRole('button', { name: 'Dismiss Tip' }).focus()
      await page.keyboard.press('Escape')
      await expect(page.locator('nav a[href="/app/editor"]:visible').first()).toBeFocused()
    } else {
      await tip.getByRole('button', { name: 'Dismiss Tip' }).click()
    }
    // Manage Access was queued while its modal was open; it may show only after
    // the active Image tip is dismissed, then it is permanently consumed too.
    await expect(tip.getByRole('heading', { name: 'Workspace Access' })).toBeVisible()
    await tip.getByRole('button', { name: 'Dismiss Tip' }).click()
    await expect(tip).toHaveCount(0)
    await openEditor(page)
    await expect(tip).toHaveCount(0)

    const otherDevice = await browser.newContext({ ...profile.options, baseURL: ORIGIN })
    await otherDevice.addCookies(cookies)
    const otherPage = await otherDevice.newPage()
    await openEditor(otherPage)
    await expect(otherPage.locator('[data-first-use-tip]')).toHaveCount(0)
    await otherDevice.close()

    const second = await createAuditAccount(ORIGIN, 'Independent Guide')
    try {
      const secondContext = await browser.newContext({ ...profile.options, baseURL: ORIGIN })
      const secondStorage = await second.context.storageState()
      await secondContext.addCookies(secondStorage.cookies)
      const secondPage = await secondContext.newPage()
      await openEditor(secondPage)
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
      singleTip: true,
      suppression: true,
      permanentAcrossDevices: true,
      accountIsolation: true,
      nativeSwipe: name === 'android',
    })
    await writeFile(`${OUTPUT}/report.json`, JSON.stringify(reports, null, 2) + '\n')
    console.info(`${name}: first-use guidance, suppression, permanent claims and isolation passed`)
  } finally {
    await browser.close()
    await actor.context.dispose()
  }
}
