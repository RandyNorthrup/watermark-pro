import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { VideoTimeline } from './video-timeline'
import {
  createVideoMotion,
  VIDEO_MOTION_LIMITS,
  videoMotionSchema,
  type VideoMotion,
} from '../../video/motion'

const POSE = { x: 0.4, y: 0.6, scale: 0.2, rotation: 0, opacity: 1 }

function Timeline({
  initial,
  duration = 10,
  time = 0,
  onSeek = vi.fn(),
  onKeyframe = vi.fn(),
}: {
  initial: VideoMotion
  duration?: number
  time?: number
  onSeek?: (time: number) => void
  onKeyframe?: () => void
}) {
  const [motion, setMotion] = useState(initial)
  return (
    <VideoTimeline
      motion={motion}
      duration={duration}
      time={time}
      onChange={(value) => setMotion(videoMotionSchema.parse(value))}
      onSeek={onSeek}
      onKeyframe={onKeyframe}
    />
  )
}

describe('video interval and keyframe controls', () => {
  it('shortens the visible interval without overlapping fades or negative slider ranges', () => {
    render(<Timeline initial={{ ...createVideoMotion(10), fadeIn: 4, fadeOut: 4 }} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start' }), { target: { value: '9' } })
    expect(screen.getByRole('slider', { name: 'Fade In' })).toHaveValue('1')
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveValue('0')
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveAttribute('max', '0')
    fireEvent.change(screen.getByRole('slider', { name: 'End' }), { target: { value: '9.5' } })
    expect(screen.getByRole('slider', { name: 'Fade In' })).toHaveValue('0.5')
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveValue('0')
    expect(screen.getByRole('slider', { name: 'Start' })).toHaveAttribute('max', '9.49')
  })

  it('resets each interval and fade independently to its documented default', async () => {
    const user = userEvent.setup()
    render(
      <Timeline initial={{ ...createVideoMotion(10), start: 2, end: 8, fadeIn: 1, fadeOut: 2 }} />,
    )
    for (const label of ['Start', 'End', 'Fade In', 'Fade Out']) {
      await user.click(screen.getByRole('button', { name: `Reset ${label}` }))
      expect(screen.queryByRole('button', { name: `Reset ${label}` })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('slider', { name: 'Start' })).toHaveValue('0')
    expect(screen.getByRole('slider', { name: 'End' })).toHaveValue('10')
    expect(screen.getByRole('slider', { name: 'Fade In' })).toHaveValue('0')
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveValue('0')
    fireEvent.change(screen.getByRole('slider', { name: 'Fade Out' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Fade In' }), { target: { value: '4' } })
    expect(screen.getByRole('slider', { name: 'Fade In' })).toHaveAttribute('max', '7')
    expect(screen.getByRole('slider', { name: 'Fade Out' })).toHaveAttribute('max', '6')
  })

  it('can update an existing keyframe at the cap, but must remove a frame before adding another', async () => {
    const user = userEvent.setup()
    const onKeyframe = vi.fn()
    const onSeek = vi.fn()
    const motion = {
      ...createVideoMotion(VIDEO_MOTION_LIMITS.keyframes),
      keyframes: Array.from({ length: VIDEO_MOTION_LIMITS.keyframes }, (_, time) => ({
        ...POSE,
        time,
      })),
    }
    const { rerender } = render(
      <Timeline initial={motion} duration={100} time={4} onKeyframe={onKeyframe} onSeek={onSeek} />,
    )
    await user.click(screen.getByRole('button', { name: 'Update Keyframe Here' }))
    expect(onKeyframe).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '4.000 s' }))
    expect(onSeek).toHaveBeenCalledWith(4)
    rerender(<Timeline initial={motion} duration={100} time={4.5} onKeyframe={onKeyframe} />)
    const add = screen.getByRole('button', { name: 'Add Keyframe Here' })
    expect(add).toBeDisabled()
    await user.click(add)
    expect(onKeyframe).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Remove Keyframe At 4.000 s' }))
    expect(screen.queryByRole('button', { name: '4.000 s' })).not.toBeInTheDocument()
    expect(add).toBeEnabled()
    await user.click(add)
    expect(onKeyframe).toHaveBeenCalledTimes(2)
  })
})
