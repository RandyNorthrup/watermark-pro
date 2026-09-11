import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Dialog } from 'radix-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FontPicker } from './font-picker'
import { previewFont } from '../../fonts/preview'
import { setOfflineUser } from '../../lib/offline-context'

vi.mock('../../fonts/preview', () => ({ previewFont: vi.fn().mockResolvedValue(true) }))

beforeEach(() => {
  localStorage.clear()
  setOfflineUser('font-owner-a')
  vi.mocked(previewFont).mockClear()
})
afterEach(() => {
  localStorage.clear()
  setOfflineUser(null)
  vi.restoreAllMocks()
})

describe('font dropdown previews and recent choices', () => {
  it('previews the selected name and options in their own families without eager option downloads', async () => {
    const user = userEvent.setup()
    render(<FontPicker family="Inter Variable" onFamilyChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox', { name: 'Font' })
    expect(within(trigger).getByText('Inter Variable')).toHaveStyle({
      fontFamily: '"Inter Variable"',
    })
    await waitFor(() => expect(previewFont).toHaveBeenCalledTimes(1))
    await user.click(trigger)
    expect(screen.getByText('All Fonts')).toBeVisible()
    const lobster = screen.getByRole('option', { name: 'Lobster' })
    expect(within(lobster).getByText('Lobster')).toHaveStyle({ fontFamily: '"Lobster"' })
    expect(previewFont).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('persists recent choices for the same account, keeping another account separate', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const first = render(
      <FontPicker family="Inter Variable" weight={600} onFamilyChange={change} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Font' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'Lobster')
    await user.click(screen.getByRole('option', { name: 'Lobster' }))
    expect(change).toHaveBeenCalledWith('Lobster', 400)
    first.unmount()
    const second = render(<FontPicker family="Lobster" onFamilyChange={change} />)
    await user.click(screen.getByRole('combobox', { name: 'Font' }))
    expect(
      within(screen.getByRole('group', { name: 'Recently used' })).getByRole('option', {
        name: 'Lobster',
      }),
    ).toBeVisible()
    second.unmount()
    setOfflineUser('font-owner-b')
    render(<FontPicker family="Inter Variable" onFamilyChange={change} />)
    await user.click(screen.getByRole('combobox', { name: 'Font' }))
    expect(screen.queryByRole('group', { name: 'Recently used' })).not.toBeInTheDocument()
  })

  it('supports listbox arrow navigation, selection and returning focus to the trigger', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<FontPicker family="Inter Variable" onFamilyChange={change} />)
    const trigger = screen.getByRole('combobox', { name: 'Font' })
    await user.click(trigger)
    const search = screen.getByRole('searchbox', { name: 'Search fonts' })
    await user.type(search, 'Lobster')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Lobster' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(change).toHaveBeenCalledWith('Lobster', 400)
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps one clipped scrolling viewport inside an enclosing modal', async () => {
    const user = userEvent.setup()
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Content>
            <Dialog.Title>Designer</Dialog.Title>
            <Dialog.Description>Choose a watermark font.</Dialog.Description>
            <FontPicker family="Inter Variable" onFamilyChange={vi.fn()} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Designer' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Font' }))
    const list = screen.getByRole('listbox', { name: 'Font' })
    expect(dialog).toContainElement(list)
    expect(list).toHaveClass(
      'overflow-x-hidden',
      'overflow-y-auto',
      'overscroll-contain',
      'touch-pan-y',
    )
    expect(list.parentElement).toHaveClass('overflow-hidden')
    expect(screen.getByText('All Fonts')).toHaveClass('sticky', 'bg-surface-raised', 'z-20')
    fireEvent.wheel(list, { deltaY: 120 })
    expect(screen.getByRole('listbox', { name: 'Font' })).toBeVisible()
  })

  it('does not let an old account menu choice write into the new account', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<FontPicker family="Inter Variable" onFamilyChange={change} />)
    await user.click(screen.getByRole('combobox', { name: 'Font' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'Lobster')
    act(() => setOfflineUser('font-owner-b'))
    await user.click(screen.getByRole('option', { name: 'Lobster' }))
    expect(change).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})
