import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FrameControls } from './frame-controls'
import type { Border } from '../../engine/pipeline'

describe('FrameControls', () => {
  it('turns the frame on and off and edits its width and colour', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(border: Border | null) => void>()
    const { rerender } = render(<FrameControls border={null} onChange={onChange} />)

    await user.click(screen.getByRole('switch', { name: 'Add a frame' }))
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ width: 0.03, colour: '#ffffff' })

    rerender(<FrameControls border={{ width: 0.03, colour: '#ffffff' }} onChange={onChange} />)
    expect(screen.getByRole('slider', { name: 'Frame width' })).toBeInTheDocument()
    expect(screen.getByLabelText('Frame colour')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Add a frame' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
