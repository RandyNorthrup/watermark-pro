import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))
// The real widget needs Cloudflare's script; the fake exposes a button that "solves" it.
vi.mock('../components/turnstile', () => ({
  Turnstile: ({
    siteKey,
    onToken,
  }: {
    siteKey: string
    onToken: (token: string | null) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        onToken(`token-for-${siteKey}`)
      }}
    >
      Solve bot check
    </button>
  ),
}))

const client = fakeAuth

function stubConfig(turnstileSiteKey: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ turnstileSiteKey }))),
  )
}

beforeEach(() => {
  installFakeAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bot protection', () => {
  it('holds sign-up until the challenge is solved and sends the token', async () => {
    const user = userEvent.setup()
    stubConfig('site-key')
    renderApp('/signup')
    const solve = await screen.findByRole('button', { name: 'Solve bot check' })
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    await user.type(screen.getByLabelText('Name'), 'New Person')
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'a much longer passphrase')
    await user.click(solve)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() =>
      expect(client().signUp.email).toHaveBeenCalledWith(expect.anything(), {
        headers: { 'x-captcha-response': 'token-for-site-key' },
      }),
    )
  })

  it('protects password reset requests the same way', async () => {
    const user = userEvent.setup()
    stubConfig('site-key')
    renderApp('/forgot-password')
    await screen.findByRole('button', { name: 'Solve bot check' })
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Solve bot check' }))
    await user.type(screen.getByLabelText('Email'), 'someone@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() =>
      expect(client().requestPasswordReset).toHaveBeenCalledWith(expect.anything(), {
        headers: { 'x-captcha-response': 'token-for-site-key' },
      }),
    )
  })

  it('shows no challenge when the deployment has no Turnstile keys', async () => {
    stubConfig(null)
    renderApp('/signup')
    await screen.findByLabelText('Name')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled(),
    )
    expect(screen.queryByRole('button', { name: 'Solve bot check' })).not.toBeInTheDocument()
  })
})
