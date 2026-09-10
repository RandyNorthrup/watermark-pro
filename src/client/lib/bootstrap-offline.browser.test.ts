/** Real IndexedDB admission keeps pending account A work safe during initial account B discovery. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { loadAppContext } from './app-bootstrap'
import { currentOfflineUser, setOfflineUser } from './offline-context'
import { clearOfflineDatabase, commitOfflineChange, pendingOperations } from './offline-database'
import { sessionQueryOptions } from './queries'
import { createQueryClient } from './query-client'
import { bootstrapFixture } from '../../shared/test-support/bootstrap-fixture'
import { OFFLINE_USER, offlineOperation, offlinePreset } from '../test-support/offline-fixtures'

beforeEach(async () => {
  await clearOfflineDatabase()
  localStorage.clear()
  setOfflineUser(null)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  setOfflineUser(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('rejects a discovered different account before seeding its shell and lets the original owner recover pending work', async () => {
  await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
  const client = createQueryClient()
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json(bootstrapFixture('different-account'))),
      ),
    )
    await expect(loadAppContext(client, '/app/editor')).rejects.toThrow('original account')
    expect(currentOfflineUser()).toBeNull()
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(bootstrapFixture(OFFLINE_USER)))),
    )
    const recovered = await loadAppContext(client, '/app/editor')
    expect(recovered.session.user.id).toBe(OFFLINE_USER)
    expect(currentOfflineUser()).toBe(OFFLINE_USER)
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
  } finally {
    client.clear()
  }
})
