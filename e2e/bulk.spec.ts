/**
 * Bulk journey against the production build in workerd: twenty generated
 * PNG fixtures go through the worker pool with a library preset, the ZIP is
 * downloaded and unpacked in Node, and every entry is a real image of the
 * requested size.
 */
import { unzipSync } from 'fflate'

import {
  createWorkspace,
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  pngFixture,
  pngSize,
  test,
} from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Bea Batch',
  email: `bea-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Batch ${runId}`
const FIXTURES = 20
const FIXTURE_WIDTH = 640
const FIXTURE_HEIGHT = 400

test('watermarks twenty photos and downloads them as a ZIP', async ({ page, request }) => {
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  // Two presets: a coloured, boxed, two-line text with a date stamp, and a symbol.
  await page.getByRole('textbox', { name: 'Text' }).fill('© Batch\n{date} {filename}')
  await page.getByRole('tab', { name: 'Style' }).click()
  await page.getByRole('radio', { name: 'Colour' }).click()
  await page.getByRole('switch', { name: 'Box behind the mark' }).click()
  await page.getByLabel('Preset name').fill('Batch preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Batch preset', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('tab', { name: 'Symbol' }).click()
  await page.getByLabel('Preset name').fill('Batch symbol')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Batch symbol', exact: true })).toBeVisible()
  // Two cards with long descriptions must still fit a phone's width.
  await expectAccessible(page)

  await navigateTo(page, 'Bulk')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bulk watermarking')
  await expectAccessible(page)

  await page.getByLabel('Add photos').setInputFiles(
    Array.from({ length: FIXTURES }, (_, index) => ({
      name: `shot-${String(index + 1).padStart(2, '0')}.png`,
      mimeType: 'image/png',
      buffer: pngFixture(FIXTURE_WIDTH, FIXTURE_HEIGHT, [
        (index * 37) % 256,
        (index * 91) % 256,
        (index * 53) % 256,
      ]),
    })),
  )
  await expect(
    page.getByRole('heading', { level: 2, name: `${String(FIXTURES)} photos` }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: 'Batch preset' }).check()
  await page.getByRole('checkbox', { name: 'Batch symbol' }).check()
  await expect(page.getByText('applied in the order ticked')).toBeVisible()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('combobox', { name: 'Size' }).click()
  await page.getByRole('option', { name: 'Fit 1080 px' }).click()
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Start' }).click()
  const allDone = `${String(FIXTURES)} of ${String(FIXTURES)} finished in`
  await expect(page.getByText(allDone)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Failed')).toHaveCount(0)
  await expectAccessible(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: `Download ${String(FIXTURES)} as ZIP` }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`watermarked-${String(FIXTURES)}-photos.zip`)
  const files = unzipSync(await downloadBytes(download))
  const names = Object.keys(files).toSorted((a, b) => a.localeCompare(b))
  expect(names).toHaveLength(FIXTURES)
  expect(names[0]).toBe('shot-01-watermarked.png')
  for (const name of names) {
    const bytes = files[name]
    expect(bytes).toBeDefined()
    if (bytes !== undefined) {
      expect(Buffer.from(bytes.subarray(1, 4)).toString('ascii')).toBe('PNG')
      // Fit 1080 never enlarges: the 640×400 fixtures keep their size.
      expect(pngSize(bytes)).toEqual({ width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT })
    }
  }
})
