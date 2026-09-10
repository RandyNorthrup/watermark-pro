import { fireEvent, within } from '@testing-library/dom'
import { describe, expect, it, vi } from 'vitest'

import { showBootFailure } from './boot-failure'

describe('unavailable base language', () => {
  it('shows a readable alert and working retry control rather than untranslated application keys', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div>Old loading skeleton</div>'
    const retry = vi.fn()
    showBootFailure(root, retry)
    expect(within(root).getByRole('main')).toBeTruthy()
    expect(within(root).getByRole('alert')).toHaveTextContent('Reconnect')
    expect(within(root).queryByText('Old loading skeleton')).toBeNull()
    fireEvent.click(within(root).getByRole('button', { name: 'Reload' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
