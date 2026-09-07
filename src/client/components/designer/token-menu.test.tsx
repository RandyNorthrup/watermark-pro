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
})
