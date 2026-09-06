/**
 * Sharing journey against the production build in workerd: a gallery photo
 * is published under a link, a visitor with no session opens it and
 * downloads the photo, the link is revoked, and the visitor is shut out.
 */
import { expect, test } from '@playwright/test'

import { createWorkspace, downloadBytes, expectAccessible, pngSize } from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Sal Share',
  email: `sal-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Share ${runId}`

test('publishes a link, serves a visitor, and revokes', async ({ browser, page, request }) => {
  await createWorkspace(page, request, owner, organizationName)

  await page.getByRole('link', { name: 'Library' }).first().click()
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Sal')
  await page.getByLabel('Preset name').fill('Share preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await page.getByRole('link', { name: 'Open Share preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('button', { name: 'Save to gallery' }).click()
  await page.getByRole('status').getByRole('link', { name: 'gallery' }).click()

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

  await page.getByRole('link', { name: 'Shares' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shares')
  await expect(page.getByText('Visitor preview')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Revoke Visitor preview' }).click()
  await expect(page.getByText('revoked')).toBeVisible()

  await visitor.reload()
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('This link is not available')
  await expectAccessible(visitor)
  await visitorContext.close()

  await page.getByRole('link', { name: 'Audit log' }).first().click()
  await expect(page.getByText('share.created')).toBeVisible()
  await expect(page.getByText('share.revoked')).toBeVisible()
})
