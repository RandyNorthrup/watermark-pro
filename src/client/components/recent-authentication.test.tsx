import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createAuthClient } from 'better-auth/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { RecentAuthenticationNotice } from './recent-authentication-notice'
import { apiRequest } from '../lib/api'
import { createAuthAccountHooks, withAuthAccountBoundary } from '../lib/auth-account'
import { captureOfflineOwner, setOfflineUser } from '../lib/offline-context'
import {
  dismissRecentAuthentication,
  recentAuthenticationAccount,
  requestRecentAuthentication,
} from '../lib/recent-authentication'

const OWNER = 'credential-prompt-owner'
beforeEach(() => {
  setOfflineUser(OWNER)
  dismissRecentAuthentication()
})
afterEach(() => {
  dismissRecentAuthentication()
  setOfflineUser(null)
  vi.unstubAllGlobals()
})

it('offers a bounded return path and dismisses without replaying the denied action', async () => {
  const user = userEvent.setup()
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ error: 'recent_authentication_required' }, { status: 403 })),
  )
  vi.stubGlobal('fetch', fetcher)
  render(<RecentAuthenticationNotice userId={OWNER} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => {
    await expect(apiRequest('/api/me/invitations', { method: 'POST' })).rejects.toThrow(
      'Sign in again',
    )
  })
  const dialog = await screen.findByRole('dialog', { name: 'Sign in again' })
  expect(dialog).toHaveTextContent('This sensitive change was not applied.')
  expect(dialog).toHaveTextContent('Save or export unfinished edits first.')
  const link = screen.getByRole('link', { name: 'Sign in again' })
  const target = new URL(link.getAttribute('href') ?? '', window.location.origin)
  expect(target.origin).toBe(window.location.origin)
  expect(target.pathname).toBe('/login')
  expect(target.searchParams.get('redirect')).toBe(window.location.pathname)
  await user.click(screen.getByRole('button', { name: 'Keep working' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(fetcher).toHaveBeenCalledOnce()
  expect(recentAuthenticationAccount()).toBeNull()
})

it('also presents the installed Better Auth plugin error without retrying', async () => {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json(
        {
          code: 'RECENT_AUTHENTICATION_REQUIRED',
          message: 'Sign in again',
        },
        { status: 403 },
      ),
    ),
  )
  const auth = withAuthAccountBoundary(
    createAuthClient({
      baseURL: `${window.location.origin}/api/auth`,
      fetchOptions: { customFetchImpl: fetcher, ...createAuthAccountHooks() },
    }),
  )
  render(<RecentAuthenticationNotice userId={OWNER} />)
  await act(async () => {
    const result = await auth.$fetch('/organization/create', { method: 'POST', body: {} })
    expect(result.error).not.toBeNull()
  })
  expect(await screen.findByRole('dialog', { name: 'Sign in again' })).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledOnce()
})

it('refuses a late old-account prompt and hides an already requested prompt after an account change', async () => {
  const owner = captureOfflineOwner()
  requestRecentAuthentication(owner)
  const { rerender } = render(<RecentAuthenticationNotice userId={OWNER} />)
  await screen.findByRole('dialog', { name: 'Sign in again' })
  setOfflineUser('other-account')
  rerender(<RecentAuthenticationNotice userId="other-account" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(() => requestRecentAuthentication(owner)).toThrow('account changed')
  setOfflineUser(null)
  setOfflineUser(OWNER)
  rerender(<RecentAuthenticationNotice userId={OWNER} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(recentAuthenticationAccount()).toBeNull()
})

it('keeps unrelated refusals out of the re-sign-in prompt', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 })),
    ),
  )
  render(<RecentAuthenticationNotice userId={OWNER} />)
  await expect(apiRequest('/api/me/invitations', { method: 'POST' })).rejects.toThrow('role')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(recentAuthenticationAccount()).toBeNull()
})
