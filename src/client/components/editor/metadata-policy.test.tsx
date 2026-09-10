import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MetadataPolicyField } from './metadata-policy'
import { effectivePolicy, type MetadataPolicy } from '../../engine/encode'

describe('effectivePolicy', () => {
  it('keeps the choice for capable formats and strips for WebP', () => {
    expect(effectivePolicy('keep', 'image/jpeg')).toBe('keep')
    expect(effectivePolicy('keep-except-location', 'image/png')).toBe('keep-except-location')
    expect(effectivePolicy('keep', 'image/webp')).toBe('strip')
  })
})

describe('MetadataPolicyField', () => {
  it('offers three choices and reports the selected one', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(policy: MetadataPolicy) => void>()
    render(<MetadataPolicyField policy="strip" format="image/jpeg" onChange={onChange} />)

    expect(screen.getByRole('radio', { name: /Strip/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Keep everything/ }))
    expect(onChange).toHaveBeenLastCalledWith('keep')
  })

  it('disables the keep modes for WebP and shows the note', () => {
    render(<MetadataPolicyField policy="keep" format="image/webp" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /Strip/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Keep except location/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Keep everything/ })).toBeDisabled()
    expect(
      screen.getByText(
        'WebP removes original photo metadata. Required artwork licence notices remain.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('WebP exports are always stripped.')).not.toBeInTheDocument()
  })
})
