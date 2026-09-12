import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PlacementPanel } from './placement-panel'
import { ShapePanel } from './shape-panel'
import { TextEffects } from './text-effects'
import {
  DEFAULT_SHAPE_SPEC,
  DEFAULT_TEXT_SPEC,
  type ShapeSpec,
  type TextSpec,
} from '../../../shared/watermark'

const shapeSpec = DEFAULT_SHAPE_SPEC
const textSpec = DEFAULT_TEXT_SPEC

describe('ShapePanel', () => {
  it('changes shape and edits proportions, fill and stroke', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(spec: ShapeSpec) => void>()
    const { rerender } = render(<ShapePanel spec={shapeSpec} onChange={onChange} />)
    expect(screen.queryByRole('combobox', { name: 'Shape' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Rectangle' })).toBeChecked()

    // From a rectangle, choosing another closed shape clamps the aspect.
    await user.click(screen.getByRole('radio', { name: 'Ellipse' }))
    expect(onChange.mock.calls.at(-1)?.[0].shape).toBe('ellipse')

    // A line resets to its own minimum length.
    await user.click(screen.getByRole('radio', { name: 'Line' }))
    expect(onChange.mock.calls.at(-1)?.[0].shape).toBe('line')

    fireEvent.change(screen.getByRole('slider', { name: 'Proportions' }), {
      target: { value: '3' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].aspect).toBe(3)

    await user.click(screen.getByRole('switch', { name: 'Fill the shape' }))
    expect(onChange.mock.calls.at(-1)?.[0].fill.enabled).toBe(true)

    // With fill on, the colour and opacity controls appear and edit the fill.
    rerender(
      <ShapePanel
        spec={{ ...shapeSpec, fill: { ...shapeSpec.fill, enabled: true } }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Fill colour'), { target: { value: '#123456' } })
    expect(onChange.mock.calls.at(-1)?.[0].fill.colour).toBe('#123456')
    fireEvent.change(screen.getByRole('slider', { name: 'Fill opacity' }), {
      target: { value: '0.75' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].fill.opacity).toBe(0.75)

    fireEvent.change(screen.getByRole('slider', { name: 'Stroke width' }), {
      target: { value: '0.05' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].stroke.width).toBe(0.05)

    await user.click(screen.getByRole('switch', { name: 'Custom stroke colour' }))
    expect(onChange.mock.calls.at(-1)?.[0].stroke.colour).toBe('#c86b82')

    // With a custom stroke colour set, its picker appears and edits the colour.
    rerender(
      <ShapePanel
        spec={{ ...shapeSpec, stroke: { ...shapeSpec.stroke, colour: '#ffffff' } }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Stroke colour'), { target: { value: '#abcdef' } })
    expect(onChange.mock.calls.at(-1)?.[0].stroke.colour).toBe('#abcdef')

    // A line spec renders the length control instead of proportions.
    rerender(<ShapePanel spec={{ ...shapeSpec, shape: 'line' }} onChange={onChange} />)
    expect(screen.getByRole('slider', { name: 'Length' })).toBeInTheDocument()
  })
})

describe('TextEffects', () => {
  it('adjusts spacing, curve and the effect', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(spec: TextSpec) => void>()
    const { rerender } = render(<TextEffects spec={textSpec} onChange={onChange} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Letter spacing' }), {
      target: { value: '0.2' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].letterSpacing).toBe(0.2)

    fireEvent.change(screen.getByRole('slider', { name: 'Curve' }), { target: { value: '-0.5' } })
    expect(onChange.mock.calls.at(-1)?.[0].curve).toBe(-0.5)

    await user.click(screen.getByRole('radio', { name: 'Emboss' }))
    expect(onChange.mock.calls.at(-1)?.[0].effect).toBe('emboss')

    // Positive values render the signed readout branch of the percent formatter.
    rerender(
      <TextEffects spec={{ ...textSpec, letterSpacing: 0.3, curve: 0.4 }} onChange={onChange} />,
    )
    expect(screen.getByText('+30%')).toBeInTheDocument()
  })
})

describe('PlacementPanel random', () => {
  it('offers a jitter slider in random mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <PlacementPanel placement={{ mode: 'smart' }} onChange={onChange} />,
    )
    await user.click(screen.getByRole('radio', { name: 'Random' }))
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'random', jitter: 0.08 })

    rerender(<PlacementPanel placement={{ mode: 'random', jitter: 0.08 }} onChange={onChange} />)
    expect(screen.getByRole('slider', { name: 'Jitter' })).toBeInTheDocument()
  })
})
