import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { loadAppContext } from './app-bootstrap'
import { takeLaunchFiles } from './launch-consumer'
import { receiveLaunchFiles } from './launch-files'
import { clearLaunchFiles } from './launch-state'
import { activateOfflineAccount, lockOfflineAccount } from './offline-account'
import { currentOfflineUser, setOfflineUser } from './offline-context'
import { installPrivateBoot } from './private-boot'
import { bootstrapFixture } from '../../shared/test-support/bootstrap-fixture'

vi.mock('./bootstrap-request', () => ({ fetchBootstrapSnapshot: vi.fn() }))
const clients: QueryClient[] = []

function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(queryClient)
  return queryClient
}

beforeEach(() => {
  setOfflineUser(null)
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const snapshot = bootstrapFixture()
  localStorage.setItem(
    'watermark-pro:query-cache',
    JSON.stringify({ version: 2, at: Date.now(), ...snapshot }),
  )
})
afterEach(() => {
  for (const queryClient of clients) queryClient.clear()
  clients.length = 0
  localStorage.clear()
  clearLaunchFiles()
  setOfflineUser(null)
  vi.restoreAllMocks()
})

it.each([
  '/login',
  '/signup',
  '/reset-password',
  '/check-email',
  '/share/token',
  '/application',
  '/app-other',
  '/APP',
])('does not restore private data or install observers for %s', (pathname) => {
  const storage = vi.spyOn(Storage.prototype, 'getItem')
  const observe = vi.spyOn(window, 'addEventListener')
  installPrivateBoot(client(), pathname)
  expect(storage).not.toHaveBeenCalled()
  expect(observe.mock.calls.some(([event]) => event === 'storage')).toBe(false)
  expect(currentOfflineUser()).toBeNull()
})

it('installs once when a public application client enters app and then changes private routes', async () => {
  const queryClient = client()
  installPrivateBoot(queryClient, '/login')
  expect(queryClient.getQueryData(['session'])).toBeUndefined()
  const observe = vi.spyOn(window, 'addEventListener')
  await loadAppContext(queryClient, '/app/')
  const storage = vi.spyOn(Storage.prototype, 'getItem')
  await loadAppContext(queryClient, '/app/editor')
  expect(storage.mock.calls.filter(([key]) => key === 'watermark-pro:query-cache')).toHaveLength(0)
  expect(observe.mock.calls.filter(([event]) => event === 'storage')).toHaveLength(1)
})

it('restores the validated offline owner before first private route admission', async () => {
  const queryClient = client()
  const result = await loadAppContext(queryClient, '/app/editor')
  expect(result.session.user.id).toBe('account-a')
  expect(result.isOffline).toBe(true)
  expect(currentOfflineUser()).toBe('account-a')
})

it('preserves a fresh OS capture through delayed restoration but rejects a different account', async () => {
  const queryClient = client()
  const read = Promise.withResolvers<File>()
  const navigate = vi.fn().mockResolvedValue(undefined)
  const launch = receiveLaunchFiles([{ getFile: () => read.promise }], navigate)
  await loadAppContext(queryClient, '/app/editor')
  read.resolve(new File(['photo'], 'same-owner.png'))
  await launch
  expect(takeLaunchFiles('/app/editor').map((file) => file.name)).toEqual(['same-owner.png'])

  const staleRead = Promise.withResolvers<File>()
  const staleNavigation = vi.fn().mockResolvedValue(undefined)
  const stale = receiveLaunchFiles([{ getFile: () => staleRead.promise }], staleNavigation)
  await activateOfflineAccount(queryClient, 'account-b')
  staleRead.resolve(new File(['private'], 'previous-owner.png'))
  await stale
  expect(staleNavigation).not.toHaveBeenCalled()
  expect(takeLaunchFiles('/app/editor')).toEqual([])
})

it('never revives an explicitly cancelled OS capture when the snapshot restores', async () => {
  const queryClient = client()
  const read = Promise.withResolvers<File>()
  const navigate = vi.fn().mockResolvedValue(undefined)
  const launch = receiveLaunchFiles([{ getFile: () => read.promise }], navigate)
  lockOfflineAccount(queryClient)
  // Model a valid existing snapshot becoming available after a storage read delay.
  localStorage.setItem(
    'watermark-pro:query-cache',
    JSON.stringify({ version: 2, at: Date.now(), ...bootstrapFixture() }),
  )
  await loadAppContext(queryClient, '/app/editor')
  read.resolve(new File(['cancelled'], 'cancelled.png'))
  await launch
  expect(navigate).not.toHaveBeenCalled()
  expect(takeLaunchFiles('/app/editor')).toEqual([])
})
