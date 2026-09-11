/**
 * Editor journey against the production build in workerd: open a preset from
 * the library, place it by keyboard, crop to a square, resize, and download
 * a real PNG whose dimensions match the chosen output size.
 */
import type { Page } from '@playwright/test'
import rasterize from 'sharp'

import {
  createWorkspace,
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  pngSize,
  pngFixture,
  signUpAndVerify,
  test,
} from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Edie Editor',
  email: `edie-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Editor ${runId}`

test('first photo goes from an empty library to a real watermarked export in the editor', async ({
  page,
  request,
}, testInfo) => {
  await signUpAndVerify(page, request, { ...owner, email: `first-editor-${runId}@example.test` })
  await navigateTo(page, 'Editor')
  const colour: [number, number, number] = [48, 93, 104]
  const photo = pngFixture(960, 640, colour)
  await page
    .getByLabel('Open a photo')
    .setInputFiles({ name: 'first-photo.png', mimeType: 'image/png', buffer: photo })
  await expect(page.getByRole('button', { name: 'Create watermark' })).toHaveCount(0)
  const designer = page.getByRole('tabpanel', { name: 'Watermark', exact: true })
  await designer.getByLabel('Preset name').fill('First signature')
  await designer.getByRole('textbox', { name: 'Text' }).fill('© My first photo')
  await expectRendered(page, /Photo with the watermark applied/)
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('first-watermark-designer.png') })
  await designer.getByRole('button', { name: 'Save and use' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/app\/editor$/)
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(
    'First signature',
  )
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await expectAccessible(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const bytes = await downloadBytes(await downloadPromise)
  expect(pngSize(bytes)).toEqual({ width: 960, height: 640 })
  const pixels = await rasterize(bytes).removeAlpha().raw().toBuffer()
  let changed = 0
  for (let offset = 0; offset < pixels.length; offset += 3)
    if (
      pixels[offset] !== colour[0] ||
      pixels[offset + 1] !== colour[1] ||
      pixels[offset + 2] !== colour[2]
    )
      changed += 1
  expect(changed).toBeGreaterThan(100)
  await navigateTo(page, 'Library')
  await expect(page.getByRole('link', { name: 'First signature', exact: true })).toBeVisible()
})

async function expectRendered(page: Page, name: RegExp) {
  const image = page.getByRole('img', { name })
  await expect(image).toBeVisible()
  await expect
    .poll(async () => await image.evaluate((img: { naturalWidth: number }) => img.naturalWidth))
    .toBeGreaterThan(0)
}

test('edits a photo end to end and downloads the result', async ({ page, request }) => {
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Edie')
  await page.getByLabel('Preset name').fill('Editor preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Editor preset', exact: true })).toBeVisible()

  // A QR code preset for the second layer.
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('tab', { name: 'QR code' }).click()
  await page.getByLabel('QR code content').fill('https://lumafoil.com')
  await page.getByLabel('Preset name').fill('QR link')
  await expect(
    page.getByRole('img', { name: 'Watermark preview on the subject photo' }),
  ).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'QR link', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Open Editor preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  // A cold load of the editor asks for the sample scene at boot, before the
  // session and organization fetches the page waits on (PLAN.md §5.5).
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveAttribute(
    'href',
    '/sample-scene.jpg',
  )
  const layers = page.getByRole('list', { name: 'Layers, bottom to top' })
  await expect(layers.getByRole('button', { pressed: true })).toHaveText(/Editor preset/)
  await expectRendered(page, /Photo with the watermark/)
  await expectAccessible(page)

  // A second layer: a QR code on top, adjusted, then removed again.
  await page
    .getByRole('combobox', { name: 'Add another preset' })
    .selectOption({ label: 'QR link' })
  await expect(layers.getByRole('listitem')).toHaveCount(2)
  await expect(layers.getByRole('button', { pressed: true })).toHaveText(/QR link/)
  await expectRendered(page, /Photo with the watermark/)
  await expectAccessible(page)
  await layers.getByRole('button', { name: 'Remove QR link from this photo' }).click()
  await expect(layers.getByRole('listitem')).toHaveCount(1)

  const frame = page.getByRole('group', { name: /Watermark position/ })
  await expect(frame).toBeVisible()
  await frame.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('[')
  await expect(page.getByText(/Adjusted for this photo/)).toBeVisible()
  await expectRendered(page, /Photo with the watermark/)

  const box = await frame.boundingBox()
  expect(box).not.toBeNull()
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 40, { steps: 5 })
    await page.mouse.up()
  }
  await expect(page.getByRole('button', { name: 'Undo', exact: true }).first()).toBeEnabled()

  await page.getByRole('tab', { name: 'Crop' }).click()
  await expectRendered(page, /Photo with the crop frame/)
  await page.getByRole('button', { name: '1:1' }).click()
  await expect(page.getByLabel('Width (px)')).toHaveValue('640')
  await expect(page.getByRole('group', { name: /Crop area/ })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('tab', { name: 'Resize' }).click()
  await page.getByRole('button', { name: '50%' }).click()
  await expect(page.getByLabel('Height (px)')).toHaveValue('320')
  await expect(page.getByText('Output 320 × 320 px.')).toBeVisible()
  await expectRendered(page, /Photo with the watermark/)
  await expectAccessible(page)

  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await expectAccessible(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('sample-photo-watermarked.png')
  const bytes = await downloadBytes(download)
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(pngSize(bytes)).toEqual({ width: 320, height: 320 })

  await page.keyboard.press('Control+z')
  await page.getByRole('tab', { name: 'Resize' }).click()
  await expect(page.getByLabel('Height (px)')).toHaveValue('640')
})

test('filters and rotates a photo, and exports the turned result', async ({ page, request }) => {
  const adjuster = {
    name: 'Ada Adjust',
    email: `ada-${runId}@example.test`,
    password: 'correct horse battery',
  }
  await createWorkspace(page, request, adjuster, `Adjust ${runId}`)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Ada')
  await page.getByLabel('Preset name').fill('Ada preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Ada preset', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Open Ada preset in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  await expectRendered(page, /Photo with the watermark/)

  // Mono greyscales the whole photo (pixel correctness is covered by the
  // engine's unit and browser tests; here the journey just applies it).
  await page.getByRole('tab', { name: 'Adjust' }).click()
  await page.getByRole('radio', { name: 'Mono' }).click()
  await expect(page.getByText('Filter: Mono')).toBeVisible()
  await expectRendered(page, /Photo with the watermark/)
  await expectAccessible(page)

  // Rotate right on the Crop tab: the 960×640 sample turns to portrait.
  await page.getByRole('tab', { name: 'Crop' }).click()
  await page.getByRole('button', { name: 'Rotate right' }).click()
  await expectRendered(page, /Photo with the crop frame/)

  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const download = await downloadPromise
  const bytes = await downloadBytes(download)
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(pngSize(bytes)).toEqual({ width: 640, height: 960 })
})
