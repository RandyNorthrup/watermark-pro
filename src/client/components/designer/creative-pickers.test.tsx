import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontPicker } from './font-picker'
import { StickerPicker } from './sticker-picker'
import { setOfflineUser } from '../../lib/offline-context'

beforeEach(() => setOfflineUser('creative-picker-owner'))
afterEach(() => setOfflineUser(null))

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
    const fontPicker = screen.getByRole('combobox', { name: 'Font' })
    expect(fontPicker).toHaveAttribute('aria-expanded', 'false')
    await user.click(fontPicker)
    expect(fontPicker).toHaveAttribute('aria-expanded', 'true')
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'Lobster')
    expect(screen.queryByRole('option', { name: 'Inter Variable' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Bangers' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Lobster' }))
    expect(onFamilyChange).toHaveBeenLastCalledWith('Lobster', 400)
    expect(onFamilyChange).not.toHaveBeenCalledWith('Lobster', 600)
    expect(fontPicker).toHaveAttribute('aria-expanded', 'false')
    await user.click(fontPicker)
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
