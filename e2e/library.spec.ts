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
  expectActiveWorkspace,
  gotoRetrying,
  latestLinkFor,
  navigateTo,
  pngFixture,
  signIn,
  signUpAndVerify,
  test,
} from './support'
import { DEFAULT_TEXT_SPEC } from '../src/shared/watermark'

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

test('saves multiple QR codes and a licensed sticker for reuse', async ({ page, request }) => {
  await createWorkspace(
    page,
    request,
    { ...owner, email: `creative-${runId}@example.test` },
    `Creative ${runId}`,
  )
  await navigateTo(page, 'Library')
  for (const [name, content] of [
    ['Portfolio QR', 'https://example.com/portfolio'],
    ['Contact QR', 'https://example.com/contact'],
  ] as const) {
    await page.getByRole('link', { name: 'New QR code' }).click()
    await page.getByLabel('Preset name').fill(name)
    await page.getByLabel('QR code content').fill(content)
    await expectPreviewRendered(page)
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save preset' }).click()
    await expect(page.getByRole('link', { name: name, exact: true })).toBeVisible()
  }
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('tab', { name: 'Symbol' }).click()
  await page.getByRole('searchbox', { name: 'Search stickers' }).fill('camera')
  await page.getByRole('button', { name: 'Choose Camera', exact: true }).click()
  await expectPreviewRendered(page)
  await expectAccessible(page)
  await page.getByLabel('Preset name').fill('Camera sticker')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await page.getByRole('button', { name: 'QR codes only' }).click()
  await expect(page.getByRole('link', { name: 'Portfolio QR', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact QR', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Camera sticker', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Portfolio QR', exact: true }).click()
  await expect(page.getByLabel('QR code content')).toHaveValue('https://example.com/portfolio')
  await expect(page.getByLabel('QR code content')).not.toHaveValue('https://example.com/contact')
  await expectPreviewRendered(page)
})

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
  const fontPicker = page.getByRole('combobox', { name: 'Font', exact: true })
  await fontPicker.click()
  await page.getByRole('searchbox', { name: 'Search fonts', exact: true }).fill('Pacifico')
  await page.getByRole('option', { name: 'Pacifico', exact: true }).click()
  await expect(fontPicker).toContainText('Pacifico')
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
  // The chosen file opens the Prepare panel; "Use logo" applies it and uploads.
  await page.getByRole('button', { name: 'Use logo' }).click()
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
  // WebKit intermittently aborts the client-side load of this route; retry the
  // commit-wait navigation (see gotoRetrying).
  await gotoRetrying(viewerPage, acceptPath)
  await viewerPage.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText('Members')
  const joined = await expectActiveWorkspace(viewerPage, viewer, organizationName)
  expect(joined.member.role).toBe('viewer')
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

  const forbidden = await viewerContext.request.post(
    `/api/orgs/${joined.organization.id}/watermarks`,
    {
      data: { name: 'Viewer cannot create this preset', spec: DEFAULT_TEXT_SPEC },
    },
  )
  expect(forbidden.status()).toBe(403)
  await viewerContext.close()
})
