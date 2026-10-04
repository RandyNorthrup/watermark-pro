import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { installLibraryApi } from '../test-support/fake-library-api'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))
vi.mock('../components/turnstile', () => ({
  Turnstile: ({
    onToken,
    action = HUMAN_VERIFICATION.actions.admission,
  }: {
    onToken: (token: string | null) => void
    action?: string
  }) => (
    <button type="button" onClick={() => onToken(`fixture-${action}`)}>
      Solve human fixture
    </button>
  ),
}))

beforeEach(() => {
  installFakeAuth()
  const api = installLibraryApi()
  api.publicConfig.turnstileSiteKey = 'fixture-site-key'
  api.publicConfig.googleAuthEnabled = true
})

const email = 'human-fixture@example.test'
const cases = [
  {
    form: 'signup',
    route: '/signup?invitation=known-id',
    submit: 'Create account',
    action: HUMAN_VERIFICATION.actions.admission,
    fields: [
      ['Name', 'Human fixture'],
      ['Email', email],
      ['Password', 'human fixture passphrase'],
    ],
  },
  {
    form: 'signin',
    route: '/login',
    submit: 'Sign in',
    action: HUMAN_VERIFICATION.actions.admission,
    fields: [
      ['Email', email],
      ['Password', 'human fixture passphrase'],
    ],
  },
  {
    form: 'recovery',
    route: '/forgot-password',
    submit: 'Send reset link',
    action: HUMAN_VERIFICATION.actions.recovery,
    fields: [['Email', email]],
  },
  {
    form: 'resend',
    route: `/check-email?email=${encodeURIComponent(email)}`,
    submit: 'Resend verification email',
    action: HUMAN_VERIFICATION.actions.recovery,
    fields: [],
  },
] as const

describe('protected public forms', () => {
  it.each(cases)(
    'requires a fresh challenge for $form after a rejected request',
    async ({ form, route, submit, fields, action }) => {
      const client = fakeAuth()
      const requests = {
        signup: client.signUp.email,
        signin: client.signIn.email,
        recovery: client.requestPasswordReset,
        resend: client.sendVerificationEmail,
      }
      const request = requests[form]
      request.mockRejectedValueOnce(new TypeError('Fixture transport unavailable'))
      renderApp(route)
      const user = userEvent.setup()
      for (const [label, value] of fields)
        await user.type(await screen.findByLabelText(label), value)
      const button = await screen.findByRole('button', { name: submit })
      expect(button).toBeDisabled()
      await user.click(button)
      expect(request).not.toHaveBeenCalled()
      await user.click(await screen.findByRole('button', { name: 'Solve human fixture' }))
      await waitFor(() => expect(button).toBeEnabled())
      await user.click(button)
      expect(await screen.findByRole('alert')).toHaveTextContent('Fixture transport unavailable')
      expect(request).toHaveBeenCalledExactlyOnceWith(
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-captcha-response': `fixture-${action}` }),
        }),
      )
      expect(button).toBeDisabled()
      await user.click(button)
      expect(request).toHaveBeenCalledTimes(1)
      await user.click(screen.getByRole('button', { name: 'Solve human fixture' }))
      await waitFor(() => expect(button).toBeEnabled())
    },
  )

  it('shares signup verification with OAuth entry and discards it after provider failure', async () => {
    const client = fakeAuth()
    client.signIn.social.mockRejectedValueOnce(new TypeError('Fixture provider unavailable'))
    renderApp('/signup?invitation=known-id')
    const user = userEvent.setup()
    const provider = await screen.findByRole('button', { name: 'Continue with Google' })
    expect(provider).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Solve human fixture' })).toHaveLength(1)
    await user.click(provider)
    expect(client.signIn.social).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Solve human fixture' }))
    await user.click(provider)
    expect(await screen.findByRole('alert')).toHaveTextContent('Fixture provider unavailable')
    expect(client.signIn.social).toHaveBeenCalledWith(expect.any(Object), {
      headers: {
        'x-captcha-response': 'fixture-account_admission',
        'x-lumafoil-invitation': 'known-id',
      },
    })
    expect(provider).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })
})
