/**
 * Video journey against the production build: a committed ~2 s H.264 MP4 goes
 * through the browser transcoder with a library preset, the result is
 * downloaded, and its first box is the MP4 `ftyp` — proof the whole WebCodecs +
 * mediabunny pipeline ran end to end. Only the WebCodecs-capable projects
 * (desktop Chrome and Android Chrome) run it; the fixture and its output are
 * H.264, which those browsers encode.
 */
import { fileURLToPath } from 'node:url'

import {
  createWorkspace,
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  test,
} from './support'

const FIXTURE_PATH = fileURLToPath(new URL('fixtures/sample-video.mp4', import.meta.url))
const OUTPUT_NAME = 'sample-video-watermarked.mp4'
const VIDEO_PROJECTS = new Set(['desktop-chrome', 'android'])
const TRANSCODE_TIMEOUT_MS = 60_000

const runId = Date.now().toString(36)
const owner = {
  name: 'Vic Video',
  email: `vic-${runId}@example.test`,
  password: 'correct horse battery',
}
const organizationName = `Reel ${runId}`

test('watermarks a video and downloads an MP4', async ({ page, request }, testInfo) => {
  test.skip(
    !VIDEO_PROJECTS.has(testInfo.project.name),
    'video transcoding needs a WebCodecs encoder (desktop Chrome or Android only)',
  )
  await createWorkspace(page, request, owner, organizationName)

  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Reel')
  await page.getByLabel('Preset name').fill('Video preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Video preset', exact: true })).toBeVisible()

  await navigateTo(page, 'Video')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video watermarking')
  // The chosen output is shown before starting, once detection resolves.
  await expect(page.getByText(/^Saves as MP4 \(/)).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel('Add a video').setInputFiles(FIXTURE_PATH)
  await page.getByRole('checkbox', { name: 'Video preset' }).check()
  await page.getByRole('button', { name: 'Watermark video' }).click()

  const downloadButton = page.getByRole('button', { name: `Download ${OUTPUT_NAME}` })
  await expect(downloadButton).toBeVisible({ timeout: TRANSCODE_TIMEOUT_MS })

  const downloadPromise = page.waitForEvent('download')
  await downloadButton.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(OUTPUT_NAME)

  const bytes = await downloadBytes(download)
  expect(bytes.byteLength).toBeGreaterThan(0)
  // The MP4 `ftyp` box sits at bytes 4–8 of a fresh file.
  expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp')
})
