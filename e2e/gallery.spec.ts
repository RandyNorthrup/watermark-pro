/**
 * Gallery journey against the production build in workerd: a photo saved
 * from the editor lands in R2 with a thumbnail, shows in the gallery with
 * its preset, can be searched, opened, downloaded, and deleted.
 */

import {
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
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Gallery')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gallery')
  await expect(page.getByText(/No photos yet/)).toBeVisible()
  await expectAccessible(page)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Gil')
  await page.getByLabel('Preset name').fill('Gallery preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await page.getByRole('link', { name: 'Open Gallery preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  await expect(
    page
      .getByRole('list', { name: 'Layers, bottom to top' })
      .getByRole('button', { pressed: true }),
  ).toHaveText(/Gallery preset/)
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('button', { name: 'Save to gallery' }).click()
  await expect(page.getByText(/Saved sample-photo-watermarked\.png to the/)).toBeVisible()
  await page.getByRole('status').getByRole('link', { name: 'gallery' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gallery')
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
  await page.getByLabel('Preset', { exact: true }).selectOption({ label: 'Gallery preset' })
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
