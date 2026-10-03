import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectTimeline } from './project-timeline'
import {
  appendProjectClip,
  editProjectClip,
  emptyVideoProject,
  type VideoProject,
} from '../../../shared/video-project'
import type { ProjectMediaAsset } from '../../video/project-media'

const asset: ProjectMediaAsset = {
  id: 'source',
  kind: 'video',
  file: new File(['native bytes'], 'cut.mp4'),
  url: 'blob:source',
  poster: 'blob:poster',
  probe: { width: 640, height: 360, durationSeconds: 10, videoCodec: 'avc', audioCodec: 'aac' },
  map: { width: 1, height: 1, values: new Float32Array([0.5]) },
}
const appended = appendProjectClip(emptyVideoProject('Timeline', 640, 360), {
  id: 'source',
  kind: 'video',
  duration: 10,
  hasAudio: true,
})
const first = appended.clips[0]
if (first === undefined) throw new Error('Fixture missing.')
const project = editProjectClip(appended, first.id, { start: 2, in: 1, out: 5 })
const edits = vi.fn()
const changes = vi.fn()
const seeks = vi.fn()
const begin = vi.fn()
const end = vi.fn()
const select = vi.fn()
afterEach(() => {
  vi.restoreAllMocks()
  edits.mockClear()
  changes.mockClear()
  seeks.mockClear()
  begin.mockClear()
  end.mockClear()
  select.mockClear()
})
function mount(value = project) {
  return render(
    <ProjectTimeline
      project={value}
      assets={[asset]}
      selectedId={null}
      time={3}
      onSelect={select}
      onEdit={edits}
      onChange={changes}
      onSeek={seeks}
      onBegin={begin}
      onEnd={end}
    />,
  )
}
function pointer(element: HTMLElement, type: string, x: number, button = 0) {
  fireEvent(element, new MouseEvent(type, { bubbles: true, clientX: x, button }))
}
function boundLanes(container: HTMLElement, isRtl = false) {
  const lane = container.querySelector('[data-track="V1"]')
  if (!(lane instanceof HTMLElement)) throw new Error('Video lane missing.')
  lane.style.direction = isRtl ? 'rtl' : 'ltr'
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 52,
    width: 600,
    height: 52,
    toJSON: () => ({}),
  })
}
describe('project timeline controls', () => {
  it('moves and trims using keyboard with source and timeline bounds', () => {
    mount()
    const clip = screen.getByRole('button', { name: /^V1:/ })
    fireEvent.keyDown(clip, { key: 'ArrowRight' })
    expect(edits).toHaveBeenLastCalledWith(first.id, { start: 2.03 })
    fireEvent.keyDown(clip, { key: 'ArrowLeft' })
    expect(edits).toHaveBeenLastCalledWith(first.id, { start: 1.97 })
    const trimIn = screen.getByRole('button', { name: 'Trim start of cut.mp4 on V1' })
    fireEvent.keyDown(trimIn, { key: 'ArrowRight' })
    expect(edits).toHaveBeenLastCalledWith(first.id, { start: 2.03, in: 1.03 })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Trim end of cut.mp4 on V1' }), {
      key: 'ArrowRight',
    })
    expect(edits).toHaveBeenLastCalledWith(first.id, { out: 5.03 })
    const count = edits.mock.calls.length
    fireEvent.keyDown(clip, { key: 'Enter' })
    expect(edits).toHaveBeenCalledTimes(count)
  })
  it.each([false, true])(
    'groups pointer movement and trim with correct RTL direction (%s)',
    (isRtl) => {
      const { container } = mount()
      boundLanes(container, isRtl)
      const clip = screen.getByRole('button', { name: /^V1:/ })
      pointer(clip, 'pointermove', 200)
      expect(edits).not.toHaveBeenCalled()
      pointer(clip, 'pointerdown', 100, 2)
      expect(begin).not.toHaveBeenCalled()
      pointer(clip, 'pointerdown', 100)
      pointer(clip, 'pointermove', isRtl ? 0 : 200)
      expect(edits).toHaveBeenLastCalledWith(first.id, { start: 3 })
      pointer(clip, 'pointerup', 200)
      fireEvent.lostPointerCapture(clip)
      expect(begin).toHaveBeenCalledOnce()
      expect(end).toHaveBeenCalledOnce()
      expect(seeks).toHaveBeenCalledWith(3)
      const trim = screen.getByRole('button', { name: 'Trim start of cut.mp4 on V1' })
      pointer(trim, 'pointerdown', 100)
      pointer(trim, 'pointermove', isRtl ? 0 : 200)
      expect(edits).toHaveBeenLastCalledWith(first.id, { start: 3, in: 2 })
      pointer(trim, 'pointercancel', 200)
      const out = screen.getByRole('button', { name: 'Trim end of cut.mp4 on V1' })
      pointer(out, 'pointerdown', 100)
      pointer(out, 'pointermove', isRtl ? -2000 : 2200)
      expect(edits).toHaveBeenLastCalledWith(first.id, { out: 10 })
      pointer(out, 'pointerup', 2200)
      expect(select).toHaveBeenCalledWith(first.id)
    },
  )
  it('toggles all visibility and mute states without editing clip intervals, seeks and zooms', async () => {
    const user = userEvent.setup()
    const view = mount()
    await user.click(screen.getByRole('button', { name: 'Hide V2' }))
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ hiddenVideo: [false, true], clips: project.clips }),
    )
    await user.click(screen.getByRole('button', { name: 'Mute A4' }))
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ mutedAudio: [false, false, false, true] }),
    )
    view.rerender(
      <ProjectTimeline
        project={{ ...project, hiddenVideo: [true, true], mutedAudio: [true, true, true, true] }}
        assets={[asset]}
        selectedId={first.id}
        time={3}
        onSelect={select}
        onEdit={edits}
        onChange={changes}
        onSeek={seeks}
        onBegin={begin}
        onEnd={end}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Show V1' }))
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ hiddenVideo: [false, true] }),
    )
    await user.click(screen.getByRole('button', { name: 'Unmute A1' }))
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ mutedAudio: [false, true, true, true] }),
    )
    await user.click(
      within(screen.getByRole('region', { name: 'Timeline' })).getByRole('button', {
        name: '1.200 s',
      }),
    )
    expect(seeks).toHaveBeenLastCalledWith(1.2)
    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), {
      target: { value: '3' },
    })
    expect(view.container.querySelector('.studio-lanes')).toHaveStyle({ width: '300%' })
  })
  it('presents an empty timeline and refuses missing media', () => {
    const empty: VideoProject = emptyVideoProject('Empty')
    const view = mount(empty)
    expect(screen.getByText('Add video clips to start your timeline.')).toBeVisible()
    view.unmount()
    expect(() =>
      render(
        <ProjectTimeline
          project={project}
          assets={[]}
          selectedId={null}
          time={0}
          onSelect={select}
          onEdit={edits}
          onChange={changes}
          onSeek={seeks}
          onBegin={begin}
          onEnd={end}
        />,
      ),
    ).toThrow('source is missing')
  })
})
