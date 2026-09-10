/** Validated display snapshots accelerate repeat visits; session credentials are never persisted. */
import type { QueryClient } from '@tanstack/react-query'

import { setOfflineUser } from './offline-context'
import { MILLISECONDS_PER_SECOND } from '../../shared/constants'
import { shellCacheSchema } from '../../shared/shell-cache'

const STORAGE_KEY = 'watermark-pro:query-cache'
const PERSIST_DEBOUNCE_MS = MILLISECONDS_PER_SECOND
const SESSION_KEY = ['session'] as const
const ORGANIZATIONS_KEY = ['organizations'] as const
const ORGANIZATION_KEY = ['organization', 'active'] as const
const ROLE_KEY = ['organization', 'active', 'role'] as const
const PERSISTED_KEYS = [SESSION_KEY, ORGANIZATIONS_KEY, ORGANIZATION_KEY, ROLE_KEY]

/** Only four defined display queries may be persisted; arbitrary suffixes are rejected. */
export function isPersistedQuery(queryKey: readonly unknown[]): boolean {
  return PERSISTED_KEYS.some(
    (key) => key.length === queryKey.length && key.every((part, index) => queryKey[index] === part),
  )
}

/** Storage denial is handled inside the boundary, including access to localStorage itself. */
export function clearPersistedQueries(storage?: Storage): void {
  try {
    ;(storage ?? localStorage).removeItem(STORAGE_KEY)
  } catch {
    /* Online sign-out still succeeds when storage is denied. */
  }
}

/** Validated display data remains available during sustained outages; live identity gates all online admission. */
export function loadPersistedQueries(queryClient: QueryClient, storage: Storage): void {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) {
      return
    }
    const parsed = shellCacheSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.at > Date.now()) {
      clearPersistedQueries(storage)
      return
    }
    const saved = parsed.data
    queryClient.setQueryData(SESSION_KEY, saved.session, { updatedAt: 0 })
    setOfflineUser(saved.session.user.id)
    if (saved.organizations !== undefined) {
      queryClient.setQueryData(ORGANIZATIONS_KEY, saved.organizations, { updatedAt: 0 })
    }
    if (saved.organization !== undefined) {
      queryClient.setQueryData(ORGANIZATION_KEY, saved.organization, { updatedAt: 0 })
    }
    if (saved.role !== undefined) {
      queryClient.setQueryData(ROLE_KEY, saved.role, { updatedAt: 0 })
    }
  } catch {
    clearPersistedQueries(storage)
  }
}

/** The allowlist removes tokens, addresses, user-agents and unknown fields before serialization. */
export function persistQueries(queryClient: QueryClient, storage: Storage): void {
  try {
    const parsed = shellCacheSchema.safeParse({
      version: 2,
      at: Date.now(),
      session: queryClient.getQueryData(SESSION_KEY),
      organizations: queryClient.getQueryData(ORGANIZATIONS_KEY),
      organization: queryClient.getQueryData(ORGANIZATION_KEY),
      role: queryClient.getQueryData(ROLE_KEY),
    })
    if (!parsed.success) {
      clearPersistedQueries(storage)
      return
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed.data))
  } catch {
    /* Shell persistence is optional; durable saves report storage failures separately. */
  }
}

/** Restore once and persist updates. Removing the session clears the snapshot synchronously. */
export function installQueryPersister(queryClient: QueryClient, storage?: Storage): void {
  let target: Storage
  try {
    target = storage ?? localStorage
  } catch {
    return
  }
  loadPersistedQueries(queryClient, target)
  let timer: ReturnType<typeof setTimeout> | null = null
  queryClient.getQueryCache().subscribe((event) => {
    const key: unknown = event.query.queryKey
    if (!Array.isArray(key) || !isPersistedQuery(key)) {
      return
    }
    if (timer !== null) {
      clearTimeout(timer)
    }
    if (queryClient.getQueryData(SESSION_KEY) == null) {
      clearPersistedQueries(target)
      return
    }
    timer = setTimeout(() => {
      persistQueries(queryClient, target)
    }, PERSIST_DEBOUNCE_MS)
  })
}
