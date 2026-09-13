/** Real built-application workflows. Fixture accounts and writes are confined to the isolated loopback gate. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, devices, expect } from '@playwright/test'
import { unzipSync } from 'fflate'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'
import { PDFDocument, rgb } from 'pdf-lib'
import imageBuffer from 'sharp'

import { createAuditAccount, fixtureJson } from './audit-accounts.mjs'
import { GUIDANCE_TOPICS } from '../../src/shared/guidance.ts'

const ORIGIN = 'http://localhost:5273'
const OUTPUT = 'temp/media-browser-qa'
const VIDEO_PATH = 'e2e/fixtures/sample-video.mp4'
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 1000 } },
  phone: devices['Pixel 7'],
}
const PDF_SIZES = [
  [240, 320],
  [360, 240],
  [240, 320],
]
const reports = []
await mkdir(OUTPUT, { recursive: true })

async function sourcePdf() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Media QA Original')
  for (const [index, size] of PDF_SIZES.entries()) {
    const page = pdf.addPage(size)
    page.drawRectangle({ x: 12, y: 12, width: 30 + index, height: 20, color: rgb(0, 0, 1) })
    page.drawText(`Original Page ${String(index + 1)}`, { x: 24, y: 100, size: 12 })
  }
  return Buffer.from(await pdf.save())
}

async function inspect(page, name) {
  await page.screenshot({ path: `${OUTPUT}/${name}.png`, fullPage: true, animations: 'disabled' })
  await writeFile(`${OUTPUT}/${name}.txt`, await page.locator('main').ariaSnapshot())
  const axe = await new AxeBuilder({ page }).analyze()
  await writeFile(`${OUTPUT}/${name}-axe.json`, JSON.stringify(axe.violations, null, 2))
  assert.deepEqual(
    axe.violations.map(({ id }) => id),
    [],
    `${name}: accessibility`,
  )
  const overflow = await page.evaluate(
    () =>
      globalThis.document.documentElement.scrollWidth -
      globalThis.document.documentElement.clientWidth,
  )
  assert.ok(overflow <= 0, `${name}: horizontal overflow ${String(overflow)}`)
}

async function selection(page, profile) {
  const frame = page.getByRole('group', { name: /Watermark position/ }).first()
  await expect(frame).toBeVisible()
  if (profile === 'phone') await frame.tap()
  else await frame.click()
  await expect(frame).toHaveAttribute('data-selection-visible', 'true')
  const heading = page.getByRole('heading', { level: 1 })
  if (profile === 'phone') await heading.tap()
  else await heading.click()
  await expect(frame).toHaveAttribute('data-selection-visible', 'false')
  await frame.click()
  await frame.press('Escape')
  await expect(frame).toHaveAttribute('data-selection-visible', 'false')
}

async function download(page, button) {
  const pending = page.waitForEvent('download', { timeout: 60_000 })
  await button.click()
  const item = await pending
  const path = await item.path()
  assert.ok(path)
  return { name: item.suggestedFilename(), bytes: await readFile(path) }
}

async function frameInsidePhoto(frame) {
  const result = await frame.evaluate((element) => {
    const photo = element.closest('[data-mark-overlay]')?.parentElement?.querySelector('img')
    if (photo === null || photo === undefined) throw new Error('Photo boundary missing')
    const bounds = photo.getBoundingClientRect()
    return [element, ...element.querySelectorAll('button')].map((part) => {
      const box = part.getBoundingClientRect()
      return Math.max(
        bounds.left - box.left,
        box.right - bounds.right,
        bounds.top - box.top,
        box.bottom - bounds.bottom,
      )
    })
  })
  assert.ok(
    result.every((overflow) => overflow <= 0.1),
    `Selection/control crossed photo boundary: ${JSON.stringify(result)}`,
  )
}

async function dragToPhotoEdges(page, frame) {
  await frame.scrollIntoViewIfNeeded()
  const photo = await frame.evaluate((element) => {
    const image = element.closest('[data-mark-overlay]')?.parentElement?.querySelector('img')
    if (image === null || image === undefined) throw new Error('Photo boundary missing')
    const box = image.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
  const start = await frame.boundingBox()
  assert.ok(start)
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  for (const [x, y] of [
    [photo.x + photo.width + 60, photo.y + photo.height / 2],
    [photo.x + photo.width / 2, photo.y + photo.height + 60],
    [photo.x - 60, photo.y + photo.height / 2],
    [photo.x + photo.width / 2, photo.y - 60],
  ]) {
    await page.mouse.move(x, y, { steps: 6 })
    await frameInsidePhoto(frame)
  }
  await page.mouse.up()
  await frameInsidePhoto(frame)
}

async function videoInfo(bytes) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    assert.ok(video)
    return {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      duration: await input.computeDuration(),
      hasAudio: (await input.getPrimaryAudioTrack()) !== null,
    }
  } finally {
    input.dispose()
  }
}

async function templateAndFolder(page, actor, profile) {
  await page.goto('/app/library')
  await page.getByRole('button', { name: 'New Folder', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New Folder', exact: true })
  await dialog.getByRole('textbox', { name: 'Folder Name' }).fill('Client Deliveries')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/folderId=/)
  const folderId = new URL(page.url()).searchParams.get('folderId')
  assert.ok(folderId)
  await expect(
    page
      .getByRole('navigation', { name: 'Folder Path' })
      .getByRole('button', { name: 'Client Deliveries', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Use Draft', exact: true }).click()
  await writeFile(
    `${OUTPUT}/${profile}-template-open.json`,
    JSON.stringify(
      { url: page.url(), content: await page.locator('main').ariaSnapshot() },
      null,
      2,
    ),
  )
  await expect(page).toHaveURL((url) => url.searchParams.get('folderId') === folderId)
  await expect(page.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue('DRAFT')
  await expect(page.getByRole('textbox', { name: /Preset name/i })).toHaveValue('Draft')
  await page.getByRole('textbox', { name: /Preset name/i }).fill('Client Draft')
  await page.getByRole('button', { name: /^Save preset$/i }).click()
  await expect(page).toHaveURL(/\/app\/library(?:\?|$)/)
  await expect
    .poll(async () => {
      const result = await fixtureJson(
        await actor.context.get(`/api/orgs/${actor.organizationId}/watermarks`),
      )
      return result.watermarks.find((item) => item.name === 'Client Draft')?.folderId
    })
    .toBe(folderId)
  await expect(page).toHaveURL((url) => url.searchParams.get('folderId') === folderId)
  await expect(
    page
      .getByRole('region', { name: 'Watermark library' })
      .getByRole('link', { name: 'Client Draft', exact: true }),
  ).toBeVisible()
  await inspect(page, `${profile}-folder-template`)
}

async function image(page, profile) {
  await page.goto('/app/editor')
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Canvas QA')
  await selection(page, profile)
  await page.getByRole('tab', { name: 'Shape', exact: true }).click()
  await page.getByRole('radio', { name: 'Rectangle', exact: true }).click()
  const stroke = page.getByRole('slider', { name: 'Stroke width', exact: true })
  const maximum = await stroke.getAttribute('max')
  assert.ok(maximum)
  await stroke.fill(maximum)
  await page.getByRole('tab', { name: 'Style', exact: true }).click()
  await page.getByRole('slider', { name: 'Size', exact: true }).fill('0.55')
  await expect(page.getByRole('status', { name: 'Rendering preview' })).toHaveCount(0)
  const frame = page.getByRole('group', { name: /Watermark position/ }).first()
  await frame.click()
  const geometry = await frame.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const image = element.closest('[data-mark-overlay]')?.parentElement?.querySelector('img')
    const box = image?.getBoundingClientRect()
    if (box === undefined) throw new Error('Canvas image missing')
    return {
      contained:
        rect.left >= box.left - 1 &&
        rect.top >= box.top - 1 &&
        rect.right <= box.right + 1 &&
        rect.bottom <= box.bottom + 1,
      width: rect.width,
      imageWidth: box.width,
    }
  })
  assert.ok(geometry.contained, 'Thick stroke selection must stay inside the photo')
  assert.ok(
    geometry.width > geometry.imageWidth / 3,
    'Thick stroke fixture must cover a meaningful area',
  )
  await inspect(page, `${profile}-thick-stroke`)
  await dragToPhotoEdges(page, frame)
  await page.getByRole('slider', { name: 'Rotation', exact: true }).fill('45')
  await dragToPhotoEdges(page, frame)
  const handle = await page.getByRole('button', { name: 'Resize watermark' }).boundingBox()
  assert.ok(handle)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 300, handle.y + 300, { steps: 8 })
  await frameInsidePhoto(frame)
  await page.mouse.up()
  await page.getByRole('tab', { name: 'Crop', exact: true }).click()
  await page.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('tab', { name: 'Watermark', exact: true }).click()
  await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('35')
  await frame.click()
  await dragToPhotoEdges(page, frame)
  await inspect(page, `${profile}-cropped-boundary`)
  const toolbox = page.locator('[data-toolbox-scroll]')
  await toolbox.scrollIntoViewIfNeeded()
  const box = await toolbox.boundingBox()
  assert.ok(box)
  const parentScroll = () =>
    page.evaluate(() => {
      const main = globalThis.document.querySelector('main')
      const element =
        main !== null && main.scrollHeight > main.clientHeight
          ? main
          : globalThis.document.scrollingElement
      if (element === null) throw new Error('Scrollable page missing')
      return { scroll: element.scrollTop, range: element.scrollHeight - element.clientHeight }
    })
  const before = await parentScroll()
  const isUpward = before.scroll > 1
  await toolbox.evaluate((element, isUpward) => {
    element.scrollTop = isUpward ? 0 : element.scrollHeight
  }, isUpward)
  await page.mouse.move(
    box.x + box.width / 2,
    Math.min(box.y + box.height - 20, page.viewportSize().height - 100),
  )
  await page.mouse.wheel(0, isUpward ? -600 : 600)
  assert.ok(before.range > 0, 'Wheel handoff fixture needs a scrollable parent')
  if (isUpward)
    await expect
      .poll(async () => {
        const state = await parentScroll()
        return state.scroll
      })
      .toBeLessThan(before.scroll)
  else
    await expect
      .poll(async () => {
        const state = await parentScroll()
        return state.scroll
      })
      .toBeGreaterThan(before.scroll)
  return { wheelParentRange: before.range, wheelVerified: true }
}

async function documentWorkflow(page, source, profile) {
  await page.goto('/app/documents')
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('PDF QA')
  await page
    .getByLabel('Open PDF', { exact: true })
    .setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: source })
  await expect(page.getByRole('img', { name: 'PDF Page 1' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Next Page', exact: true }).click()
  await expect(page.getByRole('img', { name: 'PDF Page 2' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Page', exact: true })).toHaveValue('2')
  const previewRatio = await page
    .getByRole('img', { name: 'PDF Page 2' })
    .evaluate((image) => image.getBoundingClientRect().width / image.getBoundingClientRect().height)
  assert.ok(Math.abs(previewRatio - 1.5) < 0.02, 'Landscape PDF page must keep its aspect ratio')
  await selection(page, profile)
  await inspect(page, `${profile}-pdf-reader`)
  const result = await download(
    page,
    page.getByRole('button', { name: 'Download PDF', exact: true }),
  )
  assert.equal(result.name, 'report-watermarked.pdf')
  const pdf = await PDFDocument.load(result.bytes)
  assert.equal(pdf.getTitle(), 'Media QA Original')
  assert.deepEqual(
    pdf.getPages().map((page) => [page.getWidth(), page.getHeight()]),
    PDF_SIZES,
  )
  for (const page of pdf.getPages())
    assert.ok(
      page.node.normalizedEntries().XObject.keys().length > 0,
      'Every original page receives watermark pixels',
    )
}

async function videoWorkflow(page, bytes, profile) {
  await page.goto('/app/video')
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('VIDEO QA')
  await page.getByLabel('Add a video', { exact: true }).setInputFiles(VIDEO_PATH)
  const playhead = page.getByRole('slider', { name: 'Playhead', exact: true })
  await expect(playhead).toBeVisible()
  const nativeVideo = page.locator('video')
  await expect
    .poll(() => nativeVideo.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(2)
  assert.ok(
    await nativeVideo.evaluate((video) => video.videoWidth > 0 && video.error === null),
    'Native decoder must produce visible video frames',
  )
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => nativeVideo.evaluate((video) => video.currentTime)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(
    page.getByText('This browser could not play the selected video.', { exact: true }),
  ).toHaveCount(0)
  await playhead.fill('0')
  const duration = Number(await playhead.getAttribute('max'))
  assert.ok(duration > 0.5)
  await page.getByRole('button', { name: 'Add Keyframe Here', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Keyframes' }).getByRole('listitem')).toHaveCount(1)
  const middle = Math.round(duration * 50) / 100
  await playhead.fill(String(middle))
  await page.getByRole('button', { name: 'Add Keyframe Here', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Keyframes' }).getByRole('listitem')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Style', exact: true }).click()
  await page.getByRole('slider', { name: 'Rotation', exact: true }).fill('25')
  await page.getByRole('slider', { name: 'Fade In', exact: true }).fill('0.2')
  await page.getByRole('slider', { name: 'Fade Out', exact: true }).fill('0.2')
  await playhead.fill('0')
  await expect(page.getByRole('slider', { name: 'Rotation', exact: true })).toHaveValue('0')
  await playhead.fill(String(middle))
  await expect(page.getByRole('slider', { name: 'Rotation', exact: true })).toHaveValue('25')
  await selection(page, profile)
  await inspect(page, `${profile}-video-timeline`)
  const result = await download(
    page,
    page.getByRole('button', { name: 'Download Video', exact: true }),
  )
  const original = await videoInfo(bytes)
  const output = await videoInfo(result.bytes)
  assert.equal(output.width, original.width)
  assert.equal(output.height, original.height)
  assert.equal(output.hasAudio, original.hasAudio)
  assert.ok(Math.abs(output.duration - original.duration) < 0.1)
}

async function bulk(page, source, photo, video, profile) {
  await page.goto('/app/bulk')
  await page.getByLabel(/^Add files$/i).setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: photo },
    { name: 'report.pdf', mimeType: 'application/pdf', buffer: source },
    { name: 'clip.mp4', mimeType: 'video/mp4', buffer: video },
  ])
  await page.getByRole('checkbox', { name: 'Client Draft', exact: true }).check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText(/3 of 3 finished/)).toBeVisible({ timeout: 60_000 })
  const results = page.getByRole('list', { name: 'Files In This Batch', exact: true })
  await expect(results.getByRole('listitem')).toHaveCount(3)
  await expect(results.getByRole('alert')).toHaveCount(0)
  await inspect(page, `${profile}-mixed-bulk`)
  const output = await download(
    page,
    page.getByRole('button', { name: 'Download 3 as ZIP', exact: true }),
  )
  const entries = unzipSync(output.bytes)
  const files = Object.entries(entries).filter(([name]) => !name.endsWith('/'))
  assert.equal(files.length, 3)
  assert.ok(files.some(([name]) => name.endsWith('.png')))
  const document = files.find(([name]) => name.endsWith('.pdf'))
  assert.ok(document)
  const parsedDocument = await PDFDocument.load(document[1])
  assert.equal(parsedDocument.getPageCount(), PDF_SIZES.length)
  const movie = files.find(([name]) => /\.(mp4|webm)$/.test(name))
  assert.ok(movie)
  const parsedVideo = await videoInfo(movie[1])
  assert.ok(parsedVideo.duration > 0)
}

const source = await sourcePdf()
const photo = await imageBuffer({
  create: { width: 640, height: 400, channels: 3, background: '#567e95' },
})
  .png()
  .toBuffer()
const video = await readFile(VIDEO_PATH)
const profiles = process.argv.slice(2).length === 0 ? Object.keys(PROFILES) : process.argv.slice(2)
for (const profile of profiles) {
  assert.ok(PROFILES[profile], 'Unknown browser profile')
  const actor = await createAuditAccount(ORIGIN, 'Media Workflow QA')
  for (const topic of GUIDANCE_TOPICS)
    await fixtureJson(await actor.context.post('/api/me/guidance/claim', { data: { topic } }))
  const browser = await chromium.launch()
  let page
  try {
    const context = await browser.newContext({
      baseURL: ORIGIN,
      colorScheme: 'dark',
      ...PROFILES[profile],
      storageState: await actor.context.storageState(),
    })
    page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    const tasks = [
      ['template-folder', () => templateAndFolder(page, actor, profile)],
      ['image', () => image(page, profile)],
      ['pdf', () => documentWorkflow(page, source, profile)],
      ['video', () => videoWorkflow(page, video, profile)],
      ['bulk', () => bulk(page, source, photo, video, profile)],
    ]
    for (const [name, run] of tasks) {
      try {
        const detail = await run()
        reports.push({ profile, name, result: 'passed', detail })
      } catch (error) {
        await page.screenshot({ path: `${OUTPUT}/${profile}-${name}-failure.png`, fullPage: true })
        await writeFile(
          `${OUTPUT}/${profile}-${name}-failure.txt`,
          await page.locator('main').ariaSnapshot(),
        )
        reports.push({ profile, name, result: 'failed', reason: error.message })
      }
    }
    reports.push({
      profile,
      name: 'page-errors',
      result: errors.length === 0 ? 'passed' : 'failed',
      errors,
    })
    await context.close()
  } catch (error) {
    if (page !== undefined) {
      await page.screenshot({ path: `${OUTPUT}/${profile}-failure.png`, fullPage: true })
      await writeFile(`${OUTPUT}/${profile}-failure.txt`, await page.locator('main').ariaSnapshot())
    }
    throw error
  } finally {
    await writeFile(`${OUTPUT}/workflows.json`, JSON.stringify(reports, null, 2))
    await browser.close()
    await actor.context.dispose()
  }
}
assert.ok(
  reports.every((report) => report.result === 'passed'),
  'One or more media workflows failed; inspect temp/media-browser-qa/workflows.json',
)
