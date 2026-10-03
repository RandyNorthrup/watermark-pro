import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, createRef, useLayoutEffect, useState } from 'react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { ProjectPreview, type ProjectPlaybackHandle } from './project-preview'
import {
  appendProjectClip,
  editProjectClip,
  emptyVideoProject,
  type VideoProject,
} from '../../../shared/video-project'
import type { ProjectMediaAsset } from '../../video/project-media'
import { encodeTestAudio } from '../../video/test-support/audio'
import { encodeTestClip } from '../../video/test-support/clip'

let assets: ProjectMediaAsset[]
let timeline: VideoProject
const playing = vi.fn()
const frames = vi.fn()
const errors = vi.fn()

beforeAll(async () => {
  const clip = await encodeTestClip()
  const audio = await encodeTestAudio()
  const file = new File([clip.blob], 'first.mp4')
  const url = URL.createObjectURL(file)
  const probe = {
    width: 320,
    height: 240,
    durationSeconds: 1,
    videoCodec: clip.codec,
    audioCodec: null,
  }
  const picture: ProjectMediaAsset = {
    id: 'first',
    kind: 'video',
    file,
    url,
    poster: url,
    probe,
    map: { width: 1, height: 1, values: new Float32Array([0.5]) },
  }
  const second: ProjectMediaAsset = {
    ...picture,
    id: 'second',
    file: new File([clip.blob], 'second.mp4'),
  }
  const sound: ProjectMediaAsset = {
    id: 'sound',
    kind: 'audio',
    file: new File([audio], 'music.wav'),
    url: URL.createObjectURL(audio),
    probe: { durationSeconds: 1, audioCodec: 'pcm-s16' },
  }
  assets = [picture, second, sound]
  const first = appendProjectClip(emptyVideoProject('Preview', 320, 240), {
    id: 'first',
    kind: 'video',
    duration: 1,
    hasAudio: false,
  })
  const firstClip = first.clips[0]
  if (firstClip === undefined) throw new Error('Fixture missing.')
  timeline = appendProjectClip(editProjectClip(first, firstClip.id, { out: 0.5 }), {
    id: 'second',
    kind: 'video',
    duration: 1,
    hasAudio: false,
  })
}, 20_000)
afterEach(() => {
  cleanup()
  playing.mockClear()
  frames.mockClear()
  errors.mockClear()
  vi.restoreAllMocks()
})
afterAll(() => {
  for (const asset of assets) URL.revokeObjectURL(asset.url)
})

function Preview({
  project,
  playback,
  startImmediately = false,
}: {
  project: VideoProject
  playback: { current: ProjectPlaybackHandle | null }
  startImmediately?: boolean
}) {
  const [time, setTime] = useState(0)
  useLayoutEffect(() => {
    if (startImmediately) void handle(playback).toggle().catch(errors)
  }, [playback, startImmediately])
  return createElement(
    'div',
    {},
    createElement(ProjectPreview, {
      project,
      assets,
      time,
      onTime: setTime,
      onFrame: frames,
      onPlaying: playing,
      onError: errors,
      playbackRef: playback,
    }),
    createElement(
      'button',
      {
        onClick: () => {
          if (playback.current !== null) void playback.current.toggle().catch(errors)
        },
      },
      'Play test',
    ),
    createElement('output', { 'aria-label': 'Project time' }, String(time)),
  )
}
function handle(playback: { current: ProjectPlaybackHandle | null }) {
  if (playback.current === null) throw new Error('Playback handle missing.')
  return playback.current
}

it('preserves a native play request that starts before the initial paused effect flushes', async () => {
  const playback = createRef<ProjectPlaybackHandle>()
  render(createElement(Preview, { project: timeline, playback, startImmediately: true }))
  await waitFor(() => {
    const element = screen.getByLabelText('first.mp4')
    if (!(element instanceof HTMLVideoElement)) throw new Error('Video missing.')
    expect(element.paused).toBe(false)
    expect(Number(screen.getByLabelText('Project time').textContent)).toBeGreaterThan(0.05)
  })
  expect(playing).toHaveBeenLastCalledWith(true)
  expect(errors).not.toHaveBeenCalled()
  await act(() => handle(playback).toggle())
  expect(playing).toHaveBeenLastCalledWith(false)
  expect(errors).not.toHaveBeenCalled()
})

it('reports a genuine native playback refusal rather than treating it as intentional cancellation', async () => {
  const refused = new DOMException('Native playback fixture refused.', 'NotAllowedError')
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(refused)
  const playback = createRef<ProjectPlaybackHandle>()
  render(createElement(Preview, { project: timeline, playback, startImmediately: true }))
  await waitFor(() => expect(errors).toHaveBeenCalledWith(refused))
  expect(playing).toHaveBeenLastCalledWith(false)
})

it('seeks across source cuts, displays the last frame and follows the project clock through playback', async () => {
  const playback = createRef<ProjectPlaybackHandle>()
  render(createElement(Preview, { project: timeline, playback }))
  await waitFor(() => {
    const element = screen.getByLabelText('first.mp4')
    if (!(element instanceof HTMLVideoElement)) throw new Error('Video missing.')
    expect(element.readyState).toBeGreaterThan(0)
  })
  act(() => handle(playback).seek(0.7))
  await waitFor(() => {
    const element = screen.getByLabelText('second.mp4')
    if (!(element instanceof HTMLVideoElement)) throw new Error('Video element missing.')
    expect(element.currentTime).toBeCloseTo(0.2)
  })
  expect(screen.queryByLabelText('first.mp4')).toBeNull()
  act(() => handle(playback).seek(9))
  expect(screen.getByLabelText('Project time').textContent).toBe('1.5')
  expect(screen.getByLabelText('second.mp4')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Play test' }))
  await waitFor(() => expect(playing).toHaveBeenCalledWith(true))
  await waitFor(() => expect(screen.getByLabelText('first.mp4')).toBeVisible())
  await waitFor(() => expect(screen.getByLabelText('second.mp4')).toBeVisible())
  await waitFor(() => expect(screen.getByLabelText('Project time').textContent).toBe('1.5'), {
    timeout: 3000,
  })
  expect(playing).toHaveBeenLastCalledWith(false)
  expect(frames).toHaveBeenCalled()
  expect(errors).not.toHaveBeenCalled()
})

it('shows gaps and hidden tracks, and reports real media errors', async () => {
  const first = timeline.clips[0]
  if (first === undefined) throw new Error('Fixture missing.')
  const delayed = editProjectClip({ ...timeline, clips: [first] }, first.id, { start: 0.25 })
  const playback = createRef<ProjectPlaybackHandle>()
  const view = render(createElement(Preview, { project: delayed, playback }))
  expect(screen.queryByLabelText('first.mp4')).toBeNull()
  act(() => handle(playback).seek(0.4))
  const video = await screen.findByLabelText('first.mp4')
  fireEvent.error(video)
  expect(errors).toHaveBeenCalledWith(expect.any(Error))
  expect(playing).toHaveBeenLastCalledWith(false)
  view.rerender(
    createElement(Preview, { project: { ...delayed, hiddenVideo: [true, false] }, playback }),
  )
  expect(screen.queryByLabelText('first.mp4')).toBeNull()
  act(() => handle(playback).seek(-1))
  expect(screen.getByLabelText('Project time').textContent).toBe('0')
})

it('uses native gain nodes for sound levels and track mute, and pauses every active source', async () => {
  const withAudio = appendProjectClip(timeline, {
    id: 'sound',
    kind: 'audio',
    duration: 1,
    hasAudio: true,
  })
  const clip = withAudio.clips.at(-1)
  if (clip === undefined) throw new Error('Sound fixture missing.')
  const project = editProjectClip(withAudio, clip.id, { gain: 0.5 })
  const playback = createRef<ProjectPlaybackHandle>()
  const gains = vi.spyOn(AudioContext.prototype, 'createGain')
  const view = render(createElement(Preview, { project, playback }))
  await userEvent.click(screen.getByRole('button', { name: 'Play test' }))
  await waitFor(() => expect(playing).toHaveBeenCalledWith(true))
  const node = gains.mock.results.find((result) => result.type === 'return')?.value
  if (!(node instanceof GainNode)) throw new Error('Native audio gain missing.')
  expect(node.gain.value).toBe(0.5)
  view.rerender(
    createElement(Preview, {
      project: { ...project, mutedAudio: [false, false, true, false] },
      playback,
    }),
  )
  await waitFor(() => expect(node.gain.value).toBe(0))
  await userEvent.click(screen.getByRole('button', { name: 'Play test' }))
  expect(playing).toHaveBeenLastCalledWith(false)
  for (const media of view.container.querySelectorAll('video,audio')) {
    if (!(media instanceof HTMLMediaElement)) throw new Error('Native media missing.')
    expect(media.paused).toBe(true)
  }
  expect(errors).not.toHaveBeenCalled()
})
