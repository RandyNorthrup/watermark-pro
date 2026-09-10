/**
 * Bulk journey against the production build in workerd: twenty generated
 * PNG fixtures go through the worker pool with a library preset, the ZIP is
 * downloaded and unpacked in Node, and every entry is a real image of the
 * requested size.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { unzipSync } from 'fflate'

import { PREVIEW_ORIGIN } from './preview'
import {
  createWorkspace,
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
import { type SaveWatermarkRequest, watermarkDtoSchema } from '../src/shared/api-watermark'
import { DEFAULT_TEXT_SPEC } from '../src/shared/watermark'

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

test('preserves folder paths, names outputs by size, and reports a one-photo override honestly', async ({
  page,
  request,
}, testInfo) => {
  test.slow()
  const person = {
    name: 'Folder Owner',
    email: `folder-${crypto.randomUUID()}@example.test`,
    password: 'synthetic folder passphrase',
  }
  await signUpAndVerify(page, request, person)
  const { organization } = await expectActiveWorkspace(page, person, 'My workspace')
  const response = await page.request.post(`/api/orgs/${organization.id}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: { name: 'Folder stamp', spec: DEFAULT_TEXT_SPEC },
  })
  expect(response.status()).toBe(201)
  await navigateTo(page, 'Bulk')
  const wide = pngFixture(640, 400, [40, 90, 120])
  const tall = pngFixture(400, 640, [120, 80, 40])
  const canPickFolders = await page.evaluate<boolean>(
    "'webkitdirectory' in HTMLInputElement.prototype",
  )
  // WebKit exposes the hidden file input as a button too; assert the visible
  // action independently from the labelled input used to provide the folder.
  const folderButton = page
    .getByRole('button', { name: 'Add a folder', exact: true })
    .and(page.locator('button'))
  let prefix = ''
  if (canPickFolders) {
    const directory = testInfo.outputPath('source-folder')
    await mkdir(path.join(directory, 'a'), { recursive: true })
    await mkdir(path.join(directory, 'b'), { recursive: true })
    await writeFile(path.join(directory, 'a', 'wide.png'), wide)
    await writeFile(path.join(directory, 'b', 'tall.png'), tall)
    await writeFile(
      path.join(directory, 'notes.txt'),
      'A non-image must not become a job or ZIP entry.',
    )
    await expect(folderButton).toBeVisible()
    const folderInput = page.getByLabel('Add a folder', { exact: true })
    await expect(folderInput).toHaveAttribute('webkitdirectory', '')
    await folderInput.setInputFiles(directory)
    await expect(page.getByText(/1 file skipped/)).toBeVisible()
    prefix = 'source-folder/'
  } else {
    await expect(folderButton).toHaveCount(0)
    await page.getByLabel('Add photos', { exact: true }).setInputFiles([
      { name: 'wide.png', mimeType: 'image/png', buffer: wide },
      { name: 'tall.png', mimeType: 'image/png', buffer: tall },
    ])
  }
  const widePath = canPickFolders ? `${prefix}a/wide.png` : 'wide.png'
  const tallPath = canPickFolders ? `${prefix}b/tall.png` : 'tall.png'
  const list = page.getByRole('list', { name: 'Photos in this batch', exact: true })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText(widePath)
  await expect(list).toContainText(tallPath)
  await expect(list).not.toContainText('notes.txt')
  await page.getByRole('checkbox', { name: 'Folder stamp', exact: true }).check()
  await page.getByRole('combobox', { name: 'Format', exact: true }).click()
  await page.getByRole('option', { name: 'PNG', exact: true }).click()
  await page.getByLabel('File names', { exact: true }).fill(' '.repeat(3))
  await expect(page.getByText('The pattern must produce a name.', { exact: true })).toBeVisible()
  await page.getByLabel('File names', { exact: true }).fill('{name}-{width}x{height}')
  await expect(page.getByText('The pattern must produce a name.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText(/2 of 2 finished/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Download wide-640x400.png', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Download tall-400x640.png', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: `Adjust ${widePath}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Adjust ${widePath}`, exact: true })
  await expect(dialog.getByText('wide.png · 640 × 400 px', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Crop', exact: true }).click()
  await dialog.getByRole('button', { name: '1:1', exact: true }).click()
  await expect(dialog.getByLabel('Width (px)', { exact: true })).toHaveValue('400')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Apply to this photo', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Download wide-400x400.png', exact: true }),
  ).toBeVisible()
  await expect(list.getByText('Custom', { exact: true })).toHaveCount(1)
  const pendingZip = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download 2 as ZIP', exact: true }).click()
  const entries = unzipSync(await downloadBytes(await pendingZip))
  const expectedWide = canPickFolders ? `${prefix}a/wide-400x400.png` : 'wide-400x400.png'
  const expectedTall = canPickFolders ? `${prefix}b/tall-400x640.png` : 'tall-400x640.png'
  expect(Object.keys(entries).toSorted((left, right) => left.localeCompare(right))).toEqual(
    [expectedWide, expectedTall].toSorted((left, right) => left.localeCompare(right)),
  )
  const wideOutput = entries[expectedWide]
  const tallOutput = entries[expectedTall]
  if (wideOutput === undefined || tallOutput === undefined)
    throw new Error('A named folder output is missing.')
  expect(pngSize(wideOutput)).toEqual({ width: 400, height: 400 })
  expect(pngSize(tallOutput)).toEqual({ width: 400, height: 640 })
  const pendingReport = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download report/ }).click()
  const report = await pendingReport
  expect(report.suggestedFilename()).toBe('report.csv')
  const reportBytes = await downloadBytes(report)
  const [header, ...rows] = reportBytes
    .toString('utf8')
    .split('\n')
    .map((line) => line.split(','))
  expect(header).toEqual([
    'source',
    'relative_path',
    'output',
    'status',
    'width',
    'height',
    'duration_ms',
    'error',
    'presets',
    'override',
  ])
  const bySource = new Map(rows.map((row) => [row[0], row]))
  expect(rows).toHaveLength(2)
  expect(bySource.get('wide.png')?.slice(1, 6)).toEqual([
    widePath,
    'wide-400x400.png',
    'done',
    '400',
    '400',
  ])
  expect(bySource.get('wide.png')?.at(-1)).toBe('yes')
  expect(bySource.get('tall.png')?.slice(1, 6)).toEqual([
    tallPath,
    'tall-400x640.png',
    'done',
    '400',
    '640',
  ])
  expect(bySource.get('tall.png')?.at(-1)).toBe('no')
  await page.getByRole('button', { name: `Adjust ${widePath}`, exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove override', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download wide-640x400.png', exact: true }),
  ).toBeVisible()
  await expect(list.getByText('Custom', { exact: true })).toHaveCount(0)
  await expectAccessible(page)
})

test('watermarks twenty photos and downloads them as a ZIP', async ({ page, request }) => {
  await createWorkspace(page, request, owner, organizationName)
  const { organization } = await expectActiveWorkspace(page, owner, organizationName)
  // Library creation has its own UI journey. Real API fixtures retain the same
  // coloured, boxed two-line text and symbol without spending the bulk budget on it.
  const presets: SaveWatermarkRequest[] = [
    {
      name: 'Batch preset',
      spec: {
        ...DEFAULT_TEXT_SPEC,
        text: '© Batch\n{date} {filename}',
        contrast: { mode: 'colour', colour: '#6d4de6', outline: 0.5 },
        style: {
          ...DEFAULT_TEXT_SPEC.style,
          backdrop: { ...DEFAULT_TEXT_SPEC.style.backdrop, enabled: true },
        },
      },
    },
    {
      name: 'Batch symbol',
      spec: {
        kind: 'symbol',
        symbol: { type: 'glyph', glyph: '©', fontFamily: DEFAULT_TEXT_SPEC.fontFamily },
        placement: DEFAULT_TEXT_SPEC.placement,
        contrast: DEFAULT_TEXT_SPEC.contrast,
        style: { ...DEFAULT_TEXT_SPEC.style, scale: 0.12 },
      },
    },
  ]
  for (const preset of presets) {
    const response = await page.request.post(`/api/orgs/${organization.id}/watermarks`, {
      headers: { origin: PREVIEW_ORIGIN },
      data: preset,
    })
    expect(response.status()).toBe(201)
    expect(watermarkDtoSchema.parse(await response.json())).toMatchObject(preset)
  }
  await navigateTo(page, 'Library')
  for (const preset of presets)
    await expect(page.getByRole('link', { name: preset.name, exact: true })).toBeVisible()
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
