/** The detector and hook run normally; only browser codec probes are controlled. */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { canEncodeAudio, canEncodeVideo } from 'mediabunny'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectVideoCapability, hasVideoEncoder, useVideoCapability } from './capabilities'

vi.mock('mediabunny', () => ({ canEncodeAudio: vi.fn(), canEncodeVideo: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('VideoEncoder', Object)
  vi.mocked(canEncodeVideo).mockReset().mockResolvedValue(true)
  vi.mocked(canEncodeAudio).mockReset().mockResolvedValue(true)
})

afterEach(() => vi.unstubAllGlobals())

class DetectionBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override state: { error: Error | null } = { error: null }

  override render() {
    if (this.state.error !== null) return <p role="alert">{this.state.error.message}</p>
    return this.props.children
  }
}

function CapabilityReport() {
  const capability = useVideoCapability()
  if (capability === null) return <p role="status">Checking codecs</p>
  if (!capability.supported) return <p>Unsupported browser</p>
  return <p>{capability.label}</p>
}

describe('video capability detection boundaries', () => {
  it('refuses absent WebCodecs without asking the encoder library to probe', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    expect(hasVideoEncoder()).toBe(false)
    await expect(detectVideoCapability()).resolves.toEqual({ supported: false })
    expect(canEncodeVideo).not.toHaveBeenCalled()
    expect(canEncodeAudio).not.toHaveBeenCalled()
  })

  it('refuses a browser that has WebCodecs but cannot encode any supported video format', async () => {
    vi.mocked(canEncodeVideo).mockResolvedValue(false)
    expect(hasVideoEncoder()).toBe(true)
    await expect(detectVideoCapability()).resolves.toEqual({ supported: false })
    expect(vi.mocked(canEncodeVideo).mock.calls.map(([codec]) => codec)).toEqual([
      'avc',
      'hevc',
      'vp9',
      'av1',
    ])
    expect(canEncodeAudio).not.toHaveBeenCalled()
  })

  it.each([
    ['avc', 'mp4', 'aac', true, 'Saves as MP4 (H.264)', ['avc']],
    ['vp9', 'webm', 'opus', false, 'Saves as WebM (VP9)', ['avc', 'hevc', 'vp9']],
  ] as const)(
    'selects %s with compatible container/audio and reports actual audio encoder availability',
    async (videoCodec, container, audioCodec, canEncodeAudioTrack, label, attempts) => {
      vi.mocked(canEncodeVideo).mockImplementation((codec) => Promise.resolve(codec === videoCodec))
      vi.mocked(canEncodeAudio).mockResolvedValue(canEncodeAudioTrack)
      await expect(detectVideoCapability()).resolves.toEqual({
        supported: true,
        videoCodec,
        container,
        audioCodec,
        canEncodeAudio: canEncodeAudioTrack,
        label,
      })
      expect(vi.mocked(canEncodeVideo).mock.calls.map(([codec]) => codec)).toEqual(attempts)
      expect(canEncodeAudio).toHaveBeenCalledExactlyOnceWith(audioCodec)
    },
  )

  it('keeps capability pending until both video and audio probes settle', async () => {
    const audio = Promise.withResolvers<boolean>()
    vi.mocked(canEncodeAudio).mockReturnValue(audio.promise)
    const { result } = renderHook(() => useVideoCapability())
    expect(result.current).toBeNull()
    await waitFor(() => expect(canEncodeAudio).toHaveBeenCalledOnce())
    expect(result.current).toBeNull()
    await act(async () => {
      audio.resolve(false)
      await audio.promise
    })
    expect(result.current).toMatchObject({
      supported: true,
      canEncodeAudio: false,
      container: 'mp4',
    })
  })

  it('publishes unsupported capability after the hook completes detection', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    render(<CapabilityReport />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking codecs')
    expect(await screen.findByText('Unsupported browser')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([new Error('Encoder permission failed'), 'non-error probe failure'])(
    'reports unexpected codec detection failure %j through the error boundary',
    async (failure) => {
      vi.mocked(canEncodeVideo).mockRejectedValue(failure)
      const caught = vi.fn()
      render(
        <DetectionBoundary>
          <CapabilityReport />
        </DetectionBoundary>,
        { onCaughtError: caught },
      )
      const message = failure instanceof Error ? failure.message : 'Video support detection failed.'
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      const received: unknown = caught.mock.calls[0]?.[0]
      if (failure instanceof Error) expect(received).toBe(failure)
      else expect(received).toMatchObject({ message, cause: failure })
      expect(screen.queryByText('Unsupported browser')).not.toBeInTheDocument()
    },
  )

  it.each(['success', 'failure'] as const)(
    'does not publish a late %s after the capability consumer unmounts',
    async (outcome) => {
      const probe = Promise.withResolvers<boolean>()
      vi.mocked(canEncodeVideo).mockReturnValue(probe.promise)
      const caught = vi.fn()
      const { unmount } = render(
        <DetectionBoundary>
          <CapabilityReport />
        </DetectionBoundary>,
        {
          onCaughtError: caught,
        },
      )
      await waitFor(() => expect(canEncodeVideo).toHaveBeenCalledOnce())
      unmount()
      await act(async () => {
        if (outcome === 'success') probe.resolve(true)
        else probe.reject(new Error('Disposed codec probe'))
        await Promise.allSettled([probe.promise])
      })
      expect(caught).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByText('Saves as MP4 (H.264)')).not.toBeInTheDocument()
    },
  )
})
