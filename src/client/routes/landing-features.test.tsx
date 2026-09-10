import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})

describe('public product explanation', () => {
  it('explains concrete tools and free self-hosting without offering unrestricted signup', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Features for the whole job' })).toBeVisible()
    for (const name of [
      'Text, logos, and your own signature',
      'Watermark a whole batch',
      '551 unique font families',
      '400 colourful vector stickers',
      'Create and save QR watermarks',
      'Save your watermarks as templates',
      'Watermark videos',
      'Watermark PDF documents',
      'Work offline, sync later',
      'Your account, your workspace',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByText('Lumafoil is invitation-only. Want to self-host?')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Get the source code free on GitHub.' }),
    ).toHaveAttribute('href', 'https://github.com/RandyNorthrup/watermark-pro')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/RandyNorthrup/watermark-pro',
    )
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
    expect(screen.queryByText('Built to be trusted')).toBeNull()
    expect(
      screen.getByText(/Inviting someone does not give them access to your photos or presets/),
    ).toBeVisible()
  })
})
