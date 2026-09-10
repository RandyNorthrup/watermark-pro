/** Private cross-tab observation is installed before workspace admission. */
import type { QueryClient } from '@tanstack/react-query'

import { ACCOUNT_KEY, lockOfflineAccount } from './offline-account'
import { currentOfflineUser } from './offline-context'

/** Another tab's account change removes private state before returning to sign-in. */
export function installOfflineAccountBoundary(
  queryClient: QueryClient,
  onChange: () => void = () => window.location.replace('/login'),
): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key !== ACCOUNT_KEY || event.newValue === null) return
    const previous = currentOfflineUser()
    let userId: unknown
    try {
      const message: unknown = JSON.parse(event.newValue)
      userId =
        typeof message === 'object' && message !== null && 'userId' in message
          ? message.userId
          : undefined
    } catch {
      return
    }
    if (previous === userId || (typeof userId !== 'string' && userId !== null)) return
    lockOfflineAccount(queryClient)
    onChange()
  }
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}
