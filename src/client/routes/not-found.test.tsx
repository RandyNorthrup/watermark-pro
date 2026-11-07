import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})

describe('unknown addresses', () => {
  it('load the not-found page on demand with a way back to the start', async () => {
    renderApp('/no-such-page')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Page not found')
    expect(
      screen.getByText('The address may be mistyped, or the page may have moved.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
  })
})
