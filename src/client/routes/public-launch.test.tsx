import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { seedOwnerWorkspace } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { installLibraryApi } from '../test-support/fake-library-api'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))
vi.mock('../components/turnstile', () => ({
  Turnstile: ({ onToken }: { onToken: (token: string) => void }) => (
    <button onClick={() => onToken('public-fixture-challenge')}>Solve public challenge</button>
  ),
}))

beforeEach(() => {
  installFakeAuth()
  installLibraryApi()
})

describe('public launch presentation', () => {
  it('keeps ordinary signup closed when server policy is absent', async () => {
    renderApp('/signup')
    expect(await screen.findByRole('heading', { name: 'Registration opens soon' })).toBeVisible()
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(fakeAuth().signUp.email).not.toHaveBeenCalled()
  })

  it('requires challenge and omits private bearer header for public signup', async () => {
    const api = installLibraryApi()
    api.publicConfig = {
      ...api.publicConfig,
      publicSignupEnabled: true,
      turnstileSiteKey: 'public-fixture-site',
    }
    const user = userEvent.setup()
    const { router } = renderApp('/signup')
    await user.type(await screen.findByLabelText('Name'), 'Public fixture')
    await user.type(screen.getByLabelText('Email'), 'public@example.test')
    await user.type(screen.getByLabelText('Password'), 'public signup fixture passphrase')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    expect(fakeAuth().signUp.email).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Solve public challenge' }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/check-email'))
    expect(fakeAuth().signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'public@example.test' }),
      { headers: { 'x-captcha-response': 'public-fixture-challenge' } },
    )
    expect(HUMAN_VERIFICATION.actions.admission).toBe('account_admission')
  })

  it.each(['public', 'pending', 'private'] as const)(
    'shows donation only for verified private cohort, current %s',
    async (cohort) => {
      const client = fakeAuth()
      seedOwnerWorkspace(client)
      if (client.state.user === null) throw new Error('Missing named owner fixture')
      client.state.user = { ...client.state.user, membershipCohort: cohort }
      renderApp('/app/account')
      await screen.findByRole('heading', { name: /Account settings/i })
      expect(screen.queryByRole('link', { name: /Donate with PayPal/ }) !== null).toBe(
        cohort === 'private',
      )
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      const navigation = await screen.findByRole('navigation', { name: 'Primary' })
      expect(within(navigation).queryByRole('link', { name: /Invite people/i }) !== null).toBe(
        cohort === 'private',
      )
    },
  )
})
