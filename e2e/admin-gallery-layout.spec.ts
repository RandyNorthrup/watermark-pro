import type { Locator, Page } from '@playwright/test'

import { PREVIEW_ORIGIN } from './preview'
import {
  expect,
  expectAccessible,
  expectActiveWorkspace,
  pngFixture,
  signIn,
  signUpAndVerify,
  test,
} from './support'
import { ensureTestSiteOwner, TEST_SITE_OWNER } from '../scripts/lib/test-site-owner'
import { DEFAULT_TEXT_SPEC } from '../src/shared/watermark'

async function settledFrame(page: Page) {
  await page.evaluate('document.fonts.ready')
  await page.evaluate(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  )
}

async function bounds(control: Locator) {
  const box = await control.boundingBox()
  if (box === null) throw new Error('Layout proof requires a visible control')
  return box
}

test('admin metrics preserve the real controls while account totals arrive', async ({ page }) => {
  await ensureTestSiteOwner(PREVIEW_ORIGIN)
  await signIn(page, TEST_SITE_OWNER, 'My workspace')
  const totals = Promise.withResolvers<undefined>()
  await page.route('**/api/admin/account-stats', async (route) => {
    await totals.promise
    await route.continue()
  })
  try {
    await page.goto('/app/admin')
    const search = page.getByLabel('Search by email', { exact: true })
    await expect(search).toBeVisible()
    await expect(page.getByText('Registered accounts', { exact: true })).toBeVisible()
    await expect(page.locator('dl').getByRole('status')).toHaveCount(4)
    await settledFrame(page)
    const before = await bounds(search)
    await expectAccessible(page)
    totals.resolve(undefined)
    await expect(page.locator('dl').getByRole('status')).toHaveCount(0)
    await settledFrame(page)
    expect(await bounds(search)).toEqual(before)
    await expectAccessible(page)
  } finally {
    totals.resolve(undefined)
  }
})

test('gallery controls keep their geometry as usage, preset options and real photos arrive', async ({
  page,
  request,
}) => {
  const person = {
    name: 'Gallery Layout',
    email: `gallery-layout-${crypto.randomUUID()}@example.test`,
    password: 'gallery layout proof password',
  }
  await signUpAndVerify(page, request, person)
  const { organization } = await expectActiveWorkspace(page, person, 'My workspace')
  const root = `/api/orgs/${organization.id}`
  const preset = await page.request.post(`${root}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: { name: 'Studio signature', spec: DEFAULT_TEXT_SPEC },
  })
  expect(preset.status()).toBe(201)
  const image = pngFixture(64, 32, [40, 90, 120])
  const photo = await page.request.post(`${root}/photos`, {
    headers: { origin: PREVIEW_ORIGIN },
    multipart: {
      file: { name: 'layout.png', mimeType: 'image/png', buffer: image },
      thumbnail: { name: 'thumb.png', mimeType: 'image/png', buffer: image },
      name: 'Layout photo',
      width: '64',
      height: '32',
    },
  })
  expect(photo.status()).toBe(201)
  const holds = {
    usage: Promise.withResolvers<undefined>(),
    presets: Promise.withResolvers<undefined>(),
    photos: Promise.withResolvers<undefined>(),
  }
  await page.route('**/api/orgs/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let key: keyof typeof holds | null = null
    if (pathname.endsWith('/photos/usage')) key = 'usage'
    else if (pathname.endsWith('/watermarks')) key = 'presets'
    else if (pathname.endsWith('/photos')) key = 'photos'
    if (key !== null && route.request().method() === 'GET') await holds[key].promise
    await route.continue()
  })
  try {
    await page.goto('/app/gallery')
    const search = page.getByLabel('Search', { exact: true })
    const filter = page.getByLabel('Preset', { exact: true })
    await expect(search).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeDisabled()
    await settledFrame(page)
    const before = { search: await bounds(search), filter: await bounds(filter) }
    await expectAccessible(page)
    for (const key of ['usage', 'presets', 'photos'] as const) {
      holds[key].resolve(undefined)
      if (key === 'usage') await expect(page.getByTestId('usage-summary')).toContainText('1 photo')
      else if (key === 'presets')
        await expect(filter.locator('option').filter({ hasText: 'Studio signature' })).toHaveCount(
          1,
        )
      else
        await expect(
          page.getByRole('button', { name: 'Open Layout photo', exact: true }),
        ).toBeVisible()
      await settledFrame(page)
      expect({ search: await bounds(search), filter: await bounds(filter) }).toEqual(before)
    }
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeEnabled()
    await expectAccessible(page)
  } finally {
    for (const hold of Object.values(holds)) hold.resolve(undefined)
  }
})
