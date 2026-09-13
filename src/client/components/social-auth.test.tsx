import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SocialAuth } from './social-auth'
import { clearPendingInvitation, rememberInvitation } from '../lib/pending-invitation'
import { publicConfigQueryOptions } from '../lib/queries'
import { createQueryClient } from '../lib/query-client'
import { NO_CLOUD_CONFIG } from '../test-support/cloud-config'

const auth = vi.hoisted(() => ({ social: vi.fn(), linkSocial: vi.fn() }))
vi.mock('../lib/auth-client', () => ({
  authClient: { signIn: { social: auth.social }, linkSocial: auth.linkSocial },
}))

function show(mode: 'sign-in' | 'link' = 'sign-in', isEnabled = true, callbackURL?: string) {
  const queryClient = createQueryClient()
  queryClient.setQueryData(publicConfigQueryOptions.queryKey, {
    ...NO_CLOUD_CONFIG,
    googleAuthEnabled: isEnabled,
    microsoftAuthEnabled: isEnabled,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SocialAuth mode={mode} invitation="fixture-invitation" callbackURL={callbackURL} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  clearPendingInvitation()
  auth.social
    .mockReset()
    .mockResolvedValue({ data: { url: 'https://accounts.google.com/fixture' }, error: null })
  auth.linkSocial
    .mockReset()
    .mockResolvedValue({ data: { url: 'https://login.microsoftonline.com/fixture' }, error: null })
})

describe('account OAuth controls', () => {
  it.each(['Google', 'Microsoft'])(
    'returns %s sign-in to the requested workspace invitation',
    async (provider) => {
      show('sign-in', true, '/workspace-invitation/fixture-return-path')
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: `Continue with ${provider}` }))
      expect(auth.social).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: '/workspace-invitation/fixture-return-path',
          errorCallbackURL: '/login',
        }),
        expect.any(Object),
      )
    },
  )
  it.each([
    'https://outside.example/',
    '//outside.example/',
    String.raw`/\outside.example/`,
    '/\n/outside.example/',
  ])('refuses unsafe return path %j before starting OAuth', async (callbackURL) => {
    show('sign-in', true, callbackURL)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(auth.social).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeVisible()
  })
  it.each(['Google', 'Microsoft'])(
    'passes the invitation through a header for %s account signup',
    async (provider) => {
      const user = userEvent.setup()
      show()
      await user.click(screen.getByRole('button', { name: `Continue with ${provider}` }))
      expect(auth.social).toHaveBeenCalledWith(
        {
          provider: provider.toLowerCase(),
          callbackURL: '/app',
          errorCallbackURL: '/login',
          requestSignUp: true,
        },
        { headers: { 'x-lumafoil-invitation': 'fixture-invitation' } },
      )
      expect(auth.linkSocial).not.toHaveBeenCalled()
    },
  )
  it('links from authenticated settings without starting an account-admission flow', async () => {
    const user = userEvent.setup()
    show('link')
    await user.click(screen.getByRole('button', { name: 'Link Microsoft' }))
    expect(auth.linkSocial).toHaveBeenCalledWith({
      provider: 'microsoft',
      callbackURL: '/app/account',
      errorCallbackURL: '/app/account',
    })
    expect(auth.social).not.toHaveBeenCalled()
  })
  it('surfaces transport failures and restores controls', async () => {
    const user = userEvent.setup()
    auth.social.mockRejectedValueOnce(new Error('Provider connection failed'))
    show()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider connection failed')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })
  it('offers only providers that are configured', () => {
    show('sign-in', false)
    expect(screen.queryByRole('button')).toBeNull()
    expect(auth.social).not.toHaveBeenCalled()
  })
  it('reuses a prior failed-flow invitation without placing it in the error URL', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    queryClient.setQueryData(publicConfigQueryOptions.queryKey, {
      ...NO_CLOUD_CONFIG,
      googleAuthEnabled: true,
    })
    rememberInvitation('retained-invitation')
    render(
      <QueryClientProvider client={queryClient}>
        <SocialAuth />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(auth.social).toHaveBeenCalledWith(
      expect.objectContaining({ errorCallbackURL: '/login', requestSignUp: true }),
      { headers: { 'x-lumafoil-invitation': 'retained-invitation' } },
    )
  })
})
