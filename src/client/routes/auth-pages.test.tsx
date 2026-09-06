import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeAuthClient, seedOwnerWorkspace } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

const client = fakeAuth

beforeEach(() => {
  installFakeAuth()
})

describe('landing page', () => {
  it('shows the product pitch to visitors', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/watermark/i)
    expect(screen.getByRole('link', { name: 'Create your workspace' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })

  it('sends signed-in users straight to the dashboard', async () => {
    seedOwnerWorkspace(client())
    const { router } = renderApp('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Acme Studio')
  })

  it('renders a not-found page for unknown paths', async () => {
    renderApp('/definitely-not-a-page')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Page not found')
  })
})

describe('sign in', () => {
  it('validates before calling the API', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(client().signIn.email).not.toHaveBeenCalled()
  })

  it('signs in and lands on the dashboard, honouring a redirect target', async () => {
    const user = userEvent.setup()
    client().state.organizations = seedOrganizationsWithoutSession()
    const { router } = renderApp('/login?redirect=/app/members')
    await user.type(await screen.findByLabelText('Email'), 'olivia@example.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/members'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Members')
  })

  it('explains an unverified email and offers to resend', async () => {
    const user = userEvent.setup()
    client().state.nextSignInError = { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'some password here')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Verify your email first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resend it' })).toHaveAttribute(
      'href',
      '/check-email?email=new%40example.test',
    )
  })

  it('shows other sign-in failures as an alert', async () => {
    const user = userEvent.setup()
    client().state.nextSignInError = {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    }
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'olivia@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong password here')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })
})

describe('sign up', () => {
  it('requires a strong password and then sends the user to check their inbox', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/signup')
    await user.type(await screen.findByLabelText('Name'), 'New Person')
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/Use at least 12 characters/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'a much longer passphrase')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/check-email'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Check your inbox')
    expect(client().signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.test', callbackURL: '/app' }),
      { headers: {} },
    )
  })

  it('surfaces a server rejection', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(await screen.findByLabelText('Name'), 'Dup')
    await user.type(screen.getByLabelText('Email'), 'dup@taken.test')
    await user.type(screen.getByLabelText('Password'), 'a much longer passphrase')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('User already exists')
  })
})

describe('check email', () => {
  it('resends the verification email on request', async () => {
    const user = userEvent.setup()
    renderApp('/check-email?email=new%40example.test')
    await user.click(await screen.findByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByRole('status')).toHaveTextContent('on its way')
    expect(client().sendVerificationEmail).toHaveBeenCalledWith({
      email: 'new@example.test',
      callbackURL: '/app',
    })
  })
})

describe('password reset', () => {
  it('confirms a reset request without revealing whether the account exists', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')
    await user.type(await screen.findByLabelText('Email'), 'whoever@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(client().requestPasswordReset).toHaveBeenCalledWith(
      { email: 'whoever@example.test', redirectTo: '/reset-password' },
      { headers: {} },
    )
  })

  it('rejects mismatched passwords and completes a valid reset', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/reset-password?token=fresh-token')
    await user.type(await screen.findByLabelText('New password'), 'a much longer passphrase')
    await user.type(screen.getByLabelText('Confirm password'), 'something else entirely')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'a much longer passphrase')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(client().resetPassword).toHaveBeenCalledWith({
      newPassword: 'a much longer passphrase',
      token: 'fresh-token',
    })
  })

  it('explains an unusable reset link', async () => {
    renderApp('/reset-password?error=INVALID_TOKEN')
    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is not valid')
  })
})

function seedOrganizationsWithoutSession() {
  const seeded = createFakeAuthClient()
  seedOwnerWorkspace(seeded)
  return seeded.state.organizations
}
