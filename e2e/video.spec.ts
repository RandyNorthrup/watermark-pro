/** Video journeys use actual native capability results; every configured device proves a usable or refused path. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { APIRequestContext, Page, TestInfo } from '@playwright/test'
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
const AUDIO_PATH = fileURLToPath(new URL('fixtures/sample-audio.wav', import.meta.url))
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
  await navigateTo(page, 'Saved Watermarks')
  await page.getByRole('link', { name: 'New watermark' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('© Reel')
  await page.getByLabel('Watermark name').fill('Video preset')
  await page.getByRole('button', { name: 'Save watermark' }).click()
  const library = page.getByRole('region', { name: 'Saved Watermarks', exact: true })
  await expect(library.getByRole('link', { name: 'Video preset', exact: true })).toBeVisible()
  await navigateTo(page, 'Videos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Videos')
}

async function expectUnsupported(page: Page) {
  await expect(page.getByText(UNSUPPORTED, { exact: true })).toBeVisible()
  await expect(
    page.getByText('Your browser cannot encode video. Chrome, Edge or Safari 17 and later can.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Add a video', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export Video', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Download / })).toHaveCount(0)
  await expectAccessible(page)
  await navigateTo(page, 'Saved Watermarks')
  await expect(
    page
      .getByRole('region', { name: 'Saved Watermarks', exact: true })
      .getByRole('link', { name: 'Video preset', exact: true }),
  ).toBeVisible()
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

async function supportedEncoding(page: Page, testInfo: TestInfo) {
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
    return null
  }
  await expect(supported).toBeVisible()
  await expect(page.getByText(UNSUPPORTED, { exact: true })).toHaveCount(0)
  await expectAccessible(page)
  const label = await supported.innerText()
  return label
}

test.describe('native video editing', () => {
  test.beforeEach(async ({ page, request }) => {
    test.slow()
    await page.addInitScript(OBSERVE_ENCODER)
    await openVideo(page, request)
  })
  test('matches real encoding capability and produces a complete video when supported', async ({
    page,
  }, testInfo) => {
    const label = await supportedEncoding(page, testInfo)
    if (label === null) return
    const container = label.includes('MP4') ? 'mp4' : 'webm'
    const outputName = `sample-video-watermarked.${container}`
    const watermark = page.getByRole('button', { name: 'Export Video', exact: true })
    await expect(watermark).toBeDisabled()
    await page.getByLabel('Add a video').setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a video'),
    })
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(watermark).toBeDisabled()
    await page.getByLabel('Add a video').setInputFiles(FIXTURE_PATH)
    const native = page.locator('video')
    await expect(native).toBeVisible()
    await expect
      .poll(() =>
        native.evaluate((element: unknown) => {
          if (typeof element !== 'object' || element === null)
            throw new Error('Expected native video')
          const value: unknown = Reflect.get(element, 'readyState')
          if (typeof value !== 'number') throw new Error('Expected native video state')
          return value
        }),
      )
      .toBeGreaterThanOrEqual(2)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect
      .poll(() =>
        native.evaluate((element: unknown) => {
          if (typeof element !== 'object' || element === null)
            throw new Error('Expected native video')
          const value: unknown = Reflect.get(element, 'currentTime')
          if (typeof value !== 'number') throw new Error('Expected native video state')
          return value
        }),
      )
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('tab', { name: 'Watermark', exact: true }).click()
    await page.getByRole('tab', { name: 'Saved', exact: true }).click()
    await page
      .getByRole('combobox', { name: 'Saved Watermark', exact: true })
      .selectOption({ label: 'Video preset' })
    const playhead = page.getByRole('slider', { name: 'Playhead', exact: true })
    await playhead.fill('0')
    await page.getByRole('button', { name: 'Add Keyframe Here', exact: true }).click()
    await playhead.fill('1')
    await page.getByRole('button', { name: 'Add Keyframe Here', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Keyframes' }).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    await page.getByRole('slider', { name: 'Rotation', exact: true }).fill('25')
    await page.getByRole('slider', { name: 'Fade In', exact: true }).fill('0.2')
    await page.getByRole('slider', { name: 'Fade Out', exact: true }).fill('0.2')
    await playhead.fill('0')
    await expect(page.getByRole('slider', { name: 'Rotation', exact: true })).toHaveValue('0')
    await playhead.fill('1')
    await expect(page.getByRole('slider', { name: 'Rotation', exact: true })).toHaveValue('25')
    await expectAccessible(page)
    const downloadPending = page.waitForEvent('download', { timeout: TRANSCODE_TIMEOUT_MS })
    await watermark.click()
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

  test('cuts multiple videos, trims linked intervals, mixes an audio track and exports the actual edit', async ({
    page,
  }, testInfo) => {
    const label = await supportedEncoding(page, testInfo)
    if (label === null) return
    const container = label.includes('MP4') ? 'mp4' : 'webm'
    const bytes = await readFile(FIXTURE_PATH)
    await page.getByLabel('Add a video').setInputFiles([
      { name: 'first.mp4', mimeType: 'video/mp4', buffer: bytes },
      { name: 'second.mp4', mimeType: 'video/mp4', buffer: bytes },
    ])
    const timeline = page.getByRole('region', { name: 'Timeline', exact: true })
    await expect(timeline.getByRole('button', { name: /^V1:/ })).toHaveCount(2)
    const tickLocators = await timeline.locator('.studio-tick:visible').all()
    const tickBounds = await Promise.all(tickLocators.map((tick) => tick.boundingBox()))
    const ticks = tickBounds
      .map((bounds) => {
        if (bounds === null) throw new Error('A visible timeline label has no rendered bounds.')
        return bounds
      })
      .toSorted((left, right) => left.x - right.x)
    expect(ticks.length).toBeGreaterThan(1)
    for (const [index, tick] of ticks.slice(1).entries()) {
      const previous = ticks.at(index)
      if (previous === undefined) throw new Error('The preceding timeline label is missing.')
      expect(previous.x + previous.width).toBeLessThanOrEqual(tick.x)
    }
    await page.getByRole('button', { name: 'Add first.mp4 to V2', exact: true }).click()
    await expect(timeline.getByRole('button', { name: /^V2:/ })).toHaveCount(1)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(timeline.getByRole('button', { name: /^V2:/ })).toHaveCount(0)
    await timeline.getByRole('button', { name: /^V1: first/ }).click()
    await page.getByRole('slider', { name: 'Playhead', exact: true }).fill('0.5')
    await page.getByRole('button', { name: 'Split at playhead', exact: true }).click()
    await expect(timeline.getByRole('button', { name: /^V1:/ })).toHaveCount(3)
    await page.getByRole('spinbutton', { name: 'Source out (s)' }).fill('0.25')
    await expect(
      timeline.getByRole('button', { name: 'V1: first.mp4, 0.000 s – 0.250 s', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: 'Source out (s)' })).toHaveValue('0.5')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await page.getByRole('combobox', { name: 'Track', exact: true }).click()
    await page.getByRole('option', { name: 'V2', exact: true }).click()
    await expect(timeline.getByRole('button', { name: /^V2:/ })).toHaveCount(1)
    await page.getByLabel('Add a video').setInputFiles(AUDIO_PATH)
    await expect(timeline.getByRole('button', { name: /^A3:/ })).toHaveCount(1)
    await page.getByRole('spinbutton', { name: 'Volume', exact: true }).fill('0.5')
    await page.getByRole('textbox', { name: 'Project', exact: true }).fill('Track edit')
    await page.getByRole('button', { name: 'Clear canvas', exact: true }).click()
    await expect(timeline.getByRole('button', { name: /^V1:/ })).toHaveCount(2)
    await expectAccessible(page)
    const canEncodeAudio = await page.evaluate(
      async (codec) => {
        const encoder = Reflect.get(globalThis, 'AudioEncoder') as typeof AudioEncoder | undefined
        if (encoder === undefined) return false
        try {
          const result = await encoder.isConfigSupported({
            codec,
            sampleRate: 48_000,
            numberOfChannels: 2,
            bitrate: 128_000,
          })
          return result.supported === true
        } catch {
          return false
        }
      },
      container === 'mp4' ? 'mp4a.40.2' : 'opus',
    )
    await testInfo.attach('native-edited-audio-capability', {
      body: JSON.stringify({ container, canEncodeAudio }),
      contentType: 'application/json',
    })
    if (!canEncodeAudio) {
      await page.getByRole('button', { name: 'Export Video', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('cannot encode edited audio')
      await page.getByRole('button', { name: 'Mute A3', exact: true }).click()
    }
    const pending = page.waitForEvent('download', { timeout: TRANSCODE_TIMEOUT_MS })
    await page.getByRole('button', { name: 'Export Video', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe(`Track edit-watermarked.${container}`)
    const output = await clipInfo(await downloadBytes(download))
    const original = await clipInfo(bytes)
    expect(output.seconds).toBeCloseTo(original.seconds * 2, 1)
    expect(output.packets).toBeGreaterThan(original.packets)
    expect(output.hasAudio).toBe(canEncodeAudio)
    await expectAccessible(page)
    await testInfo.attach('multi-clip-workspace', {
      body: await page.screenshot({
        path: testInfo.outputPath('multi-clip-workspace.png'),
        fullPage: true,
      }),
      contentType: 'image/png',
    })
  })
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
