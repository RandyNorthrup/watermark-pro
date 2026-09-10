/** Account transitions invalidate private in-memory state before another identity can use it. */
import type { QueryClient } from '@tanstack/react-query'

import { clearLaunchFiles, retainInitialLaunch } from './launch-files'
import { currentOfflineUser, hasOfflineDatabase, setOfflineUser } from './offline-context'
import { updateOfflineStatus } from './offline-status'
import { clearPersistedQueries } from './persisted-shell-storage'
import { clearSharedFiles } from './shared-files'

export const ACCOUNT_KEY = 'lumafoil:active-account'
export const ACCOUNT_CHANGED_EVENT = 'lumafoil:account-changed'
const boundary = { generation: 0 }
const ACCOUNT_TRANSITION_LOCK = 'lumafoil-account-transition'
const transitions = { pending: Promise.resolve() }

/** Queue locally and across supporting tabs so old cleanup cannot erase a new login's saves. */
function accountTransition(action: () => Promise<void>): Promise<void> {
  const previous = transitions.pending
  const result = (async () => {
    try {
      await previous
    } catch {
      // The previous caller received its error; the next transition must still run.
    }
    if ('locks' in navigator) await navigator.locks.request(ACCOUNT_TRANSITION_LOCK, action)
    else await action()
  })()
  transitions.pending = result
  return result
}

function announceAccount(userId: string | null): void {
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId, nonce: crypto.randomUUID() }))
  } catch {
    // A storage-denied browser still checks the live session on focus and before replay.
  }
}

function resetAccountState(queryClient: QueryClient, retainLaunch?: () => void): number {
  boundary.generation += 1
  const generation = boundary.generation
  if (retainLaunch === undefined) clearLaunchFiles()
  setOfflineUser(null)
  retainLaunch?.()
  clearPersistedQueries()
  queryClient.clear()
  updateOfflineStatus({ pending: 0, blocked: 0, syncing: false, problem: null })
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
  return generation
}

/** Expiry hides private state immediately while keeping unsynchronized work for its owner. */
export function lockOfflineAccount(queryClient: QueryClient): void {
  resetAccountState(queryClient)
}

/** A switch cannot silently discard unsynchronized work or expose it to the new account. */
export async function activateOfflineAccount(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  const previous = currentOfflineUser()
  const generation =
    previous === userId
      ? boundary.generation
      : resetAccountState(queryClient, previous === null ? retainInitialLaunch() : undefined)
  function assertTransition() {
    if (generation !== boundary.generation)
      throw new Error('The account changed while opening device storage. Sign in again.')
  }
  await accountTransition(async () => {
    assertTransition()
    if (hasOfflineDatabase()) {
      try {
        const { clearOtherOfflineAccounts, rememberOfflineAccount } =
          await import('./offline-database')
        assertTransition()
        if (previous !== userId) await clearOtherOfflineAccounts(userId)
        assertTransition()
        await rememberOfflineAccount(userId)
      } catch (error) {
        throw new Error(
          'Device storage could not switch accounts. If work is waiting to sync, sign in with its original account first.',
          { cause: error },
        )
      }
    }
    assertTransition()
    const retainLaunch = retainInitialLaunch()
    setOfflineUser(userId)
    retainLaunch?.()
    if (previous !== userId) announceAccount(userId)
  })
}

/** Call after server sign-out succeeds and after the UI has checked for pending work. */
export async function clearOfflineAccount(queryClient: QueryClient, userId: string): Promise<void> {
  const active = currentOfflineUser()
  if (active !== null && active !== userId)
    throw new Error('The signed-in account changed before sign-out cleanup.')
  lockOfflineAccount(queryClient)
  announceAccount(null)
  await accountTransition(async () => {
    if (!hasOfflineDatabase()) {
      return
    }

    const { clearOfflineAccountData } = await import('./offline-database')
    const { hasPendingWork } = await clearOfflineAccountData(userId)
    if (hasPendingWork && currentOfflineUser() === null)
      updateOfflineStatus({
        problem:
          'A new save arrived while signing out. Sign in with its original account to finish syncing.',
      })
    await clearSharedFiles(userId)
  })
}
