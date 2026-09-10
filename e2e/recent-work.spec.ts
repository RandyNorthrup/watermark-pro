import type { Locator, Page } from '@playwright/test'

import { test } from './offline-network'
import {
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  pngFixture,
  pngSize,
  signUpAndVerify,
} from './support'

async function expectImage(link: Locator) {
  const image = link.locator('img')
  await expect(image).toBeVisible()
  await expect
    .poll(
      async () => await image.evaluate((element: { naturalWidth: number }) => element.naturalWidth),
    )
    .toBeGreaterThan(0)
}

async function signOut(page: Page, name: string) {
  await page.getByRole('button', { name: `Account menu for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}

test('recent work opens real content in three accessible views, survives offline use and stays private on account switch', async ({
  page,
  request,
  offlineNetwork,
}, testInfo) => {
  test.slow()
  const suffix = crypto.randomUUID()
  const owner = {
    name: 'Recent Owner',
    email: `recent-${suffix}@example.test`,
    password: 'correct horse battery',
  }
  await signUpAndVerify(page, request, owner)
  const recents = page.getByRole('region', { name: 'Recent work', exact: true })
  await expect(recents.getByText(/Your recent work appears here/)).toBeVisible()
  await expectAccessible(page)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByLabel('Preset name').fill('Private recent signature')
  await page.getByRole('textbox', { name: 'Text' }).fill('© Recent studio')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await page.getByRole('link', { name: 'Open Private recent signature in the editor' }).click()
  await page.getByLabel('Open a photo').setInputFiles({
    name: 'private-recent.png',
    mimeType: 'image/png',
    buffer: pngFixture(640, 480, [29, 71, 95]),
  })
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('button', { name: 'Save to gallery' }).click()
  await expect(page.getByText(/Saved private-recent-watermarked\.png to the/)).toBeVisible()
  await navigateTo(page, 'Dashboard')
  const photo = recents.getByRole('button', { name: 'private-recent-watermarked.png', exact: true })
  const preset = recents.getByRole('link', { name: 'Private recent signature', exact: true })
  await expect(photo).toBeVisible()
  await expectImage(photo)
  await expectImage(preset)
  await expect(recents.getByRole('listitem').first()).toContainText(
    'private-recent-watermarked.png',
  )
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('recent-thumbnails.png'), fullPage: true })

  await recents.getByRole('button', { name: 'List', exact: true }).click()
  await expect(recents.getByRole('list', { name: 'Recent work items' })).toHaveClass(/divide-y/)
  await expect(recents.locator('img')).toHaveCount(0)
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('recent-list.png'), fullPage: true })
  await recents.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(recents.getByRole('columnheader', { name: 'Location' })).toBeVisible()
  await expect(recents.getByRole('table')).toContainText('Last used')
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('recent-details.png'), fullPage: true })
  await page.reload()
  await expect(recents.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await recents.getByRole('searchbox').fill('signature')
  await expect(photo).toHaveCount(0)
  await expect(preset).toBeVisible()
  await recents.getByRole('searchbox').fill('')
  await preset.click()
  await expect(page.getByLabel('Preset name')).toHaveValue('Private recent signature')
  await navigateTo(page, 'Dashboard')
  await expect(recents.getByRole('row').nth(1)).toContainText('Private recent signature')

  await photo.click()
  const viewer = page.getByRole('dialog', { name: 'private-recent-watermarked.png' })
  await expectImage(viewer)
  await expectAccessible(page)
  const download = page.waitForEvent('download')
  await viewer.getByRole('link', { name: 'Download' }).click()
  const bytes = await downloadBytes(await download)
  expect(pngSize(bytes)).toEqual({ width: 640, height: 480 })
  await viewer.getByRole('button', { name: 'Close' }).click()
  // The full static inventory must install before the controller can own
  // this page; the existing slow-journey timeout still bounds that work.
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  await expect
    .poll(async () => await page.evaluate<boolean>('navigator.serviceWorker.controller !== null'))
    .toBe(true)
  await offlineNetwork.setOffline(true)
  await page.reload()
  await expect(photo).toBeVisible()
  await recents.getByRole('button', { name: 'List', exact: true }).click()
  await photo.click()
  await expectImage(viewer)
  await expectAccessible(page)
  await viewer.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(recents.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(recents.getByText('Activity waiting to sync')).toBeVisible()
  await offlineNetwork.setOffline(false)
  await expect(recents.getByText('Activity waiting to sync')).toHaveCount(0)
  await photo.click()
  await viewer.getByRole('button', { name: 'Delete' }).click()
  await expect(viewer).toHaveCount(0)
  await expect(photo).toHaveCount(0)
  await expect(preset).toBeVisible()
  await signOut(page, owner.name)

  await signUpAndVerify(page, request, {
    name: 'Other Recent Owner',
    email: `other-recent-${suffix}@example.test`,
    password: 'another private passphrase',
  })
  await expect(recents.getByText(/Your recent work appears here/)).toBeVisible()
  await expect(recents.getByRole('button', { name: 'Thumbnails', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Private recent signature')).toHaveCount(0)
  await expect(page.getByText('private-recent-watermarked.png')).toHaveCount(0)
  await expectAccessible(page)
})
