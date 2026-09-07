import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SampleScene } from './sample-scene'
import { SAMPLE_SCENE_PATH } from '../../shared/constants'

describe('SampleScene', () => {
  it('renders the image at its intrinsic size with a high fetch priority', () => {
    render(<SampleScene className="rounded" />)
    const image = screen.getByRole('img', { name: /sample scene/i })
    expect(image).toHaveAttribute('src', SAMPLE_SCENE_PATH)
    expect(image).toHaveAttribute('width', '960')
    expect(image).toHaveAttribute('height', '640')
    expect(image).toHaveAttribute('fetchpriority', 'high')
    expect(image).toHaveClass('rounded')
  })
})
