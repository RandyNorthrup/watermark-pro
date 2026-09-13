import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { type ComponentProps, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { SliderField } from '../../components/ui/slider-field'
import type { VideoViewer } from '../../components/video/video-viewer'
import type * as Pipeline from '../../engine/pipeline'
import { MarkResources, type MarkInputs } from '../../lib/mark-resources'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { interruptMediaExport } from '../../test-support/interrupt-media-export'
import { renderApp } from '../../test-support/render-app'
import type { VideoCapability } from '../../video/capabilities'
import { CancelledError } from '../../video/errors'
import { probeVideo, sampleFrame } from '../../video/probe'
import type { VideoTranscoder } from '../../video/worker-client'

const capability = vi.hoisted(() => ({ value: null as VideoCapability | null }))
const encoder = vi.hoisted(() => ({
  transcode: vi.fn<VideoTranscoder['transcode']>(),
  cancel: vi.fn<VideoTranscoder['cancel']>(),
  terminate: vi.fn<VideoTranscoder['terminate']>(),
}))
vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))
vi.mock('../../lib/share-file', () => ({ canShareFiles: vi.fn(), shareFile: vi.fn() }))
vi.mock('../../video/probe', () => ({ probeVideo: vi.fn(), sampleFrame: vi.fn() }))
vi.mock('../../video/capabilities', () => ({ useVideoCapability: () => capability.value }))
vi.mock('../../video/worker-client', () => ({
  VideoTranscoder: class {
    transcode = encoder.transcode
    cancel = encoder.cancel
    terminate = encoder.terminate
  },
}))
vi.mock('../../engine/pipeline', async (original) => ({
  ...(await original<typeof Pipeline>()),
  analyseSource: () => ({ width: 1, height: 1, values: new Float32Array([0.5]) }),
}))
// Browser tests verify native decoding and pixels; jsdom supplies only the viewer's event boundary.
vi.mock('../../components/video/video-viewer', () => ({
  VideoViewer: function Viewer({
    scene,
    onPlacements,
    onTime,
    time,
    file,
    probe,
    onGesture,
  }: ComponentProps<typeof VideoViewer>) {
    const [isReady, setReady] = useState(true)
    useEffect(() => {
      onPlacements(
        (isReady ? scene.renderLayers : []).map((layer) => ({
          placement: {
            centreX: probe.width / 2,
            centreY: probe.height / 2,
            width: 400,
            height: 100,
            rotation: layer.spec.style.rotation,
            anchor: null,
          },
          contrast: { variant: 'dark', fill: '#000000', outline: 0, isAuto: true },
        })),
      )
    }, [isReady, onPlacements, probe, scene.renderLayers])
    return (
      <section aria-label="Video Preview">
        <p>{file.name}</p>
        <button onClick={() => setReady(!isReady)}>Toggle Test Preview</button>
        <button
          onClick={() => {
            const id = scene.value.activeId
            if (id === null) throw new Error('No test mark selected')
            onGesture(id, { phase: 'start', patch: {} })
            onGesture(id, {
              phase: 'move',
              patch: { x: 0.2, y: 0.3, scale: 0.4, rotation: 25 },
            })
            onGesture(id, { phase: 'end', patch: {} })
          }}
        >
          Transform Test Mark
        </button>
        <SliderField
          label="Test Playhead"
          min={0}
          max={10}
          step={1}
          value={time}
          onChange={onTime}
        />
      </section>
    )
  },
}))

const SUPPORTED: VideoCapability = {
  supported: true,
  videoCodec: 'avc',
  container: 'mp4',
  audioCodec: 'aac',
  canEncodeAudio: true,
  label: 'Saves as MP4 (H.264)',
}
async function openVideo(value = SUPPORTED) {
  capability.value = value
  seedOwnerWorkspace(fakeAuth())
  installLibraryApi({
    watermarks: [
      makeWatermark(),
      makeWatermark({
        id: 'wm-2',
        name: 'Second layer',
        spec: { ...DEFAULT_TEXT_SPEC, text: 'Second visible layer' },
      }),
    ],
  })
  const view = renderApp('/app/video')
  const input = await screen.findByLabelText('Add a video')
  return { ...view, input, user: userEvent.setup() }
}
async function loadVideo(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['video fixture'], 'vacation.mov', { type: 'video/quicktime' })
  await user.upload(screen.getByLabelText('Add a video'), file)
  await screen.findByRole('region', { name: 'Video Preview' })
  return file
}
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(screen.getByRole('option', { name: value }))
}
beforeEach(() => {
  installFakeAuth()
  capability.value = null
  downloads.mockClear()
  encoder.transcode.mockReset().mockResolvedValue(new Blob(['encoded'], { type: 'video/mp4' }))
  encoder.cancel.mockReset()
  encoder.terminate.mockReset()
  vi.mocked(probeVideo).mockReset().mockResolvedValue({
    width: 1920,
    height: 1080,
    durationSeconds: 10,
    videoCodec: 'avc',
    audioCodec: 'aac',
  })
  vi.mocked(sampleFrame)
    .mockReset()
    .mockResolvedValue(new Blob(['frame'], { type: 'image/png' }))
  vi.mocked(canShareFiles).mockReset().mockReturnValue(false)
  vi.mocked(shareFile).mockReset().mockResolvedValue('shared')
  vi.spyOn(MarkResources.prototype, 'resolve').mockImplementation((specs) =>
    Promise.resolve({ marks: specs.map((spec) => ({ spec })), fonts: [] }),
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 1920, height: 1080, close: vi.fn() }),
  )
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:video-test'), revokeObjectURL: vi.fn() })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('inline Video page', () => {
  it.each(['static', 'fading', 'keyed'] as const)(
    'exports a %s canvas gesture and groups it into one undo entry',
    async (mode) => {
      const { user } = await openVideo()
      await loadVideo(user)
      if (mode === 'fading')
        fireEvent.change(screen.getByRole('slider', { name: 'Fade In' }), {
          target: { value: '1' },
        })
      else if (mode === 'keyed')
        await user.click(screen.getByRole('button', { name: 'Add Keyframe Here' }))
      fireEvent.change(screen.getByRole('slider', { name: 'Test Playhead' }), {
        target: { value: '3' },
      })
      await user.click(screen.getByRole('button', { name: 'Transform Test Mark' }))
      await user.click(screen.getByRole('tab', { name: 'Style' }))
      expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('25')
      await user.click(screen.getByRole('button', { name: 'Undo' }))
      expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('0')
      await user.click(screen.getByRole('button', { name: 'Redo' }))
      expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('25')
      await user.click(screen.getByRole('button', { name: 'Download Video' }))
      await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
      const request = encoder.transcode.mock.calls[0]?.[0]
      if (mode === 'keyed') {
        expect(request?.motions?.[0]?.keyframes).toEqual([
          expect.objectContaining({ time: 0, rotation: 0 }),
          expect.objectContaining({ time: 3, x: 0.2, y: 0.3, scale: 0.4, rotation: 25 }),
        ])
      } else {
        expect(request?.marks[0]?.spec).toMatchObject({
          placement: { mode: 'custom', x: 0.2, y: 0.3 },
          style: { scale: 0.4, rotation: 25 },
        })
        expect(request?.motions).toEqual(
          mode === 'static' ? [null] : [expect.objectContaining({ fadeIn: 1, keyframes: [] })],
        )
      }
    },
  )
  it('withholds a timing pose while preview geometry is unavailable and recovers afterward', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    await user.click(screen.getByRole('button', { name: 'Add Keyframe Here' }))
    await user.click(screen.getByRole('button', { name: 'Toggle Test Preview' }))
    await user.click(screen.getByRole('tab', { name: 'Style' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Rotation' }), { target: { value: '40' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Wait for the watermark preview/i)
    expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: 'Transform Test Mark' }))
    expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: 'Toggle Test Preview' }))
    await user.click(screen.getByRole('button', { name: 'Transform Test Mark' }))
    expect(screen.getByRole('slider', { name: 'Rotation' })).toHaveValue('25')
  })
  it('shows the real capability refusal and exposes no runnable video controls', async () => {
    capability.value = { supported: false }
    seedOwnerWorkspace(fakeAuth())
    installLibraryApi()
    renderApp('/app/video')
    expect(await screen.findByText(/Your browser cannot encode video/)).toBeVisible()
    expect(screen.queryByLabelText('Add a video')).not.toBeInTheDocument()
  })
  it('waits for capability detection', async () => {
    seedOwnerWorkspace(fakeAuth())
    installLibraryApi()
    renderApp('/app/video')
    expect(await screen.findByRole('status', { name: 'Checking video support' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Download Video' })).not.toBeInTheDocument()
  })
  it('edits inline without saved presets and keeps chosen layers and export settings', async () => {
    const pending = Promise.withResolvers<Blob>()
    encoder.transcode.mockReturnValueOnce(pending.promise)
    const { user, unmount } = await openVideo()
    expect(screen.getByRole('button', { name: 'Download Video' })).toBeDisabled()
    const file = await loadVideo(user)
    await user.click(screen.getByRole('tab', { name: 'Presets' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Preset' }), 'wm-2')
    await user.click(screen.getByRole('tab', { name: 'Presets' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Add another preset' }), 'wm-1')
    await selectOption(user, 'Resolution', 'Fit 720p')
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
    const request = encoder.transcode.mock.calls[0]?.[0]
    expect(request?.source).toBe(file)
    expect(request?.plan).toMatchObject({
      videoCodec: 'avc',
      container: 'mp4',
      bitrate: 5_333_333,
      output: { width: 1280, height: 720 },
      audio: { mode: 'copy', codec: 'aac' },
    })
    expect(
      request?.marks.map((mark) => (mark.spec.kind === 'text' ? mark.spec.text : null)),
    ).toEqual(['Second visible layer', '© Acme Studio'])
    act(() => encoder.transcode.mock.calls[0]?.[1]?.onProgress?.(150, 5))
    expect(screen.getByRole('progressbar', { name: 'Transcoding progress' })).toHaveAttribute(
      'value',
      '0.5',
    )
    const output = new Blob(['complete video'], { type: 'video/mp4' })
    await act(async () => {
      pending.resolve(output)
      await pending.promise
    })
    await waitFor(() => expect(downloads).toHaveBeenCalledWith(output, 'vacation-watermarked.mp4'))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    unmount()
    expect(encoder.terminate).toHaveBeenCalledOnce()
  })
  it('stores timestamp poses and fades in the exported plan and makes timing edits undoable', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    await user.click(await screen.findByRole('button', { name: 'Add Keyframe Here' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Test Playhead' }), {
      target: { value: '5' },
    })
    await user.click(screen.getByRole('button', { name: 'Add Keyframe Here' }))
    await user.click(screen.getByRole('tab', { name: 'Style' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Rotation' }), {
      target: { value: '25' },
    })
    fireEvent.change(screen.getByRole('slider', { name: 'Fade In' }), { target: { value: '1' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Fade Out' }), { target: { value: '1' } })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
    expect(encoder.transcode.mock.calls[0]?.[0].motions).toEqual([
      expect.objectContaining({
        fadeIn: 1,
        fadeOut: 1,
        keyframes: [
          expect.objectContaining({ time: 0, rotation: 0 }),
          expect.objectContaining({ time: 5, rotation: 25 }),
        ],
      }),
    ])
  })
  it('saves a named draft without dropping its timestamp pose or fade from the export', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    await user.clear(screen.getByRole('textbox', { name: 'Text' }))
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'Portfolio Proof')
    await user.click(await screen.findByRole('button', { name: 'Add Keyframe Here' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Fade In' }), { target: { value: '1' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: /Save preset/i })
    await user.type(within(dialog).getByRole('textbox', { name: /Preset name/i }), 'Portfolio')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(screen.getByRole('slider', { name: 'Fade In' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Update Keyframe Here' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
    const request = encoder.transcode.mock.calls[0]?.[0]
    expect(request?.marks).toHaveLength(1)
    expect(request?.marks[0]?.spec).toMatchObject({ text: 'Portfolio Proof' })
    expect(request?.motions).toEqual([
      expect.objectContaining({ fadeIn: 1, keyframes: [expect.objectContaining({ time: 0 })] }),
    ])
  })
  it('replaces a longer clip without carrying its timing or undo state into a shorter clip', async () => {
    const { user, input } = await openVideo()
    await loadVideo(user)
    fireEvent.change(screen.getByRole('slider', { name: 'Start' }), { target: { value: '8' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Test Playhead' }), {
      target: { value: '9' },
    })
    await user.click(screen.getByRole('button', { name: 'Add Keyframe Here' }))
    vi.mocked(probeVideo).mockResolvedValueOnce({
      width: 640,
      height: 360,
      durationSeconds: 2,
      videoCodec: 'avc',
      audioCodec: null,
    })
    const short = new File(['shorter clip'], 'short.mp4', { type: 'video/mp4' })
    await user.upload(input, short)
    await screen.findByText('short.mp4')
    expect(screen.getByRole('slider', { name: 'Start' })).toHaveValue('0')
    expect(screen.getByRole('slider', { name: 'End' })).toHaveValue('2')
    expect(screen.queryByRole('list', { name: 'Keyframes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
    expect(encoder.transcode.mock.calls[0]?.[0]).toMatchObject({ source: short, motions: [null] })
  })
  it('shares a WebM result and keeps the cached output after sharing fails', async () => {
    vi.mocked(canShareFiles).mockReturnValue(true)
    const { user } = await openVideo({
      supported: true,
      videoCodec: 'vp9',
      container: 'webm',
      audioCodec: 'opus',
      canEncodeAudio: false,
      label: 'Saves as WebM (VP9)',
    })
    const output = new Blob(['webm'], { type: 'video/webm' })
    encoder.transcode.mockResolvedValue(output)
    await loadVideo(user)
    await user.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(shareFile).toHaveBeenCalledWith(output, 'vacation-watermarked.webm'))
    expect(encoder.transcode.mock.calls[0]?.[0].plan.audio).toEqual({ mode: 'none' })
    vi.mocked(shareFile).mockRejectedValueOnce(new Error('Share refused'))
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Share refused')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledWith(output, 'vacation-watermarked.webm'))
    expect(encoder.transcode).toHaveBeenCalledOnce()
  })
  it('recovers from a rejected source and ignores an empty picker', async () => {
    const { user, input } = await openVideo()
    fireEvent.change(input, { target: { files: [] } })
    expect(probeVideo).not.toHaveBeenCalled()
    vi.mocked(probeVideo).mockRejectedValueOnce(new Error('This file has no video track.'))
    const parent = input.parentElement
    if (parent === null) throw new Error('Drop target missing')
    fireEvent.drop(parent, { dataTransfer: { files: [new File(['bad'], 'notes.txt')] } })
    expect(await screen.findByText('This file has no video track.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download Video' })).toBeDisabled()
    await loadVideo(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it.each(['edit', 'cancel', 'account', 'unmount'] as const)(
    'withholds output that finishes after %s',
    async (action) => {
      const pending = Promise.withResolvers<Blob>()
      encoder.transcode.mockReturnValueOnce(pending.promise)
      const { user, unmount } = await openVideo()
      await loadVideo(user)
      await user.click(screen.getByRole('button', { name: 'Download Video' }))
      await waitFor(() => expect(encoder.transcode).toHaveBeenCalledOnce())
      await interruptMediaExport(action, user, unmount)
      await act(async () => {
        pending.resolve(new Blob(['stale']))
        await pending.promise
      })
      expect(downloads).not.toHaveBeenCalled()
      if (action === 'edit') expect(await screen.findByText(/changed during export/)).toBeVisible()
    },
  )
  it.each(['cancel', 'unmount'] as const)(
    'does not start encoding after %s while resources load',
    async (action) => {
      const resources = Promise.withResolvers<MarkInputs>()
      const { user, unmount } = await openVideo()
      await loadVideo(user)
      const resolve = vi
        .spyOn(MarkResources.prototype, 'resolve')
        .mockReturnValueOnce(resources.promise)
      await user.click(screen.getByRole('button', { name: 'Download Video' }))
      await waitFor(() => expect(resolve).toHaveBeenCalledOnce())
      if (action === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }))
      else unmount()
      await act(async () => {
        resources.resolve({ marks: [{ spec: DEFAULT_TEXT_SPEC }], fonts: [] })
        await resources.promise
      })
      expect(encoder.transcode).not.toHaveBeenCalled()
      expect(downloads).not.toHaveBeenCalled()
    },
  )
  it('reports encoder failures and permits a complete retry', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    encoder.transcode.mockRejectedValueOnce(new CancelledError())
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await screen.findByRole('alert')
    expect(downloads).not.toHaveBeenCalled()
    encoder.transcode.mockRejectedValueOnce(new Error('Encoder unavailable'))
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    expect(await screen.findByText('Encoder unavailable')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Download Video' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledOnce())
  })
})
