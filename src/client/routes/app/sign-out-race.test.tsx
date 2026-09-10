import { act, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import * as offlineAccount from '../../lib/offline-account'
import { OWNER, seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
beforeEach(() => {
  installFakeAuth()
})
afterEach(() => {
  vi.restoreAllMocks()
})

it('does not let delayed sign-out cleanup redirect a new verification flow back to login', async () => {
  const ui = userEvent.setup()
  seedOwnerWorkspace(fakeAuth())
  const cleanup = Promise.withResolvers<undefined>()
  const clearing = vi
    .spyOn(offlineAccount, 'clearOfflineAccount')
    .mockImplementation(async (queryClient) => {
      offlineAccount.lockOfflineAccount(queryClient)
      await cleanup.promise
    })
  const { router, queryClient } = renderApp('/app')
  await screen.findByRole('heading', { level: 1 })
  await ui.click(screen.getByRole('button', { name: `Account menu for ${OWNER.name}` }))
  await ui.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(clearing).toHaveBeenCalledWith(queryClient, OWNER.id)
  await act(async () => {
    await router.navigate({ to: '/check-email', search: { email: 'next@example.test' } })
  })
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Check your inbox')
  const navigation = vi.spyOn(router, 'navigate')
  await act(async () => {
    cleanup.resolve(undefined)
    await clearing.mock.results[0]?.value
  })
  expect(navigation).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/check-email')
})
