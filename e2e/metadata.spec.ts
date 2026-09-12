/** Real JPEG export checks privacy policy independently with exifr and rendered token pixels with sharp. */
import type { Page } from '@playwright/test'
import * as exifr from 'exifr'
import rasterize from 'sharp'
import { z } from 'zod'

import { PREVIEW_ORIGIN } from './preview'
import {
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  pngFixture,
  signUpAndVerify,
  test,
} from './support'
import {
  app1Segment,
  EXIF_IDENTIFIER,
  insertJpegSegments,
  jfifSegment,
} from '../src/client/engine/metadata/segments'
import { buildExifTiff } from '../src/client/test-support/exif-fixtures'
import { watermarkDtoSchema } from '../src/shared/api-watermark'

const CAMERA_MAKE = 'Example Camera Co'
const CAMERA_MODEL = 'TestCam 42'
const CAMERA_ISO = 640
const COLOUR: [number, number, number] = [48, 93, 104]
const TOKENS = '{camera} {iso}'
const LITERAL = `${CAMERA_MAKE} ${CAMERA_MODEL} ISO ${String(CAMERA_ISO)}`
const EXIF_FIELDS = z.object({
  Make: z.string().optional(),
  Model: z.string().optional(),
  ISO: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  Orientation: z.number().optional(),
  ExifImageWidth: z.number().optional(),
  ExifImageHeight: z.number().optional(),
})

async function exifFields(bytes: Buffer) {
  const parsed: unknown = await exifr.default.parse(bytes, {
    tiff: true,
    exif: true,
    gps: true,
    translateValues: false,
  })
  return EXIF_FIELDS.parse(parsed ?? {})
}

async function sourcePhoto() {
  const jpeg = await rasterize(pngFixture(640, 480, COLOUR))
    .jpeg({ quality: 95 })
    .toBuffer()
  const exif = buildExifTiff({
    make: CAMERA_MAKE,
    model: CAMERA_MODEL,
    iso: CAMERA_ISO,
    orientation: 1,
    pixelWidth: 640,
    pixelHeight: 480,
    xResolution: 300,
    yResolution: 300,
    gps: { latitude: [12, 34, 56], longitude: [45, 6, 7], latitudeRef: 'N', longitudeRef: 'E' },
  })
  return Buffer.from(
    insertJpegSegments(jpeg, [
      jfifSegment({ x: 300, y: 300, unit: 'inch' }),
      app1Segment(EXIF_IDENTIFIER, exif),
    ]),
  )
}

async function exportJpeg(page: Page, policy: RegExp) {
  await page.getByRole('radio', { name: policy }).check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('camera-watermarked.jpg')
  const bytes = await downloadBytes(download)
  const info = await rasterize(bytes).metadata()
  expect(info).toMatchObject({ format: 'jpeg', width: 320, height: 240, density: 300 })
  return bytes
}

test('stamps camera tokens and independently proves keep, GPS removal, and strip policies', async ({
  page,
  request,
}) => {
  test.slow()
  const original = await sourcePhoto()
  const originalFields = await exifFields(original)
  expect(originalFields).toMatchObject({ Make: CAMERA_MAKE, Model: CAMERA_MODEL, ISO: CAMERA_ISO })
  expect(originalFields.latitude).toBeCloseTo(12 + 34 / 60 + 56 / 3600, 5)
  expect(originalFields.longitude).toBeCloseTo(45 + 6 / 60 + 7 / 3600, 5)
  await signUpAndVerify(page, request, {
    name: 'Metadata Owner',
    email: `metadata-${crypto.randomUUID()}@example.test`,
    password: 'synthetic metadata passphrase',
  })
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  const text = page.getByRole('textbox', { name: 'Text', exact: true })
  await text.fill('')
  await page.getByRole('button', { name: 'Insert detail', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Camera/ }).click()
  await expect(text).toHaveValue('{camera}')
  // Token insertion restores focus/caret on the next animation frame. Wait
  // for that user-visible state before adding the separator and second token.
  await expect(text).toBeFocused()
  await text.press('End')
  await text.press('Space')
  await expect(text).toHaveValue('{camera} ')
  await page.getByRole('button', { name: 'Insert detail', exact: true }).click()
  await page.getByRole('menuitem', { name: /^ISO/ }).click()
  await expect(text).toHaveValue(TOKENS)
  await expectAccessible(page)
  await page.getByLabel('Preset name').fill('Camera metadata stamp')
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/watermarks'),
  )
  await page.getByRole('button', { name: 'Save preset', exact: true }).click()
  const savedResponse = await saved
  const stamp = watermarkDtoSchema.parse(await savedResponse.json())
  if (stamp.spec.kind !== 'text') throw new Error('The saved token preset is not text.')
  expect(stamp.spec.text).toBe(TOKENS)
  // A literal-text control must render identical pixels to the resolved tokens.
  const literalResponse = await page.request.post(`/api/orgs/${stamp.organizationId}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: { name: 'Literal camera control', spec: { ...stamp.spec, text: LITERAL } },
  })
  expect(literalResponse.status()).toBe(201)
  const literal = watermarkDtoSchema.parse(await literalResponse.json())
  await page
    .getByRole('link', { name: 'Open Camera metadata stamp in the editor', exact: true })
    .click()
  await page.reload()
  await page.getByRole('tab', { name: 'Presets', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(stamp.name)
  await page
    .getByLabel('Open a photo')
    .setInputFiles({ name: 'camera.jpg', mimeType: 'image/jpeg', buffer: original })
  await expect(page.getByText(/camera.jpg/)).toBeVisible()
  await page.getByRole('tab', { name: 'Resize', exact: true }).click()
  await page.getByRole('button', { name: '50%', exact: true }).click()
  await expect(page.getByLabel('Width (px)', { exact: true })).toHaveValue('320')
  await page.getByRole('tab', { name: 'Export', exact: true }).click()
  const privateExport = await exportJpeg(page, /^Keep except location/)
  const privateFields = await exifFields(privateExport)
  expect(privateFields).toMatchObject({
    Make: CAMERA_MAKE,
    Model: CAMERA_MODEL,
    ISO: CAMERA_ISO,
    Orientation: 1,
    ExifImageWidth: 320,
    ExifImageHeight: 240,
  })
  expect(privateFields.latitude).toBeUndefined()
  expect(privateFields.longitude).toBeUndefined()
  const kept = await exifFields(await exportJpeg(page, /^Keep everything/))
  expect(kept.latitude).toBe(originalFields.latitude)
  expect(kept.longitude).toBe(originalFields.longitude)
  expect(kept.Model).toBe(CAMERA_MODEL)
  const stripped = await exportJpeg(page, /^Strip/)
  const strippedFields = await exifFields(stripped)
  expect(strippedFields.Make).toBeUndefined()
  expect(strippedFields.Model).toBeUndefined()
  expect(strippedFields.ISO).toBeUndefined()
  expect(strippedFields.latitude).toBeUndefined()
  expect(strippedFields.longitude).toBeUndefined()
  await expectAccessible(page)

  await page.getByRole('tab', { name: 'Watermark', exact: true }).click()
  // Keep one layer present while switching the comparison: an empty document
  // re-applies the preset named in this route's URL.
  await page
    .getByRole('combobox', { name: 'Add another preset', exact: true })
    .selectOption(literal.id)
  await expect(
    page.getByRole('list', { name: 'Layers, bottom to top' }).getByRole('listitem'),
  ).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Remove Camera metadata stamp from this photo', exact: true })
    .click()
  await expect(
    page.getByRole('list', { name: 'Layers, bottom to top' }).getByRole('listitem'),
  ).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(
    literal.name,
  )
  await page.getByRole('tab', { name: 'Export', exact: true }).click()
  const control = await exportJpeg(page, /^Strip/)
  const pixels = await rasterize(stripped).removeAlpha().raw().toBuffer()
  expect(pixels.equals(await rasterize(control).removeAlpha().raw().toBuffer())).toBe(true)
  let painted = 0
  for (let index = 0; index < pixels.length; index += 1)
    if (Math.abs((pixels[index] ?? 0) - (COLOUR[index % 3] ?? 0)) > 12) painted += 1
  expect(painted).toBeGreaterThan(100)
  await page.getByRole('combobox', { name: 'Format', exact: true }).click()
  await page.getByRole('option', { name: 'WebP', exact: true }).click()
  await expect(page.getByRole('radio', { name: /^Keep except location/ })).toBeDisabled()
  await expect(page.getByRole('radio', { name: /^Keep everything/ })).toBeDisabled()
  await expect(page.getByRole('radio', { name: /^Strip/ })).toBeChecked()
  await expectAccessible(page)
})
