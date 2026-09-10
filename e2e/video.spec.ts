/** Video journeys use actual native capability results; every configured device proves a usable or refused path. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { APIRequestContext, Page } from '@playwright/test'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'

import {
  downloadBytes,
  expect,
  expectAccessible,
  navigateTo,
  signUpAndVerify,
  test,
} from './support'

const FIXTURE_PATH = fileURLToPath(new URL('fixtures/sample-video.mp4', import.meta.url))
const TRANSCODE_TIMEOUT_MS = 60_000
const UNSUPPORTED = 'Video is not supported in this browser'
const CODECS = { 'H.264': 'avc', HEVC: 'hevc', VP9: 'vp9', AV1: 'av1' } as const

/** Observe real native probes without substituting their results or changing the codec detector. */
const OBSERVE_ENCODER = `(() => {
  const state = { hasEncoder: typeof VideoEncoder !== 'undefined', calls: [] };
  Object.defineProperty(globalThis, '__lumafoilCodecProbe', { value: state });
  if (!state.hasEncoder) return;
  const nativeProbe = VideoEncoder.isConfigSupported.bind(VideoEncoder);
  VideoEncoder.isConfigSupported = async (config) => {
    try {
      const result = await nativeProbe(config);
      state.calls.push({ codec: config.codec, supported: result.supported === true });
      return result;
    } catch (error) {
      state.calls.push({ codec: config.codec, supported: false });
      throw error;
    }
  };
})()`

interface CodecObservation {
  hasEncoder: boolean
  calls: { codec: string; supported: boolean }[]
}

async function openVideo(page: Page, request: APIRequestContext) {
  await signUpAndVerify(page, request, {
    name: 'Video Owner',
    email: `video-${crypto.randomUUID()}@example.test`,
    password: 'synthetic video passphrase',
  })
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Reel')
  await page.getByLabel('Preset name').fill('Video preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Video preset', exact: true })).toBeVisible()
  await navigateTo(page, 'Video')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Video watermarking')
}

async function expectUnsupported(page: Page) {
  await expect(page.getByText(UNSUPPORTED, { exact: true })).toBeVisible()
  await expect(
    page.getByText('Your browser cannot encode video. Chrome, Edge or Safari 17 and later can.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Add a video', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Watermark video', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Download / })).toHaveCount(0)
  await expectAccessible(page)
  await navigateTo(page, 'Library')
  await expect(page.getByRole('link', { name: 'Video preset', exact: true })).toBeVisible()
}

async function clipInfo(bytes: Buffer) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (track === null) throw new Error('The video output has no video track.')
    const stats = await track.computePacketStats()
    return {
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
      codec: await track.getCodec(),
      seconds: await input.computeDuration(),
      packets: stats.packetCount,
      hasAudio: (await input.getPrimaryAudioTrack()) !== null,
    }
  } finally {
    input.dispose()
  }
}

test('matches real encoding capability and produces a complete video when supported', async ({
  page,
  request,
}, testInfo) => {
  test.slow()
  await page.addInitScript(OBSERVE_ENCODER)
  await openVideo(page, request)
  const supported = page.getByText(/^Saves as (MP4|WebM) \(/)
  await expect(supported.or(page.getByText(UNSUPPORTED, { exact: true }))).toBeVisible()
  const observed = await page.evaluate<CodecObservation>('globalThis.__lumafoilCodecProbe')
  if (observed.hasEncoder) expect(observed.calls.length).toBeGreaterThan(0)
  await testInfo.attach('native-codec-capability', {
    body: JSON.stringify(observed),
    contentType: 'application/json',
  })
  const canEncode = observed.calls.some((call) => call.supported)
  if (!canEncode) {
    await expectUnsupported(page)
    return
  }
  await expect(supported).toBeVisible()
  await expect(page.getByText(UNSUPPORTED, { exact: true })).toHaveCount(0)
  await expectAccessible(page)
  const label = await supported.innerText()
  const container = label.includes('MP4') ? 'mp4' : 'webm'
  const outputName = `sample-video-watermarked.${container}`
  const watermark = page.getByRole('button', { name: 'Watermark video', exact: true })
  await expect(watermark).toBeDisabled()
  await page.getByLabel('Add a video').setInputFiles({
    name: 'broken.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not a video'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(watermark).toBeDisabled()
  await page.getByLabel('Add a video').setInputFiles(FIXTURE_PATH)
  await expect(page.getByRole('heading', { level: 2, name: 'sample-video.mp4' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(watermark).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Video preset' }).check()
  await expect(watermark).toBeEnabled()
  await watermark.click()
  const downloadButton = page.getByRole('button', { name: `Download ${outputName}`, exact: true })
  await expect(downloadButton).toBeVisible({ timeout: TRANSCODE_TIMEOUT_MS })
  await expectAccessible(page)
  const downloadPending = page.waitForEvent('download')
  await downloadButton.click()
  const download = await downloadPending
  expect(download.suggestedFilename()).toBe(outputName)
  const bytes = await downloadBytes(download)
  const original = await clipInfo(await readFile(FIXTURE_PATH))
  const output = await clipInfo(bytes)
  expect(output.width).toBe(original.width)
  expect(output.height).toBe(original.height)
  expect(output.packets).toBe(original.packets)
  expect(output.packets).toBeGreaterThan(1)
  expect(output.seconds).toBeCloseTo(original.seconds, 1)
  expect(output.hasAudio).toBe(original.hasAudio)
  const expectedCodec = Object.entries(CODECS).find(([name]) => label.endsWith(`(${name})`))?.[1]
  expect(expectedCodec).toBeDefined()
  expect(output.codec).toBe(expectedCodec)
  if (container === 'mp4') expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp')
  else expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
})

test('refuses unavailable WebCodecs clearly while keeping other tools usable', async ({
  page,
  request,
}) => {
  // A deterministic negative control supplements native per-device detection;
  // only this test context loses the API, never the real supported-path test.
  await page.addInitScript(
    "Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: undefined })",
  )
  await openVideo(page, request)
  expect(await page.evaluate("typeof VideoEncoder === 'undefined'")).toBe(true)
  await expectUnsupported(page)
})
