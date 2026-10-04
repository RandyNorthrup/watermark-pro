import { lazy, Suspense, useSyncExternalStore } from 'react'

import {
  recentAuthenticationAccount,
  subscribeRecentAuthentication,
} from '../lib/recent-authentication'

const CredentialDialog = lazy(async () => {
  const module = await import('./recent-authentication-dialog')
  return { default: module.RecentAuthenticationDialog }
})

/** Keeps the credential prompt out of the initial bundle and binds it to the rendered account. */
export function RecentAuthenticationNotice({ userId }: { userId: string }) {
  const requestedAccount = useSyncExternalStore(
    subscribeRecentAuthentication,
    recentAuthenticationAccount,
  )
  return requestedAccount === userId ? (
    <Suspense fallback={null}>
      <CredentialDialog />
    </Suspense>
  ) : null
}
