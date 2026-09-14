/**
 * Sharing journey against the production build in workerd: a gallery photo
 * is published under a link, a visitor with no session opens it and
 * downloads the photo, the link is revoked, and the visitor is shut out.
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
  name: 'Sal Share',
  email: `sal-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Share ${runId}`

test('publishes a link, serves a visitor, and revokes', async ({ browser, page, request }) => {
  test.slow()
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Saved Watermarks')
  await page.getByRole('link', { name: 'New watermark' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Sal')
  await page.getByLabel('Watermark name').fill('Share preset')
  await page.getByRole('button', { name: 'Save watermark' }).click()
  await page.getByRole('link', { name: 'Open Share preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Images')
  await page.getByRole('button', { name: 'Save Image' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('button', { name: 'Save To Watermarked Images' }).click()
  await page.getByRole('status').getByRole('link', { name: 'Watermarked Images' }).click()

  await page.getByRole('checkbox', { name: 'Select sample-photo-watermarked.png' }).check()
  await page.getByRole('button', { name: 'Share 1' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title', { exact: true }).fill('Visitor preview')
  await dialog.getByRole('radio', { name: '7 days' }).click()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const url = await dialog.getByLabel('Link', { exact: true }).inputValue()
  expect(url).toMatch(/\/share\/[\w-]+\.\d+\.[\w-]+$/)
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByText('Link copied to the clipboard.')).toBeVisible()
  await page.keyboard.press('Escape')

  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  await visitor.goto(url)
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Visitor preview')
  await expect(visitor.getByText(/1 photo · available until/)).toBeVisible()
  await expectAccessible(visitor)
  await visitor.getByRole('button', { name: 'Open sample-photo-watermarked.png' }).click()
  const lightbox = visitor.getByRole('dialog')
  await expectAccessible(visitor)
  const downloadPromise = visitor.waitForEvent('download')
  await lightbox.getByRole('link', { name: 'Download' }).click()
  const download = await downloadPromise
  expect(pngSize(await downloadBytes(download))).toEqual({ width: 960, height: 640 })

  // The visitor cannot reach anything outside the link.
  const forbidden = await visitorContext.request.get('/api/orgs/anything/photos')
  expect(forbidden.status()).toBe(401)
  const tampered = await visitorContext.request.get(
    `${new URL(url).pathname.replace('/share/', '/api/share/')}x`,
  )
  expect(tampered.status()).toBe(404)

  await navigateTo(page, 'Watermarked Images')
  await expect(page.getByRole('link', { name: 'Shares', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Manage Links', exact: true }).click()
  const links = page.getByRole('dialog', { name: 'Manage Links', exact: true })
  await expect(links.getByText('Visitor preview')).toBeVisible()
  await expectAccessible(page)
  await links.getByRole('button', { name: 'Revoke Visitor preview' }).click()
  await expect(links.getByText('revoked')).toBeVisible()
  await links.getByRole('button', { name: 'Close', exact: true }).click()

  await visitor.reload()
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('This link is not available')
  await expectAccessible(visitor)
  await visitorContext.close()

  await navigateTo(page, 'Audit log')
  await expect(page.getByText('share.created')).toBeVisible()
  await expect(page.getByText('share.revoked')).toBeVisible()
})
