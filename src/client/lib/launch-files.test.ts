import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearLaunchFiles,
  launchTarget,
  receiveLaunchFiles,
  retainInitialLaunch,
  subscribeLaunchFiles,
  takeLaunchFiles,
} from './launch-files'
import {
  ACCOUNT_CHANGED_EVENT,
  activateOfflineAccount,
  lockOfflineAccount,
} from './offline-account'
import { currentOfflineUser, setOfflineUser } from './offline-context'

const ACCOUNT_A = 'launch-account-a'
const ACCOUNT_B = 'launch-account-b'
const client = new QueryClient()
const disposers: (() => void)[] = []

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

function handles(...names: string[]) {
  return names.map((name) => ({ getFile: () => Promise.resolve(imageFile(name)) }))
}

function delayedLaunch() {
  const read = Promise.withResolvers<File>()
  const navigate = vi.fn<Parameters<typeof receiveLaunchFiles>[1]>().mockResolvedValue(undefined)
  const result = receiveLaunchFiles([{ getFile: () => read.promise }], navigate)
  return { read, navigate, result }
}

function names(target: Parameters<typeof takeLaunchFiles>[0] = '/app/editor') {
  return takeLaunchFiles(target).map((file) => file.name)
}

function pauseAccountAdmission() {
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  vi.stubGlobal('navigator', {
    locks: {
      async request(_name: string, action: () => Promise<void>) {
        entered.resolve(undefined)
        await release.promise
        await action()
      },
    },
  })
  return { entered, release }
}

beforeEach(() => {
  clearLaunchFiles()
  setOfflineUser(null)
  client.clear()
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers.length = 0
  clearLaunchFiles()
  setOfflineUser(null)
  client.clear()
  vi.unstubAllGlobals()
})

describe('OS launch routing and delivery', () => {
  it.each([
    [0, '/app/editor'],
    [1, '/app/editor'],
    [2, '/app/bulk'],
    [9, '/app/bulk'],
  ])('routes %i images to %s', (count, target) => {
    expect(launchTarget(count)).toBe(target)
  })

  it('delivers a batch once, only to its intended destination', async () => {
    setOfflineUser(ACCOUNT_A)
    const navigate = vi.fn().mockResolvedValue(undefined)
    await receiveLaunchFiles(handles('one.png', 'two.png'), navigate)
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/app/bulk')
    expect(names()).toEqual([])
    expect(names('/app/bulk')).toEqual(['one.png', 'two.png'])
    expect(names('/app/bulk')).toEqual([])
  })

  it('does not let an empty OS event erase or navigate away from a legitimate launch', async () => {
    setOfflineUser(ACCOUNT_A)
    await receiveLaunchFiles(handles('keep.png'), vi.fn().mockResolvedValue(undefined))
    const navigate = vi.fn()
    await receiveLaunchFiles([], navigate)
    expect(names()).toEqual(['keep.png'])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('keeps the newest event when older handle reads finish last', async () => {
    setOfflineUser(ACCOUNT_A)
    const older = delayedLaunch()
    const newer = delayedLaunch()
    newer.read.resolve(imageFile('new.png'))
    await newer.result
    older.read.resolve(imageFile('old.png'))
    await older.result
    expect(names()).toEqual(['new.png'])
    expect(older.navigate).not.toHaveBeenCalled()
    expect(newer.navigate).toHaveBeenCalledExactlyOnceWith('/app/editor')
  })

  it('delivers initial and same-route launches to a mounted subscriber, then stops on disposal', async () => {
    setOfflineUser(ACCOUNT_A)
    const navigate = vi.fn().mockResolvedValue(undefined)
    await receiveLaunchFiles(handles('initial.png'), navigate)
    const consume = vi.fn<(files: File[]) => void>()
    const dispose = subscribeLaunchFiles('/app/editor', consume)
    disposers.push(dispose)
    await receiveLaunchFiles(handles('next.png'), navigate)
    expect(consume.mock.calls.map(([files]) => files.map((file) => file.name))).toEqual([
      ['initial.png'],
      ['next.png'],
    ])
    dispose()
    await receiveLaunchFiles(handles('later.png'), navigate)
    expect(consume).toHaveBeenCalledTimes(2)
    expect(names()).toEqual(['later.png'])
  })

  it('does not let an old mounted subscriber drain a new account launch', async () => {
    setOfflineUser(ACCOUNT_A)
    const consume = vi.fn()
    disposers.push(subscribeLaunchFiles('/app/editor', consume))
    await activateOfflineAccount(client, ACCOUNT_B)
    await receiveLaunchFiles(handles('private-b.png'), vi.fn().mockResolvedValue(undefined))
    expect(consume).not.toHaveBeenCalled()
    expect(names()).toEqual(['private-b.png'])
  })
})

describe('launch account admission', () => {
  it('rejects delayed A after A to B cleanup without replacing fresh B files', async () => {
    setOfflineUser(ACCOUNT_A)
    const stale = delayedLaunch()
    lockOfflineAccount(client)
    await activateOfflineAccount(client, ACCOUNT_B)
    await receiveLaunchFiles(handles('fresh-b.png'), vi.fn().mockResolvedValue(undefined))
    stale.read.resolve(imageFile('stale-a.png'))
    await stale.result
    expect(names()).toEqual(['fresh-b.png'])
    expect(stale.navigate).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'preserves fresh initial launch through authentication (read ready: %s)',
    async (isReady) => {
      const initial = delayedLaunch()
      if (isReady) {
        initial.read.resolve(imageFile('startup.png'))
        await initial.result
        expect(names()).toEqual([])
      }
      await activateOfflineAccount(client, ACCOUNT_A)
      if (!isReady) {
        initial.read.resolve(imageFile('startup.png'))
        await initial.result
      }
      expect(names()).toEqual(['startup.png'])
      expect(currentOfflineUser()).toBe(ACCOUNT_A)
    },
  )

  it('keeps a known-account launch during same-account session validation', async () => {
    setOfflineUser(ACCOUNT_A)
    const initial = delayedLaunch()
    await activateOfflineAccount(client, ACCOUNT_A)
    initial.read.resolve(imageFile('same-account.png'))
    await initial.result
    expect(names()).toEqual(['same-account.png'])
  })

  it.each([false, true])(
    'cancels explicit null relock before authentication (read ready: %s)',
    async (isReady) => {
      const stale = delayedLaunch()
      if (isReady) {
        stale.read.resolve(imageFile('cancelled.png'))
        await stale.result
      }
      lockOfflineAccount(client)
      await activateOfflineAccount(client, ACCOUNT_A)
      if (!isReady) {
        stale.read.resolve(imageFile('cancelled.png'))
        await stale.result
        expect(stale.navigate).not.toHaveBeenCalled()
      }
      expect(names()).toEqual([])
    },
  )

  it('rejects a null generation change that was not trusted account admission', async () => {
    const stale = delayedLaunch()
    setOfflineUser(null)
    stale.read.resolve(imageFile('untrusted.png'))
    await stale.result
    expect(stale.navigate).not.toHaveBeenCalled()
    expect(retainInitialLaunch()).toBeUndefined()
    expect(names()).toEqual([])
  })

  it('checks generation even when the known account returns to the same identity', async () => {
    setOfflineUser(ACCOUNT_A)
    const stale = delayedLaunch()
    setOfflineUser(null)
    setOfflineUser(ACCOUNT_A)
    stale.read.resolve(imageFile('previous-session.png'))
    await stale.result
    expect(stale.navigate).not.toHaveBeenCalled()
    expect(names()).toEqual([])
  })

  it('allows a genuinely new launch arriving while initial admission awaits storage', async () => {
    const gate = pauseAccountAdmission()
    const activation = activateOfflineAccount(client, ACCOUNT_A)
    await gate.entered.promise
    const initial = delayedLaunch()
    initial.read.resolve(imageFile('during-boot.png'))
    await initial.result
    expect(names()).toEqual([])
    gate.release.resolve(undefined)
    await activation
    expect(names()).toEqual(['during-boot.png'])
  })

  it('cancels interrupted initial admission without cancelling a later legitimate launch', async () => {
    const gate = pauseAccountAdmission()
    const stale = delayedLaunch()
    const activation = activateOfflineAccount(client, ACCOUNT_A)
    const rejected = expect(activation).rejects.toThrow('account changed')
    await gate.entered.promise
    lockOfflineAccount(client)
    const fresh = delayedLaunch()
    gate.release.resolve(undefined)
    await rejected
    await activateOfflineAccount(client, ACCOUNT_B)
    fresh.read.resolve(imageFile('fresh-b.png'))
    await fresh.result
    stale.read.resolve(imageFile('cancelled-a.png'))
    await stale.result
    expect(names()).toEqual(['fresh-b.png'])
    expect(stale.navigate).not.toHaveBeenCalled()
  })

  it('does not absorb a synchronous relock fired by reset observers', async () => {
    const initial = delayedLaunch()
    window.addEventListener(ACCOUNT_CHANGED_EVENT, () => lockOfflineAccount(client), { once: true })
    await expect(activateOfflineAccount(client, ACCOUNT_A)).rejects.toThrow('account changed')
    initial.read.resolve(imageFile('cancelled.png'))
    await initial.result
    expect(currentOfflineUser()).toBeNull()
    expect(initial.navigate).not.toHaveBeenCalled()
    expect(names()).toEqual([])
  })

  it('cannot revive a cancelled lease or overwrite a newer one through an old retention callback', async () => {
    const old = delayedLaunch()
    const retain = retainInitialLaunch()
    expect(retain).toBeTypeOf('function')
    lockOfflineAccount(client)
    await activateOfflineAccount(client, ACCOUNT_A)
    await receiveLaunchFiles(handles('fresh.png'), vi.fn().mockResolvedValue(undefined))
    retain?.()
    old.read.resolve(imageFile('old.png'))
    await old.result
    expect(names()).toEqual(['fresh.png'])
  })
})

describe('launch failures', () => {
  it('reports a current unreadable handle safely and publishes no partial batch', async () => {
    setOfflineUser(ACCOUNT_A)
    const navigate = vi.fn()
    const result = receiveLaunchFiles(
      [
        ...handles('readable.png'),
        { getFile: () => Promise.reject(new Error('private/path/customer.png')) },
      ],
      navigate,
    )
    await expect(result).rejects.toThrow('The files could not be opened. Open them again to retry.')
    expect(navigate).not.toHaveBeenCalled()
    expect(names('/app/bulk')).toEqual([])
  })

  it('ignores a stale read failure without clearing a new batch', async () => {
    setOfflineUser(ACCOUNT_A)
    const stale = delayedLaunch()
    await activateOfflineAccount(client, ACCOUNT_B)
    await receiveLaunchFiles(handles('fresh.png'), vi.fn().mockResolvedValue(undefined))
    stale.read.reject(new Error('old private filename'))
    await expect(stale.result).resolves.toBeUndefined()
    expect(names()).toEqual(['fresh.png'])
    expect(stale.navigate).not.toHaveBeenCalled()
  })

  it('reports a current navigation failure and clears its undeliverable files', async () => {
    setOfflineUser(ACCOUNT_A)
    await expect(
      receiveLaunchFiles(handles('photo.png'), () => Promise.reject(new Error('route failed'))),
    ).rejects.toThrow('The files could not be opened')
    expect(names()).toEqual([])
  })

  it('does not let a delayed old navigation denial clear a newer account launch', async () => {
    setOfflineUser(ACCOUNT_A)
    const navigation = Promise.withResolvers<undefined>()
    const entered = Promise.withResolvers<undefined>()
    const old = receiveLaunchFiles(handles('old.png'), () => {
      entered.resolve(undefined)
      return navigation.promise
    })
    await entered.promise
    await activateOfflineAccount(client, ACCOUNT_B)
    await receiveLaunchFiles(handles('fresh.png'), vi.fn().mockResolvedValue(undefined))
    navigation.reject(new Error('old denial'))
    await expect(old).resolves.toBeUndefined()
    expect(names()).toEqual(['fresh.png'])
  })
})
