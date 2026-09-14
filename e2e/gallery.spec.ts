/**
 * Gallery journey against the production build in workerd: a photo saved
 * from the editor lands in R2 with a thumbnail, shows in the gallery with
 * its preset, can be searched, opened, downloaded, and deleted.
 */

import {
  saveSampleImage,
  createWorkspace,
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  pngSize,
  test,
} from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Gil Gallery',
  email: `gil-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Gallery ${runId}`

test('saves from the editor, browses, searches, downloads and deletes', async ({
  page,
  request,
}) => {
  // Real upload, four accessibility scans, download and deletion share one mobile journey.
  test.slow()
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Watermarked Images')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watermarked Images')
  await expect(page.getByText(/No photos yet/)).toBeVisible()
  await expectAccessible(page)

  await navigateTo(page, 'Saved Watermarks')
  await page.getByRole('link', { name: 'New watermark' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Gil')
  await page.getByLabel('Watermark name').fill('Gallery preset')
  await page.getByRole('button', { name: 'Save watermark' }).click()
  await page.getByRole('link', { name: 'Open Gallery preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Images')
  await page.getByRole('tab', { name: 'Saved' }).click()
  await expect(
    page
      .getByRole('list', { name: 'Layers, bottom to top' })
      .getByRole('button', { pressed: true }),
  ).toHaveText(/Gallery preset/)
  await saveSampleImage(page)
  await page.getByRole('status').getByRole('link', { name: 'Watermarked Images' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watermarked Images')
  const card = page.getByRole('button', { name: 'Open sample-photo-watermarked.png' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('960 × 640 · Gallery preset')
  await expect(page.getByTestId('usage-summary')).toContainText('1 photo ·')
  await expectAccessible(page)

  const search = page.getByRole('searchbox', { name: 'Search', exact: true })
  await search.fill('nothing')
  await expect(page.getByText('No photos match these filters.')).toBeVisible()
  await search.fill('sample')
  await expect(card).toBeVisible()
  await page
    .getByLabel('Saved Watermark', { exact: true })
    .selectOption({ label: 'Gallery preset' })
  await expect(card).toBeVisible()

  await card.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'sample-photo-watermarked.png' })).toBeVisible()
  await expectAccessible(page)
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('link', { name: 'Download' }).click()
  const download = await downloadPromise
  expect(pngSize(await downloadBytes(download))).toEqual({ width: 960, height: 640 })

  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/No photos match these filters|No photos yet/)).toBeVisible()
  await expect(page.getByTestId('usage-summary')).toContainText('0 photos ·')

  await navigateTo(page, 'Audit log')
  await expect(page.getByText('photo.uploaded')).toBeVisible()
  await expect(page.getByText('photo.deleted')).toBeVisible()
})
