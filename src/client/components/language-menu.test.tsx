import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { LanguageMenu } from './language-menu'
import { SUPPORTED_LOCALES } from '../../shared/locales'
import { setLocale } from '../i18n'

afterEach(async () => {
  // Leave the shared instance back on English for any later test.
  await setLocale('en')
})

describe('LanguageMenu', () => {
  it('lists every language by its native name and applies the choice', async () => {
    const user = userEvent.setup()
    render(<LanguageMenu />)

    await user.click(screen.getByRole('button', { name: 'Change language' }))
    const menu = screen.getByRole('menu')
    for (const locale of SUPPORTED_LOCALES) {
      expect(within(menu).getByText(locale.name)).toBeInTheDocument()
    }

    await user.click(within(menu).getByText('العربية'))
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
    expect(document.documentElement.lang).toBe('ar')
  })
})
