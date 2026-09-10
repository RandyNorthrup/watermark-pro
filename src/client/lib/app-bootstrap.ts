/** Route-specific authenticated boot. Kept lazy so unrelated public routes do not load private workspace code. */
import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { ApiRequestError, isTransportFailure } from './api'
import { fetchBootstrapSnapshot } from './bootstrap-request'
import { describeError } from './errors'
import { OfflineAccessError } from './offline-access'
import { activateOfflineAccount, lockOfflineAccount } from './offline-account'
import {
  captureOfflineGeneration,
  captureOfflineOwner,
  currentOfflineUser,
} from './offline-context'
import { updateOfflineStatus } from './offline-status'
import { installPrivateBoot } from './private-boot'
import {
  activeOrganizationQueryOptions,
  organizationsQueryOptions,
  seedBootstrapQueries,
  sessionQueryOptions,
} from './queries'
import type { BootstrapSnapshot } from '../../shared/bootstrap'
import { HTTP_STATUS } from '../../shared/constants'
import type { ShellSession } from '../../shared/shell-cache'

function reportRefreshError(error: unknown): void {
  updateOfflineStatus({ problem: describeError(error) })
}

const ONLINE_ONLY_PATHS = [
  '/app/admin',
  '/app/account',
  '/app/invitations',
  '/app/members',
  '/app/audit',
  '/app/shares',
  '/app/organizations',
]

/** Validate the live account before any private cached workspace is admitted. */
export async function loadAppContext(queryClient: QueryClient, pathname: string) {
  installPrivateBoot(queryClient, pathname)
  const admission = captureOfflineGeneration()
  let hasNetwork = navigator.onLine
  const isOnlineOnly = ONLINE_ONLY_PATHS.some((path) => pathname.startsWith(path))
  if (!hasNetwork && isOnlineOnly) throw new OfflineAccessError('online-only')
  const cachedSession = queryClient.getQueryData(sessionQueryOptions.queryKey)
  const offlineOwner =
    cachedSession?.user.id === currentOfflineUser() ? captureOfflineOwner() : null
  let session = cachedSession
  let snapshot: BootstrapSnapshot | undefined
  if (hasNetwork) {
    try {
      snapshot = await fetchBootstrapSnapshot()
      admission.assertCurrent()
      session = snapshot.session
    } catch (error) {
      admission.assertCurrent()
      if (!isTransportFailure(error)) {
        if (
          error instanceof ApiRequestError &&
          (error.status === HTTP_STATUS.unauthorized || error.status === HTTP_STATUS.forbidden)
        ) {
          lockOfflineAccount(queryClient)
          if (error.status === HTTP_STATUS.unauthorized)
            throw redirect({ to: '/login', search: { redirect: pathname } })
        }
        throw error
      }
      hasNetwork = false
      if (isOnlineOnly) throw new OfflineAccessError('online-only')
      if (offlineOwner === null || cachedSession == null)
        throw new OfflineAccessError('not-prepared')
      offlineOwner.assertCurrent()
      session = cachedSession
      reportRefreshError(error)
    }
  }
  if (!hasNetwork) {
    if (offlineOwner === null || session == null) throw new OfflineAccessError('not-prepared')
    offlineOwner.assertCurrent()
  }
  admission.assertCurrent()
  if (session == null) {
    lockOfflineAccount(queryClient)
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }
  await activateOfflineAccount(queryClient, session.user.id)
  if (snapshot !== undefined) {
    seedBootstrapQueries(queryClient, snapshot)
    return {
      session: snapshot.session,
      organizations: snapshot.organizations,
      isOffline: false,
      selectionRequired: snapshot.selectionRequired,
    }
  }
  const owner = captureOfflineOwner()
  queryClient.setQueryData(sessionQueryOptions.queryKey, session)
  const cachedOrganizations = queryClient.getQueryData(organizationsQueryOptions.queryKey)
  if (cachedOrganizations === undefined || cachedOrganizations.length === 0)
    throw new OfflineAccessError('not-prepared')
  owner.assertCurrent()
  return { session, organizations: cachedOrganizations, isOffline: true, selectionRequired: false }
}

/** Resolve only the organization matching the admitted session. */
export async function loadAppOrganization(context: {
  queryClient: QueryClient
  session: ShellSession
  organizations: readonly { id: string }[]
  isOffline?: boolean
  selectionRequired?: boolean
}) {
  const owner = captureOfflineOwner()
  if (context.session.user.id !== owner.userId)
    throw new Error('The signed-in account changed before loading its workspace.')
  if (context.selectionRequired === true || context.organizations.length === 0) {
    return null
  }
  // Online bootstrap just validated this snapshot. Refetching here creates a
  // second request on the initial render; ordinary query freshness still applies.
  const cached = context.queryClient.getQueryData(activeOrganizationQueryOptions.queryKey)
  // A mounted layout can re-seed its old `initialData: null` after onboarding
  // clears the queries. That is not a usable workspace snapshot: returning it
  // freezes child route loader data at "Your workspace" even after refetch.
  if (cached?.id === context.session.session.activeOrganizationId) {
    return cached
  }
  if (context.isOffline === true) throw new OfflineAccessError('not-prepared')
  const organization = await context.queryClient.query({
    ...activeOrganizationQueryOptions,
    staleTime: 0,
  })
  owner.assertCurrent()
  if (organization?.id !== context.session.session.activeOrganizationId)
    throw new Error('The active workspace changed while loading.')
  return organization
}
