/** Real mobile editor rendering and Chromium touch traffic, using isolated disposable accounts. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, devices, expect, webkit } from '@playwright/test'

import { createAuditAccount } from './audit-accounts.mjs'
import { GUIDANCE_TOPICS } from '../../src/shared/guidance.ts'

const ORIGIN = 'http://localhost:5273'
const OUTPUT = 'temp/editor-controls-qa'
const PROFILES = {
  desktop: { engine: chromium, options: { viewport: { width: 1440, height: 980 } } },
  phone: { engine: webkit, options: devices['iPhone 14'] },
  tablet: { engine: webkit, options: devices['iPad Mini'] },
  android: { engine: chromium, options: devices['Pixel 7'] },
}
const reports = []
await mkdir(OUTPUT, { recursive: true })

async function fontReady(page, family) {
  await page.waitForFunction(
    (name) =>
      [...globalThis.document.fonts].some(
        (face) => face.family.replaceAll(/['"]/g, '') === name && face.status === 'loaded',
      ),
    family,
  )
}

async function capture(page, name) {
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: true, animations: 'disabled' })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    results.violations.map(({ id }) => id),
    [],
    name,
  )
  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
  )
  assert.ok(overflow <= 1, `${name}: horizontal overflow ${overflow}`)
}

function touchPoint(id, x, y) {
  return { id, x, y, radiusX: 2, radiusY: 2, force: 1 }
}

async function nativeTouch(page, context) {
  const session = await context.newCDPSession(page)
  const frame = page.getByRole('group', { name: /Watermark position/ })
  await frame.scrollIntoViewIfNeeded()
  const box = await frame.boundingBox()
  assert.ok(box)
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touchPoint(1, centre.x - 16, centre.y), touchPoint(2, centre.x + 16, centre.y)],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      touchPoint(1, centre.x - 20, centre.y - 20),
      touchPoint(2, centre.x + 20, centre.y + 20),
    ],
  })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect
    .poll(async () =>
      Math.abs(
        Number(await page.getByRole('slider', { name: 'Rotation', exact: true }).inputValue()),
      ),
    )
    .toBeGreaterThan(35)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Rotation', exact: true })).toHaveValue('0')
  await session.detach()
}

for (const [name, profile] of Object.entries(PROFILES)) {
  const actor = await createAuditAccount(ORIGIN, 'Tools QA')
  // This fixture represents a returning user. Fresh-account discovery and
  // permanent dismissals are verified separately by the guidance browser flow.
  for (const topic of GUIDANCE_TOPICS) {
    const claim = await actor.context.post('/api/me/guidance/claim', { data: { topic } })
    assert.equal(claim.status(), 200)
  }
  const browser = await profile.engine.launch()
  try {
    const context = await browser.newContext({
      ...profile.options,
      colorScheme: 'dark',
      baseURL: ORIGIN,
    })
    const storage = await actor.context.storageState()
    await context.addCookies(storage.cookies)
    const page = await context.newPage()
    await page.goto('/app/editor')
    const donate = page.getByRole('link', { name: 'Donate with PayPal (opens a new tab)' })
    await expect(donate).toHaveAttribute(
      'href',
      'https://www.paypal.com/donate/?hosted_button_id=Q9VC7B42R7K82',
    )
    const text = page.getByRole('textbox', { name: 'Text', exact: true })
    await text.fill('Lumafoil')
    await text.press('End')
    await page.getByRole('button', { name: 'Insert ©', exact: true }).click()
    await expect(text).toHaveValue('Lumafoil©')
    const status = page.locator('[aria-live="polite"]').filter({ hasText: /Sample scene/ })
    const statusSize = await status.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number(globalThis.getComputedStyle(element).lineHeight.replace('px', '')),
    }))
    assert.ok(
      statusSize.height <= statusSize.lineHeight + 1,
      `${name}: canvas status must stay one line`,
    )
    const header = page.locator('header').filter({ has: donate })
    const headerMode = await header.evaluate(
      (element) => globalThis.getComputedStyle(element).position,
    )
    if (name === 'phone' || name === 'android') {
      assert.notEqual(headerMode, 'sticky')
      await page.evaluate(() => globalThis.scrollTo(0, 0))
      const initialHeader = await header.boundingBox()
      assert.ok(initialHeader)
      await page.evaluate(() => globalThis.scrollTo(0, 180))
      await expect
        .poll(async () => {
          const box = await header.boundingBox()
          return box?.y ?? Infinity
        })
        .toBeLessThan(initialHeader.y - 100)
      await page.evaluate(() => globalThis.scrollTo(0, 0))
    }
    const toolbar = page.getByRole('toolbar', { name: 'Text symbols' })
    await expect(toolbar.getByRole('button', { name: 'Insert detail' })).toBeVisible()
    const font = page.getByRole('combobox', { name: 'Font', exact: true })
    await font.click()
    const firstFamily = await page
      .getByRole('listbox', { name: 'Font' })
      .getByRole('option')
      .first()
      .getAttribute('data-font-family')
    assert.ok(firstFamily)
    await fontReady(page, firstFamily)
    await expect(page.getByText('All Fonts', { exact: true })).toHaveCount(0)
    await page.getByRole('searchbox', { name: 'Search fonts' }).fill('Lobster')
    await fontReady(page, 'Lobster')
    await capture(page, `${name}-fonts`)
    await page.getByRole('option', { name: 'Lobster', exact: true }).click()
    const activeFont = await font
      .locator('span')
      .first()
      .evaluate((element) => ({
        current: globalThis.getComputedStyle(element).fontFamily,
        normal: globalThis.getComputedStyle(globalThis.document.body).fontFamily,
      }))
    assert.equal(activeFont.current, activeFont.normal)
    await capture(page, `${name}-text`)
    await page.getByRole('tab', { name: 'Shape', exact: true }).click()
    await expect(
      page.getByRole('radiogroup', { name: 'Shape', exact: true }).getByRole('radio'),
    ).toHaveCount(20)
    await page.getByRole('radio', { name: 'Star', exact: true }).click()
    await capture(page, `${name}-shapes`)
    await page.getByRole('tab', { name: 'Placement', exact: true }).click()
    await page.getByRole('radio', { name: 'Custom', exact: true }).click()
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    await page.getByRole('slider', { name: 'Size', exact: true }).fill('0.3')
    await expect(page.getByRole('status', { name: 'Rendering preview' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Resize watermark' })).toHaveCount(0)
    await page.getByRole('group', { name: /Watermark position/ }).click()
    const handle = await page.getByRole('button', { name: 'Resize watermark' }).boundingBox()
    assert.ok(
      handle && handle.width <= 20 && handle.height <= 20,
      `${name}: canvas handle must stay compact`,
    )
    await capture(page, `${name}-style`)
    if (name === 'android') await nativeTouch(page, context)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const naming = page.getByRole('dialog', { name: 'Save preset' })
    await naming.getByLabel('Preset name').fill('Tools QA preset')
    await capture(page, `${name}-save`)
    await naming.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(naming).toHaveCount(0)
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(page.getByRole('group', { name: /Watermark position/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Account menu for Tools QA' }).click()
    const accountMenu = page.getByRole('menu')
    await expect(accountMenu.getByText('My workspace', { exact: true })).toBeVisible()
    await accountMenu.getByRole('menuitem', { name: 'Manage Access' }).click()
    await expect(page.getByRole('dialog', { name: 'Manage Access' })).toBeVisible()
    await expect(page).toHaveURL(/\/app\/editor$/)
    await expect(
      page
        .getByRole('dialog', { name: 'Manage Access' })
        .getByRole('heading', { name: 'People With Access' }),
    ).toBeVisible()
    await capture(page, `${name}-access`)
    reports.push({
      profile: name,
      fontPreviewLoaded: true,
      shapes: 20,
      nativeTouch: name === 'android',
      nameDialog: true,
      newWorkspace: true,
      manageAccess: true,
    })
    await writeFile(`${OUTPUT}/report.json`, JSON.stringify(reports, null, 2) + '\n')
    console.info(`${name}: font rendering, controls, naming and workspace reset passed`)
  } finally {
    await browser.close()
    await actor.context.dispose()
  }
}
await writeFile(`${OUTPUT}/report.json`, JSON.stringify(reports, null, 2) + '\n')
