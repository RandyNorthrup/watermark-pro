import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FontPicker } from './font-picker'
import { StickerPicker } from './sticker-picker'

describe('creative catalogue pickers', () => {
  it('searches fonts without losing selection and carries a supported weight atomically', async () => {
    const user = userEvent.setup()
    const onFamilyChange = vi.fn()
    render(
      <FontPicker
        family="Inter Variable"
        weight={600}
        onFamilyChange={onFamilyChange}
        onWeightChange={vi.fn()}
      />,
    )
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'Lobster')
    expect(screen.getByRole('option', { name: 'Inter Variable' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Bangers' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Font' }), 'Lobster')
    expect(onFamilyChange).toHaveBeenLastCalledWith('Lobster', 400)
    expect(onFamilyChange).not.toHaveBeenCalledWith('Lobster', 600)
    await user.clear(screen.getByRole('searchbox', { name: 'Search fonts' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'not-a-font')
    expect(screen.getByRole('status')).toHaveTextContent('0')
  })

  it('searches names and keywords, narrows categories, and exposes selected state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StickerPicker selected="camera" onChange={onChange} />)
    await user.type(screen.getByRole('searchbox', { name: 'Search stickers' }), 'camera')
    const camera = screen.getByRole('button', { name: 'Choose Camera' })
    expect(camera).toHaveAttribute('aria-pressed', 'true')
    await user.click(camera)
    expect(onChange).toHaveBeenCalledWith('camera')
    expect(screen.queryByRole('button', { name: 'Choose Cherries' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Food & Drink')
    expect(screen.getByRole('status')).toHaveTextContent('0 matching stickers')
    await user.clear(screen.getByRole('searchbox', { name: 'Search stickers' }))
    expect(screen.getByRole('status')).toHaveTextContent('50 matching stickers')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })
})
