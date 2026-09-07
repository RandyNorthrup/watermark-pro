/**
 * Watermark library journey against the production build in workerd:
 * an owner designs a text preset with a live preview, uploads a logo and
 * saves a logo preset, edits and deletes from the library, and a viewer
 * sees the library read-only.
 */
import type { Page } from '@playwright/test'

import {
  createWorkspace,
  expect,
  expectAccessible,
  latestLinkFor,
  navigateTo,
  pngFixture,
  signIn,
  signUpAndVerify,
  test,
} from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Lena Library',
  email: `lena-${runId}@example.test`,
  password: 'correct horse battery',
}
const viewer = {
  name: 'Vic Viewer',
  email: `vic-lib-${runId}@example.test`,
  password: 'viewers long password',
}
const organizationName = `Library ${runId}`
const LOGO_WIDTH = 48
const LOGO_HEIGHT = 24

async function expectPreviewRendered(page: Page) {
  const preview = page.getByRole('img', { name: 'Watermark preview on the subject photo' })
  await expect(preview).toBeVisible()
  // A broken or still-loading image has no natural size.
  await expect
    .poll(async () => await preview.evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBeGreaterThan(0)
}

test.describe.configure({ mode: 'serial' })

test('owner designs, saves, edits and deletes presets', async ({ page, request }) => {
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Library')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watermark library')
  await expect(page.getByText(/No presets yet/)).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('link', { name: 'New preset' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New preset')
  await expectPreviewRendered(page)
  await expect(page.getByText(/^Placed .*, (light|dark) ink\.$/)).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('textbox', { name: 'Text' }).fill(`© ${organizationName}`)
  await page.getByLabel('Font').selectOption('Pacifico')
  await page.getByRole('tab', { name: 'Placement' }).click()
  await page.getByRole('radio', { name: 'Corner' }).click()
  await page.getByRole('button', { name: 'Bottom left' }).click()
  await expect(page.getByText('Placed bottom left, dark ink.')).toBeVisible()
  await page.getByRole('tab', { name: 'Style' }).click()
  await expectAccessible(page)
  await page.getByLabel('Preset name').fill('Script signature')
  await page.getByRole('button', { name: 'Save preset' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watermark library')
  await expect(page.getByRole('link', { name: 'Script signature', exact: true })).toBeVisible()
  await expect(page.getByText(`“© ${organizationName}” in Pacifico`)).toBeVisible()
  await expect(page.getByText('bottom left')).toBeVisible()

  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('tab', { name: 'Logo' }).click()
  await expect(page.getByText(/No logos yet/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save preset' })).toBeDisabled()
  await page.getByLabel('Upload a logo file').setInputFiles({
    name: 'brand-mark.png',
    mimeType: 'image/png',
    buffer: pngFixture(LOGO_WIDTH, LOGO_HEIGHT, [0xff, 0x33, 0x66]),
  })
  await expect(page.getByRole('button', { name: 'Logo brand-mark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('48 × 24')).toBeVisible()
  await expectPreviewRendered(page)
  await expectAccessible(page)
  await page.getByLabel('Preset name').fill('Corner logo')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Corner logo', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Script signature', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Script signature')
  await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue(`© ${organizationName}`)
  await expectPreviewRendered(page)
  await page.getByLabel('Preset name').fill('Script signature v2')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('link', { name: 'Script signature v2', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete Script signature v2' }).click()
  await expect(page.getByRole('link', { name: 'Script signature v2', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Corner logo', exact: true })).toBeVisible()

  await navigateTo(page, 'Audit log')
  await expect(page.getByText('watermark.created').first()).toBeVisible()
  await expect(page.getByText('asset.uploaded')).toBeVisible()
  await expect(page.getByText('watermark.deleted')).toBeVisible()
})

test('a viewer can browse presets but cannot change them', async ({ browser, page, request }) => {
  await signIn(page, owner, organizationName)
  await navigateTo(page, 'Members')
  await page.getByLabel('Email').fill(viewer.email)
  await page.getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: 'Viewer' }).click()
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText(`Invitation sent to ${viewer.email}.`)).toBeVisible()
  const acceptPath = await latestLinkFor(request, viewer.email, '/accept-invitation/')

  const viewerContext = await browser.newContext()
  const viewerPage = await viewerContext.newPage()
  await signUpAndVerify(viewerPage, request, viewer)
  await viewerPage.goto(acceptPath)
  await viewerPage.getByRole('button', { name: 'Accept invitation' }).click()
  await navigateTo(viewerPage, 'Library')
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText('Watermark library')
  await expect(viewerPage.getByRole('link', { name: 'Corner logo', exact: true })).toBeVisible()
  await expect(viewerPage.getByRole('link', { name: 'New preset' })).toHaveCount(0)
  await expect(viewerPage.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await expectAccessible(viewerPage)

  await viewerPage.getByRole('link', { name: 'Corner logo', exact: true }).click()
  await expect(viewerPage.getByText('Read-only view.')).toBeVisible()
  await expect(viewerPage.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  await expectPreviewRendered(viewerPage)
  await expectAccessible(viewerPage)

  const session = await viewerContext.request.get('/api/auth/get-session')
  const { session: active } = (await session.json()) as {
    session: { activeOrganizationId: string }
  }
  const orgId = active.activeOrganizationId
  const forbidden = await viewerContext.request.post(`/api/orgs/${orgId}/watermarks`, {
    data: { name: 'Nope', spec: {} },
  })
  expect(forbidden.status()).toBe(403)
  await viewerContext.close()
})
