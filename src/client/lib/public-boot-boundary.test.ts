import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'

vi.mock('./query-persister', () => {
  throw new Error('Public account operations loaded private snapshot persistence.')
})
vi.mock('./offline-account-boundary', () => {
  throw new Error('Public account operations loaded private cross-tab observation.')
})

it('keeps public account activation independent of private installers while clearing stale snapshots', async () => {
  const { activateOfflineAccount, lockOfflineAccount } = await import('./offline-account')
  const { currentOfflineUser, setOfflineUser } = await import('./offline-context')
  const client = new QueryClient()
  localStorage.setItem('watermark-pro:query-cache', 'stale snapshot')
  try {
    await activateOfflineAccount(client, 'signed-in-account')
    expect(currentOfflineUser()).toBe('signed-in-account')
    expect(localStorage.getItem('watermark-pro:query-cache')).toBeNull()
    lockOfflineAccount(client)
    expect(currentOfflineUser()).toBeNull()
  } finally {
    client.clear()
    setOfflineUser(null)
    localStorage.clear()
  }
})
