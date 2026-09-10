import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const loader = { ready: Promise.withResolvers<undefined>(), calls: 0 }

beforeEach(() => {
  vi.resetModules()
  loader.ready = Promise.withResolvers<undefined>()
  loader.calls = 0
  vi.doMock('./launch-consumer', async () => {
    loader.calls += 1
    await loader.ready.promise
    return await vi.importActual('./launch-consumer')
  })
})
afterEach(() => {
  loader.ready.resolve(undefined)
  vi.doUnmock('./launch-consumer')
})

it.each(['admit', 'switch', 'relock'] as const)(
  'captures the launch before deferred delivery code loads (%s)',
  async (transition) => {
    const state = await import('./launch-files')
    const context = await import('./offline-context')
    const account = await import('./offline-account')
    const client = new QueryClient()
    context.setOfflineUser(transition === 'admit' ? null : 'account-a')
    const getFile = vi.fn(() => Promise.resolve(new File(['photo'], 'launch.png')))
    const navigate = vi.fn().mockResolvedValue(undefined)
    const pending = state.receiveLaunchFiles([{ getFile }], navigate)
    try {
      expect(getFile).toHaveBeenCalledOnce()
      await vi.waitFor(() => expect(loader.calls).toBe(1))
      expect(navigate).not.toHaveBeenCalled()
      if (transition === 'relock') account.lockOfflineAccount(client)
      else
        await account.activateOfflineAccount(
          client,
          transition === 'admit' ? 'account-a' : 'account-b',
        )
      loader.ready.resolve(undefined)
      await pending
      const consumer = await import('./launch-consumer')
      if (transition === 'admit') {
        expect(navigate).toHaveBeenCalledExactlyOnceWith('/app/editor')
        expect(consumer.takeLaunchFiles('/app/editor').map((file) => file.name)).toEqual([
          'launch.png',
        ])
      } else {
        expect(navigate).not.toHaveBeenCalled()
        expect(consumer.takeLaunchFiles('/app/editor')).toEqual([])
      }
    } finally {
      loader.ready.resolve(undefined)
      await pending
      state.clearLaunchFiles()
      context.setOfflineUser(null)
      client.clear()
    }
  },
)
