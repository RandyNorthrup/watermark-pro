import { act, createEvent, fireEvent, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { MarkResources, type MarkInputs } from '../../lib/mark-resources'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import {
  previewSubjects,
  PreviewRenderer,
  renderedBatches,
  resetFakePreview,
} from '../../test-support/fake-preview'
import { renderApp } from '../../test-support/render-app'
import type { VideoCapability } from '../../video/capabilities'
import { CancelledError } from '../../video/errors'
import { probeVideo, sampleFrame } from '../../video/probe'
import type { VideoTranscoder } from '../../video/worker-client'

const capabilityState = vi.hoisted(() => ({
  value: null as VideoCapability | null,
}))
const transcoderState = vi.hoisted(() => ({
  transcode: vi.fn<VideoTranscoder['transcode']>(),
  cancel: vi.fn<VideoTranscoder['cancel']>(),
  terminate: vi.fn<VideoTranscoder['terminate']>(),
}))

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))
vi.mock('../../lib/share-file', () => ({ canShareFiles: vi.fn(), shareFile: vi.fn() }))
vi.mock('../../video/probe', () => ({ probeVideo: vi.fn(), sampleFrame: vi.fn() }))
vi.mock('../../video/worker-client', () => ({
  VideoTranscoder: class {
    transcode = transcoderState.transcode
    cancel = transcoderState.cancel
    terminate = transcoderState.terminate
  },
}))
vi.mock('../../video/capabilities', () => ({
  useVideoCapability: () => capabilityState.value,
}))

const client = fakeAuth
const SUPPORTED: VideoCapability = {
  supported: true,
  videoCodec: 'avc',
  container: 'mp4',
  audioCodec: 'aac',
  canEncodeAudio: true,
  label: 'Saves as MP4 (H.264)',
}

async function openVideo(capability = SUPPORTED) {
  const user = userEvent.setup()
  capabilityState.value = capability
  seedOwnerWorkspace(client())
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
  return { ...view, user, input }
}

async function loadVideo(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['video fixture'], 'vacation.mov', { type: 'video/quicktime' })
  await user.upload(screen.getByLabelText('Add a video'), file)
  await screen.findByRole('heading', { name: file.name })
  return file
}

async function selectOption(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(screen.getByRole('option', { name: value }))
}

beforeEach(() => {
  installFakeAuth()
  capabilityState.value = null
  resetFakePreview()
  downloads.mockClear()
  transcoderState.transcode
    .mockReset()
    .mockResolvedValue(new Blob(['encoded'], { type: 'video/mp4' }))
  transcoderState.cancel.mockReset()
  transcoderState.terminate.mockReset()
  vi.mocked(probeVideo).mockReset().mockResolvedValue({
    width: 1920,
    height: 1080,
    durationSeconds: 10,
    videoCodec: 'avc',
    audioCodec: 'aac',
  })
  vi.mocked(sampleFrame)
    .mockReset()
    .mockResolvedValue(new Blob(['first frame'], { type: 'image/png' }))
  vi.mocked(canShareFiles).mockReset().mockReturnValue(false)
  vi.mocked(shareFile).mockReset().mockResolvedValue('shared')
  vi.spyOn(MarkResources.prototype, 'resolve').mockImplementation((specs) =>
    Promise.resolve({ marks: specs.map((spec) => ({ spec })), fonts: [] }),
  )
  Object.assign(URL, { revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('video page', () => {
  it('shows the unsupported message when the browser cannot encode video', async () => {
    capabilityState.value = { supported: false }
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/video')

    expect(await screen.findByText(/Your browser cannot encode video/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a video')).not.toBeInTheDocument()
  })

  it('shows the tool when the browser can encode video', async () => {
    capabilityState.value = {
      supported: true,
      videoCodec: 'avc',
      container: 'mp4',
      audioCodec: 'aac',
      canEncodeAudio: true,
      label: 'Saves as MP4 (H.264)',
    }
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/video')

    expect(await screen.findByLabelText('Add a video')).toBeInTheDocument()
    expect(screen.getByText('Saves as MP4 (H.264)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Studio signature' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Placement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeInTheDocument()
  })
  it('reports pending capability detection without exposing a runnable workbench', async () => {
    seedOwnerWorkspace(client())
    renderApp('/app/video')
    expect(
      await screen.findByRole('status', { name: 'Checking video support' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Watermark video' })).not.toBeInTheDocument()
  })
  it('preserves chosen layer order and export settings through progress, download and cleanup', async () => {
    const pending = Promise.withResolvers<Blob>()
    transcoderState.transcode.mockReturnValue(pending.promise)
    const clear = vi.spyOn(MarkResources.prototype, 'clear')
    const { user, unmount } = await openVideo()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeDisabled()
    const file = await loadVideo(user)
    expect(
      screen.getByText('Choose a preset to preview the watermark on a frame.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('checkbox', { name: /Second layer/ }))
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await selectOption(user, 'Placement', 'Top left')
    await selectOption(user, 'Quality', 'High')
    await selectOption(user, 'Resolution', 'Fit 720p')
    expect(screen.getByText('Output 1280 × 720 px.')).toBeInTheDocument()
    expect(
      await screen.findByRole('img', { name: 'The watermark on a frame of the video' }),
    ).toHaveAttribute('src', expect.stringContaining('blob:preview-'))
    expect(sampleFrame).toHaveBeenCalledWith(file, 0)
    expect(previewSubjects.at(-1)?.name).toBe('frame.png')
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    await waitFor(() => expect(transcoderState.transcode).toHaveBeenCalledOnce())
    const request = transcoderState.transcode.mock.calls[0]?.[0]
    expect(request?.source).toBe(file)
    expect(request?.plan).toMatchObject({
      videoCodec: 'avc',
      container: 'mp4',
      bitrate: 5_333_333,
      output: { width: 1280, height: 720 },
      audio: { mode: 'copy', codec: 'aac' },
    })
    expect(request?.marks.map((mark) => mark.spec.placement)).toEqual([
      { mode: 'anchor', anchor: 'top-left' },
      { mode: 'anchor', anchor: 'top-left' },
    ])
    expect(
      request?.marks.map((mark) => (mark.spec.kind === 'text' ? mark.spec.text : null)),
    ).toEqual(['Second visible layer', '© Acme Studio'])
    expect(renderedBatches.at(-1)).toEqual(request?.marks.map((mark) => mark.spec))
    expect(screen.getByRole('button', { name: 'Watermarking…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add a video' })).toBeDisabled()
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled()
    expect(screen.getByText('Frame 0 · 0%')).toBeInTheDocument()
    act(() => {
      transcoderState.transcode.mock.calls[0]?.[1]?.onProgress?.(150, 5)
    })
    expect(screen.getByRole('progressbar', { name: 'Transcoding progress' })).toHaveAttribute(
      'value',
      '0.5',
    )
    expect(screen.getByText(/Frame 150 · 50% · about/)).toBeInTheDocument()
    const output = new Blob(['complete video'], { type: 'video/mp4' })
    await act(async () => {
      pending.resolve(output)
      await pending.promise
    })
    await user.click(
      await screen.findByRole('button', { name: 'Download vacation-watermarked.mp4' }),
    )
    expect(downloads).toHaveBeenCalledExactlyOnceWith(output, 'vacation-watermarked.mp4')
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    unmount()
    expect(transcoderState.terminate).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    expect(PreviewRenderer.disposed).toBe(1)
  })
  it('exports WebM and surfaces share failures while preserving the downloadable result', async () => {
    vi.mocked(canShareFiles).mockReturnValue(true)
    const { user } = await openVideo({
      supported: true,
      videoCodec: 'vp9',
      container: 'webm',
      audioCodec: 'opus',
      canEncodeAudio: false,
      label: 'Saves as WebM (VP9)',
    })
    const output = new Blob(['webm output'], { type: 'video/webm' })
    transcoderState.transcode.mockResolvedValue(output)
    await loadVideo(user)
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    const download = await screen.findByRole('button', {
      name: 'Download vacation-watermarked.webm',
    })
    expect(canShareFiles).toHaveBeenCalledWith('video/webm')
    expect(transcoderState.transcode.mock.calls[0]?.[0].plan.audio).toEqual({ mode: 'none' })
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(shareFile).toHaveBeenCalledWith(output, 'vacation-watermarked.webm')
    vi.mocked(shareFile).mockRejectedValueOnce(new Error('Share target refused this file'))
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Share target refused this file')).toBeInTheDocument()
    await user.click(download)
    expect(downloads).toHaveBeenCalledWith(output, 'vacation-watermarked.webm')
  })
  it('accepts drops, ignores an empty picker, and recovers after a rejected source', async () => {
    const { user, input } = await openVideo()
    const clicked = vi.spyOn(input, 'click')
    await user.click(screen.getByRole('button', { name: 'Add a video' }))
    expect(clicked).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { files: [] } })
    const dropZone = input.parentElement
    if (dropZone === null) throw new Error('Video drop zone missing')
    const drag = createEvent.dragOver(dropZone)
    fireEvent(dropZone, drag)
    expect(drag.defaultPrevented).toBe(true)
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } })
    expect(probeVideo).not.toHaveBeenCalled()
    vi.mocked(probeVideo).mockRejectedValueOnce(new Error('This file has no video track.'))
    fireEvent.drop(dropZone, { dataTransfer: { files: [new File(['bad'], 'notes.txt')] } })
    expect(await screen.findByText('This file has no video track.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeDisabled()
    await loadVideo(user)
    expect(screen.queryByText('This file has no video track.')).not.toBeInTheDocument()
    expect(transcoderState.transcode).not.toHaveBeenCalled()
  })
  it('cancels an active job without offering partial output, then permits a successful retry', async () => {
    const pending = Promise.withResolvers<Blob>()
    transcoderState.transcode.mockReturnValueOnce(pending.promise)
    transcoderState.cancel.mockImplementation(() => pending.reject(new CancelledError()))
    const { user } = await openVideo()
    await loadVideo(user)
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    await waitFor(() => expect(transcoderState.transcode).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Transcoding cancelled.')).toBeInTheDocument()
    expect(transcoderState.cancel).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Download vacation/ })).not.toBeInTheDocument()
    act(() => {
      transcoderState.transcode.mock.calls[0]?.[1]?.onProgress?.(999, 9)
    })
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    expect(
      await screen.findByRole('button', { name: 'Download vacation-watermarked.mp4' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Transcoding cancelled.')).not.toBeInTheDocument()
  })
  it('reports resource and encoder failures and releases the run controls for another attempt', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    vi.spyOn(MarkResources.prototype, 'resolve').mockRejectedValueOnce(
      new Error('Font bytes unavailable'),
    )
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    expect(await screen.findByText('Font bytes unavailable')).toBeInTheDocument()
    expect(transcoderState.transcode).not.toHaveBeenCalled()
    transcoderState.transcode.mockRejectedValueOnce(new Error('Encoder lost its device'))
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    expect(await screen.findByText('Encoder lost its device')).toBeInTheDocument()
    expect(screen.queryByText('Font bytes unavailable')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Download vacation/ })).not.toBeInTheDocument()
  })
  it('shows preview frame errors and discards frames that complete after the selection is removed', async () => {
    const { user } = await openVideo()
    await loadVideo(user)
    vi.mocked(sampleFrame).mockRejectedValueOnce(new Error('Frame cannot be decoded'))
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    expect(await screen.findByText('Frame cannot be decoded')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    const pending = Promise.withResolvers<Blob>()
    vi.mocked(sampleFrame).mockReturnValueOnce(pending.promise)
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await waitFor(() => expect(sampleFrame).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status', { name: 'Rendering preview' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await act(async () => {
      pending.resolve(new Blob(['stale']))
      await pending.promise
    })
    expect(previewSubjects).toEqual([])
    expect(
      screen.queryByRole('img', { name: 'The watermark on a frame of the video' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeDisabled()
  })
  it.each(['cancel', 'unmount'] as const)(
    'does not start a worker after %s while mark resources are still loading',
    async (action) => {
      const preparing = Promise.withResolvers<MarkInputs>()
      const resolve = vi
        .spyOn(MarkResources.prototype, 'resolve')
        .mockReturnValueOnce(preparing.promise)
      const { user, unmount } = await openVideo()
      await loadVideo(user)
      await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
      await user.click(screen.getByRole('button', { name: 'Watermark video' }))
      await waitFor(() => expect(resolve).toHaveBeenCalledOnce())
      expect(transcoderState.transcode).not.toHaveBeenCalled()
      if (action === 'cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }))
      else unmount()
      const close = vi.fn()
      const bitmap = { close, width: 1, height: 1 } as unknown as ImageBitmap
      await act(async () => {
        preparing.resolve({
          marks: [
            { spec: DEFAULT_TEXT_SPEC },
            {
              spec: {
                kind: 'image',
                assetId: 'logo-1',
                placement: DEFAULT_TEXT_SPEC.placement,
                contrast: DEFAULT_TEXT_SPEC.contrast,
                style: DEFAULT_TEXT_SPEC.style,
              },
              image: bitmap,
            },
          ],
          fonts: [],
        })
        await preparing.promise
      })
      expect(transcoderState.transcode).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledOnce()
      expect(downloads).not.toHaveBeenCalled()
      if (action === 'cancel')
        expect(await screen.findByText('Transcoding cancelled.')).toBeInTheDocument()
    },
  )
  it('withholds a completed result that races with cancellation after bitmap ownership transferred', async () => {
    const pending = Promise.withResolvers<Blob>()
    transcoderState.transcode.mockReturnValueOnce(pending.promise)
    const close = vi.fn()
    const bitmap = { close, width: 1, height: 1 } as unknown as ImageBitmap
    vi.spyOn(MarkResources.prototype, 'resolve').mockResolvedValueOnce({
      marks: [{ spec: DEFAULT_TEXT_SPEC, image: bitmap }],
      fonts: [],
    })
    const { user } = await openVideo()
    await loadVideo(user)
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('button', { name: 'Watermark video' }))
    await waitFor(() => expect(transcoderState.transcode).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      pending.resolve(new Blob(['cancelled result']))
      await pending.promise
    })
    expect(await screen.findByText('Transcoding cancelled.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download vacation/ })).not.toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
  })
})
