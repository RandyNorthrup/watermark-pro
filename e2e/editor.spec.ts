/**
 * Editor journey against the production build in workerd: open a preset from
 * the library, place it by keyboard, crop to a square, resize, and download
 * a real PNG whose dimensions match the chosen output size.
 */
import type { Page } from '@playwright/test'

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
  name: 'Edie Editor',
  email: `edie-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Editor ${runId}`

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
  await page.getByLabel('QR code content').fill('https://watermark.blowmoney.net')
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
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()

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
