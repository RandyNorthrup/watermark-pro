import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TokenMenu } from './token-menu'
import type { TextToken } from '../../../shared/watermark'

describe('TokenMenu', () => {
  it('opens and inserts the chosen token', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn<(token: TextToken) => void>()
    render(<TokenMenu onInsert={onInsert} />)

    await user.click(screen.getByRole('button', { name: /Insert detail/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Camera/ }))
    expect(onInsert).toHaveBeenCalledWith('{camera}')
  })

  it('preserves the insertion destination focus after menu cleanup and restores the trigger on Escape', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn(() => {
      // Exercise the fast-frame ordering seen in Chromium: insertion restores
      // focus before the menu's asynchronous unmount focus callback runs.
      queueMicrotask(() => screen.getByRole('textbox', { name: 'Token destination' }).focus())
    })
    render(
      <>
        <textarea aria-label="Token destination" />
        <TokenMenu onInsert={onInsert} />
      </>,
    )
    const trigger = screen.getByRole('button', { name: /Insert detail/ })
    await user.click(trigger)
    const selectedMenu = await screen.findByRole('menu')
    const selectedClosed = new Promise<void>((resolve) => {
      selectedMenu.addEventListener('focusScope.autoFocusOnUnmount', () => resolve(), {
        once: true,
      })
    })
    await user.click(screen.getByRole('menuitem', { name: /Camera/ }))
    await selectedClosed
    expect(onInsert).toHaveBeenCalledExactlyOnceWith('{camera}')
    expect(screen.getByRole('textbox', { name: 'Token destination' })).toHaveFocus()

    await user.click(trigger)
    const dismissedMenu = await screen.findByRole('menu')
    const dismissedClosed = new Promise<void>((resolve) => {
      dismissedMenu.addEventListener('focusScope.autoFocusOnUnmount', () => resolve(), {
        once: true,
      })
    })
    await user.keyboard('{Escape}')
    await dismissedClosed
    expect(trigger).toHaveFocus()
    expect(onInsert).toHaveBeenCalledTimes(1)
  })
})
