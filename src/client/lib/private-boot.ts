/** Private services remain behind the authenticated route's lazy bootstrap module. */
import type { QueryClient } from '@tanstack/react-query'

import { retainInitialLaunch } from './launch-state'
import { installOfflineAccountBoundary } from './offline-account-boundary'
import { installQueryPersister } from './query-persister'

const runtime: { installation: { client: QueryClient; dispose: () => void } | undefined } = {
  installation: undefined,
}

/** Restore before admission, once per application client; public paths never install private services. */
export function installPrivateBoot(queryClient: QueryClient, pathname: string): void {
  if (!/^\/app(?:\/|$)/.test(pathname) || runtime.installation?.client === queryClient) return
  runtime.installation?.dispose()
  // OS capture can run while the private module downloads. Rebind only its
  // still-current unowned lease, just as if restoration had preceded capture.
  // The live admission below still cancels a different account's launch.
  const retainLaunch = retainInitialLaunch()
  const stopPersistence = installQueryPersister(queryClient)
  retainLaunch?.()
  const stopBoundary = installOfflineAccountBoundary(queryClient)
  runtime.installation = {
    client: queryClient,
    dispose: () => {
      stopPersistence?.()
      stopBoundary()
    },
  }
}
