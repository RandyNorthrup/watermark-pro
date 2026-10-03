import { act, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type * as OfflineContext from '../lib/offline-context'
import { currentOfflineUser, setOfflineUser } from '../lib/offline-context'
import type * as OfflineDatabase from '../lib/offline-database'
import { offlineStatus, updateOfflineStatus } from '../lib/offline-status'
import { OWNER, seedOwnerWorkspace } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { installLibraryApi } from '../test-support/fake-library-api'
import { renderApp } from '../test-support/render-app'

const storage = vi.hoisted(() => ({
  available: false,
  clear: vi.fn<() => Promise<{ hasPendingWork: boolean }>>(),
  shared: vi.fn<() => Promise<void>>(),
  deleteUser: vi.fn<
    () => Promise<{
      data: { success: boolean; message: string }
      error: null
    }>
  >(),
}))
vi.mock('../lib/offline-context', async (importOriginal) => ({
  ...(await importOriginal<typeof OfflineContext>()),
  hasOfflineDatabase: () => storage.available,
}))
vi.mock('../lib/offline-database', async (importOriginal) => ({
  ...(await importOriginal<typeof OfflineDatabase>()),
  clearOfflineAccountData: storage.clear,
}))
vi.mock('../lib/shared-files', () => ({ clearSharedFiles: storage.shared }))
vi.mock('../lib/auth-client', async () => {
  const { authClient } = await import('../test-support/fake-auth-module')
  return {
    authClient: new Proxy(authClient, {
      get(target, key, receiver): unknown {
        const value: unknown = Reflect.get(target, key, receiver)
        return key === 'deleteUser' ? storage.deleteUser : value
      },
    }),
  }
})

beforeEach(() => {
  installFakeAuth()
  installLibraryApi()
  seedOwnerWorkspace(fakeAuth())
  storage.available = false
  storage.clear.mockReset().mockResolvedValue({ hasPendingWork: false })
  storage.shared.mockReset().mockResolvedValue(undefined)
  storage.deleteUser.mockReset().mockImplementation(() => {
    fakeAuth().state.user = null
    return Promise.resolve({ data: { success: true, message: 'User deleted' }, error: null })
  })
  setOfflineUser(null)
  updateOfflineStatus({ accountCleanup: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  updateOfflineStatus({ problem: null, accountCleanup: null })
  setOfflineUser(null)
})

it('keeps failed confirmed cleanup visible after account lock and login, and retries storage only', async () => {
  const user = userEvent.setup()
  const failure = Promise.withResolvers<{ hasPendingWork: boolean }>()
  storage.clear.mockReturnValueOnce(failure.promise)
  const { router, queryClient } = renderApp('/app/account')
  await screen.findByRole('heading', { level: 1, name: 'Account settings' })
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = screen.getByRole('alertdialog')
  await user.type(within(dialog).getByLabelText('Confirm your email'), OWNER.email)
  storage.available = true
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(storage.clear).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: /Retry device cleanup/ })).toBeDisabled()
    const { didEraseRemovedAccountData } = await import('../lib/offline-account')
    expect(await didEraseRemovedAccountData(queryClient)).toBe(false)
    expect(storage.clear).toHaveBeenCalledOnce()
    expect(currentOfflineUser()).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  } finally {
    await act(async () => {
      const rejected = expect(failure.promise).rejects.toThrow('Device cleanup failed')
      failure.reject(new Error('Device cleanup failed'))
      await rejected
    })
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('Device cleanup did not finish')
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(queryClient.getQueryData(['session'])).not.toMatchObject({ user: { id: OWNER.id } })
  await user.click(screen.getByRole('button', { name: 'Retry device cleanup' }))
  await waitFor(() => expect(storage.shared).toHaveBeenCalledExactlyOnceWith(OWNER.id))
  expect(storage.clear).toHaveBeenNthCalledWith(1, OWNER.id, 'erase-all')
  expect(storage.clear).toHaveBeenNthCalledWith(2, OWNER.id, 'erase-all')
  expect(storage.deleteUser).toHaveBeenCalledOnce()
  expect(screen.queryByText('Device cleanup did not finish', { exact: false })).toBeNull()
})

it('retains failed inbox cleanup for storage-only retry after offline rows were erased', async () => {
  const user = userEvent.setup()
  storage.available = true
  storage.shared.mockRejectedValueOnce(new Error('Shared inbox could not open'))
  const { didEraseRemovedAccountData } = await import('../lib/offline-account')
  const { queryClient } = renderApp('/login')
  updateOfflineStatus({
    accountCleanup: { userId: OWNER.id, pending: false, error: null },
  })
  await act(async () => {
    expect(await didEraseRemovedAccountData(queryClient)).toBe(false)
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Device cleanup did not finish')
  await user.click(screen.getByRole('button', { name: 'Retry device cleanup' }))
  await waitFor(() => expect(offlineStatus().accountCleanup).toBeNull())
  expect(storage.clear).toHaveBeenNthCalledWith(2, OWNER.id, 'erase-all')
  expect(storage.shared).toHaveBeenNthCalledWith(2, OWNER.id)
  expect(storage.deleteUser).not.toHaveBeenCalled()
})

it('does not erase device data without a confirmed deletion entry', async () => {
  const { didEraseRemovedAccountData } = await import('../lib/offline-account')
  const { queryClient } = renderApp('/login')
  expect(await didEraseRemovedAccountData(queryClient)).toBe(false)
  expect(storage.clear).not.toHaveBeenCalled()
  expect(storage.shared).not.toHaveBeenCalled()
  expect(storage.deleteUser).not.toHaveBeenCalled()
})

it('refuses cleanup while a different account is active without erasing its state', async () => {
  const user = userEvent.setup()
  const foreignUser = 'another-account'
  const { queryClient } = renderApp('/login')
  queryClient.setQueryData(['foreign-account-canary'], { userId: foreignUser })
  setOfflineUser(foreignUser)
  updateOfflineStatus({
    accountCleanup: { userId: OWNER.id, pending: false, error: 'Device cleanup failed' },
  })
  await user.click(await screen.findByRole('button', { name: 'Retry device cleanup' }))
  await waitFor(() => expect(offlineStatus().accountCleanup?.pending).toBe(false))
  expect(offlineStatus().accountCleanup?.error).toContain('account changed')
  expect(currentOfflineUser()).toBe(foreignUser)
  expect(queryClient.getQueryData(['foreign-account-canary'])).toEqual({ userId: foreignUser })
  expect(storage.clear).not.toHaveBeenCalled()
  expect(storage.shared).not.toHaveBeenCalled()
  expect(storage.deleteUser).not.toHaveBeenCalled()
})
