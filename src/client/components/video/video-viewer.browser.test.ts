import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import { createElement, createRef, useImperativeHandle, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { VideoViewer } from './video-viewer'
import { DEFAULT_SHAPE_SPEC, type WatermarkSpec } from '../../../shared/watermark'
import type { MarkOutcome } from '../../engine/pipeline'
import { MarkResources } from '../../lib/mark-resources'
import en from '../../locales/en/common.json'
import { mockElementBounds } from '../../test-support/mock-element-bounds'
import { createVideoMotion } from '../../video/motion'
import { probeVideo, type VideoProbe } from '../../video/probe'
import { encodeTestClip } from '../../video/test-support/clip'
import { useMediaScene, type MediaScene } from '../editor/use-media-scene'

const i18n = createInstance()
const placements = vi.fn<(values: MarkOutcome[]) => void>()
const gestures = vi.fn()
const RED_MARK: WatermarkSpec = {
  ...DEFAULT_SHAPE_SPEC,
  placement: { mode: 'custom', x: 0.5, y: 0.5 },
  fill: { enabled: true, colour: '#ff0000', opacity: 1 },
  stroke: { width: 0, colour: null },
  style: { ...DEFAULT_SHAPE_SPEC.style, scale: 0.2, opacity: 1 },
}
let file: File
let probe: VideoProbe
let url: string
interface Driver {
  current: { scene: MediaScene; seek: (time: number) => void } | null
}

function Player({ driverRef, dimensions }: { driverRef: Driver; dimensions: VideoProbe }) {
  const scene = useMediaScene(true)
  const [time, setTime] = useState(0)
  useImperativeHandle(driverRef, () => ({ scene, seek: setTime }), [scene])
  return createElement(VideoViewer, {
    organizationId: 'viewer-fixture',
    url,
    file,
    probe: dimensions,
    outputSize: { width: dimensions.width, height: dimensions.height },
    map: { width: 1, height: 1, values: new Float32Array([0.5]) },
    scene,
    time,
    onTime: setTime,
    onPlacements: placements,
    onGesture: (id, event) => {
      gestures(id, event)
      scene.gesture(id, event)
    },
  })
}
function controls(driverRef: Driver) {
  if (driverRef.current === null) throw new Error('Viewer driverRef is not mounted')
  return driverRef.current
}
async function mount(dimensions = probe) {
  // The native decoder and canvas remain real; a fixed viewport isolates the
  // player behavior from the utility-CSS build tested separately in Playwright.
  mockElementBounds()
  const driverRef = createRef<NonNullable<Driver['current']>>()
  const view = render(
    createElement(I18nextProvider, { i18n }, createElement(Player, { driverRef, dimensions })),
  )
  act(() => controls(driverRef).scene.useTemplate(RED_MARK))
  const video = view.container.querySelector('video')
  const canvas = view.container.querySelector('canvas')
  if (video === null || canvas === null) throw new Error('Native player elements missing')
  await waitFor(() => expect(video.readyState).toBeGreaterThanOrEqual(2))
  await waitFor(() => expect(placements).toHaveBeenCalled())
  return { ...view, driverRef, video, canvas, user: userEvent }
}
function opacity(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Real 2D canvas unavailable')
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let alpha = 0
  for (let offset = 3; offset < pixels.length; offset += 4)
    alpha = Math.max(alpha, pixels[offset] ?? 0)
  return alpha
}
beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    defaultNS: 'common',
    resources: { en: { common: en } },
    interpolation: { escapeValue: false },
  })
  const clip = await encodeTestClip()
  file = new File([clip.blob], 'viewer.mp4', {
    type: clip.codec === 'avc' ? 'video/mp4' : 'video/webm',
  })
  probe = await probeVideo(file)
  url = URL.createObjectURL(file)
})
afterEach(() => {
  cleanup()
  placements.mockClear()
  gestures.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => URL.revokeObjectURL(url))

it('decodes and plays real frames, paints the watermark, pauses and seeks without a preview PNG round trip', async () => {
  const { video, canvas, user, driverRef } = await mount()
  expect(video.videoWidth).toBe(probe.width)
  await waitFor(() => expect(opacity(canvas)).toBe(255))
  const drag = new Event('dragstart', { bubbles: true, cancelable: true })
  video.dispatchEvent(drag)
  expect(drag.defaultPrevented).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Play' }))
  await waitFor(() => expect(video.currentTime).toBeGreaterThan(0))
  expect(screen.queryByRole('group', { name: /Watermark position/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Pause' }))
  await screen.findByRole('group', { name: /Watermark position/ })
  fireEvent.change(screen.getByRole('slider', { name: 'Playhead' }), { target: { value: '0.5' } })
  await waitFor(() => expect(video.currentTime).toBeCloseTo(0.5))
  expect(video.paused).toBe(true)
  const frame = screen.getByRole('group', { name: /Watermark position/ })
  fireEvent.focus(frame)
  fireEvent.keyDown(frame, { key: 'ArrowRight' })
  expect(gestures).toHaveBeenCalledWith('draft', expect.objectContaining({ phase: 'commit' }))
  act(() =>
    controls(driverRef).scene.changeSpec({
      ...RED_MARK,
      style: { ...RED_MARK.style, tiling: { enabled: true, spacing: 1.5 } },
    }),
  )
  expect(screen.queryByRole('group', { name: /Watermark position/ })).toBeNull()
  await user.click(screen.getByRole('switch', { name: 'Grid' }))
  await user.click(screen.getByRole('switch', { name: 'Snap to grid' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Grid spacing' }), {
    target: { value: '32' },
  })
  expect(screen.getByRole('switch', { name: 'Snap to grid' }).getAttribute('aria-checked')).toBe(
    'true',
  )
})

it('renders timestamp poses and both fade intervals into the real overlay canvas', async () => {
  const { driverRef, canvas } = await mount()
  act(() => {
    const { scene } = controls(driverRef)
    scene.change({
      ...scene.value,
      animations: {
        draft: {
          ...createVideoMotion(1),
          fadeIn: 0.2,
          fadeOut: 0.2,
          keyframes: [
            { time: 0, x: 0.25, y: 0.5, scale: 0.2, rotation: 0, opacity: 1 },
            { time: 0.8, x: 0.75, y: 0.5, scale: 0.2, rotation: 45, opacity: 1 },
          ],
        },
      },
    })
  })
  await waitFor(() => expect(opacity(canvas)).toBe(0))
  act(() => controls(driverRef).seek(0.4))
  await waitFor(() => expect(opacity(canvas)).toBe(255))
  const middle = placements.mock.lastCall?.[0][0]
  expect(middle?.placement.centreX).toBeCloseTo(probe.width / 2, 0)
  act(() => controls(driverRef).seek(0.9))
  await waitFor(() => expect(opacity(canvas)).toBeGreaterThan(0))
  await waitFor(() => expect(opacity(canvas)).toBeLessThan(200))
  act(() => controls(driverRef).seek(1))
  await waitFor(() => expect(opacity(canvas)).toBe(0))
})

it('reports playback failures and clears them after a successful native retry', async () => {
  const { video, user } = await mount()
  const play = vi.spyOn(video, 'play').mockRejectedValueOnce(new Error('Decoder busy'))
  await user.click(screen.getByRole('button', { name: 'Play' }))
  const refusal = await screen.findByRole('alert')
  expect(refusal.textContent).toContain('Decoder busy')
  play.mockRestore()
  fireEvent.error(video)
  expect(screen.getByRole('alert').textContent).toContain(
    'This browser could not play the selected video.',
  )
  await user.click(screen.getByRole('button', { name: 'Play' }))
  await waitFor(() => expect(video.currentTime).toBeGreaterThan(0))
  expect(screen.queryByRole('alert')).toBeNull()
  await waitFor(() => expect(video.ended).toBe(true), { timeout: 3000 })
  expect(screen.getByRole('button', { name: 'Play' })).toBeDefined()
})

it('maps a bounded preview back into original-resolution placement coordinates', async () => {
  const dimensions = { ...probe, width: 3840, height: 2160 }
  const { canvas } = await mount(dimensions)
  expect(canvas.width).toBeLessThan(dimensions.width)
  await waitFor(() => expect(opacity(canvas)).toBe(255))
  const mark = placements.mock.lastCall?.[0][0]
  expect(mark?.placement.centreX).toBeCloseTo(dimensions.width / 2)
  expect(mark?.placement.centreY).toBeCloseTo(dimensions.height / 2)
  expect(mark?.placement.width).toBeCloseTo(dimensions.width * RED_MARK.style.scale)
})

it('clears old watermark pixels when a new resource fails and recovers on a valid mark', async () => {
  const { driverRef, canvas } = await mount()
  await waitFor(() => expect(opacity(canvas)).toBe(255))
  vi.spyOn(MarkResources.prototype, 'resolve').mockRejectedValueOnce(new Error('Logo unavailable'))
  act(() =>
    controls(driverRef).scene.changeSpec({
      kind: 'image',
      assetId: 'missing-logo',
      placement: RED_MARK.placement,
      contrast: RED_MARK.contrast,
      style: RED_MARK.style,
    }),
  )
  const error = await screen.findByRole('alert')
  expect(error.textContent).toContain('Logo unavailable')
  await waitFor(() => expect(opacity(canvas)).toBe(0))
  act(() => controls(driverRef).scene.useTemplate(RED_MARK))
  await waitFor(() => expect(opacity(canvas)).toBe(255))
  expect(screen.queryByRole('alert')).toBeNull()
})
