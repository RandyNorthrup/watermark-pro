/** Export and independently decode a real hidden payload, then exercise the user-facing verifier. */
import rasterize from 'sharp'

import { PREVIEW_ORIGIN } from './preview'
import {
  downloadBytes,
  expect,
  expectAccessible,
  expectActiveWorkspace,
  navigateTo,
  pngFixture,
  pngSize,
  signUpAndVerify,
  test,
} from './support'
import { readInvisibleMark } from '../src/client/engine/invisible'
import { watermarkDtoSchema } from '../src/shared/api-watermark'
import { DEFAULT_TEXT_SPEC } from '../src/shared/watermark'

const MESSAGE = 'Synthetic ownership • رقم 42'
const PHOTO_SIZE = { width: 640, height: 480 }

async function decodedMessage(bytes: Buffer) {
  const { data, info } = await rasterize(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return readInvisibleMark(new Uint8ClampedArray(data), info.width, info.height)
}

test('exports a recoverable invisible PNG mark and distinguishes absent and unreadable images', async ({
  page,
  request,
}) => {
  const person = {
    name: 'Verify Owner',
    email: `verify-${crypto.randomUUID()}@example.test`,
    password: 'synthetic verification passphrase',
  }
  await signUpAndVerify(page, request, person)
  const { organization } = await expectActiveWorkspace(page, person, 'My workspace')
  const response = await page.request.post(`/api/orgs/${organization.id}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: { name: 'Visible ownership stamp', spec: DEFAULT_TEXT_SPEC },
  })
  expect(response.status()).toBe(201)
  const preset = watermarkDtoSchema.parse(await response.json())
  // API fixture writes bypass TanStack Query. Reload cached shell queries.
  await page.reload()
  await navigateTo(page, 'Editor')
  await page.getByRole('tab', { name: 'Presets', exact: true }).click()
  await page.getByRole('combobox', { name: 'Preset', exact: true }).selectOption(preset.id)
  await page.getByRole('tab', { name: 'Presets', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(preset.name)
  const original = pngFixture(PHOTO_SIZE.width, PHOTO_SIZE.height, [48, 93, 104])
  expect(await decodedMessage(original)).toBeNull()
  await page
    .getByLabel('Open a photo')
    .setInputFiles({ name: 'ownership.png', mimeType: 'image/png', buffer: original })
  await expect(page.getByText(/ownership.png/)).toBeVisible()
  await page.getByRole('tab', { name: 'Export', exact: true }).click()
  const invisible = page.getByRole('switch', { name: 'Invisible mark', exact: true })
  await expect(invisible).toBeDisabled()
  await page.getByRole('combobox', { name: 'Format', exact: true }).click()
  await page.getByRole('option', { name: 'PNG', exact: true }).click()
  await invisible.setChecked(true)
  await page.getByLabel('Invisible message', { exact: true }).fill(MESSAGE)
  await expectAccessible(page)
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await pendingDownload
  expect(download.suggestedFilename()).toBe('ownership-watermarked.png')
  const marked = await downloadBytes(download)
  expect(pngSize(marked)).toEqual(PHOTO_SIZE)
  expect(await decodedMessage(marked)).toBe(MESSAGE)

  await navigateTo(page, 'Gallery')
  await page.getByRole('link', { name: 'Check a photo', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verify a photo')
  const input = page.getByLabel('Photo to check', { exact: true })
  await input.setInputFiles({ name: 'marked.png', mimeType: 'image/png', buffer: marked })
  await expect(page.getByText('Invisible mark found', { exact: true })).toBeVisible()
  await expect(page.getByText(MESSAGE, { exact: true })).toBeVisible()
  await expectAccessible(page)

  await input.setInputFiles({ name: 'unmarked.png', mimeType: 'image/png', buffer: original })
  await expect(
    page.getByText('No invisible mark found in this photo.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(MESSAGE, { exact: true })).toHaveCount(0)
  await expect(page.getByText('Invisible mark found', { exact: true })).toHaveCount(0)
  await expectAccessible(page)

  await input.setInputFiles({
    name: 'unreadable.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    page.getByText('No invisible mark found in this photo.', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText(MESSAGE, { exact: true })).toHaveCount(0)
  await expectAccessible(page)
})
