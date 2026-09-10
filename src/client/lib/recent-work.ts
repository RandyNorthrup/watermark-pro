/** Recent activity is separate from content timestamps and scoped to the signed-in account. */
import { queryOptions } from '@tanstack/react-query'

import { ApiRequestError, fetchJson, sendNoContent } from './api'
import { ACCOUNT_CHANGED_EVENT } from './offline-account'
import { cachedWorkspaceJson } from './offline-cache'
import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import {
  offlineOperations,
  offlineRecordKey,
  readOfflineRecord,
  updateOfflineRecord,
} from './offline-database'
import { mergeLocalPhotos, mergeLocalPresets } from './offline-workspace'
import {
  RECENT_WORK_CHANGED_EVENT,
  clearRecentWorkProblem,
  notifyRecentWork,
} from './recent-work-notifications'
import { HTTP_STATUS } from '../../shared/constants'
import {
  DEFAULT_RECENT_VIEW,
  RECENT_HISTORY_LIMIT,
  RECENT_WORK_LIMIT,
  localRecentActivitySchema,
  localRecentViewSchema,
  recentResourceKey,
  recentViewResponseSchema,
  recentWorkResponseSchema,
  type RecentActivity,
  type RecentResource,
  type RecentView,
  type RecentWorkItem,
} from '../../shared/recent-work'

const LOCAL_RECENT = 'recent-work'
const LOCAL_VIEW = 'recent-work-view'
const JSON_HEADERS = { 'content-type': 'application/json' }
const syncing = new Map<string, Promise<void>>()

/** Identity/key of one actual stored resource. */
export function recentItemIdentity(
  item: RecentWorkItem,
): Pick<RecentActivity, 'kind' | 'resourceId'> {
  return { kind: item.kind, resourceId: item.kind === 'photo' ? item.photo.id : item.preset.id }
}

function endpoint(organizationId: string) {
  return `/api/orgs/${organizationId}/recent-work`
}
function itemOrganization(item: RecentWorkItem) {
  return item.kind === 'photo' ? item.photo.organizationId : item.preset.organizationId
}

function scopedItems(organizationId: string, items: RecentWorkItem[]): RecentWorkItem[] {
  if (items.some((item) => itemOrganization(item) !== organizationId))
    throw new Error('Recent activity contains another workspace’s content.')
  return items
}

/** Stable ordering deduplicates mixed resources and refuses to move older replayed activity forward. */
export function mergeRecentItems(
  ...groups: readonly (readonly RecentWorkItem[])[]
): RecentWorkItem[] {
  const records = new Map<string, RecentWorkItem>()
  for (const item of groups.flat()) {
    const key = recentResourceKey(recentItemIdentity(item))
    const previous = records.get(key)
    if (previous === undefined || previous.usedAt <= item.usedAt) records.set(key, item)
  }
  return records
    .values()
    .toArray()
    .toSorted(
      (a, b) =>
        b.usedAt.localeCompare(a.usedAt) ||
        recentResourceKey(recentItemIdentity(a)).localeCompare(
          recentResourceKey(recentItemIdentity(b)),
        ),
    )
}

async function localItems(organizationId: string): Promise<RecentWorkItem[]> {
  if (!hasOfflineDatabase()) return []
  const owner = captureOfflineOwner()
  const record = await readOfflineRecord(
    offlineRecordKey(owner.userId, organizationId, LOCAL_RECENT),
  )
  owner.assertCurrent()
  if (record === null) return []
  if (record.userId !== owner.userId || record.organizationId !== organizationId)
    throw new Error('Recent activity belongs to another account.')
  return scopedItems(organizationId, localRecentActivitySchema.parse(record.value).items)
}

async function updateLocalItems(
  organizationId: string,
  update: (items: RecentWorkItem[]) => RecentWorkItem[],
): Promise<void> {
  const owner = captureOfflineOwner()
  const key = offlineRecordKey(owner.userId, organizationId, LOCAL_RECENT)
  await updateOfflineRecord(key, (record) => {
    owner.assertCurrent()
    if (
      record !== null &&
      (record.userId !== owner.userId || record.organizationId !== organizationId)
    )
      throw new Error('Recent activity scope mismatch')
    const items =
      record === null
        ? []
        : scopedItems(organizationId, localRecentActivitySchema.parse(record.value).items)
    return {
      key,
      userId: owner.userId,
      organizationId,
      value: localRecentActivitySchema.parse({
        items: update(items).slice(0, RECENT_HISTORY_LIMIT),
      }),
    }
  })
  owner.assertCurrent()
}

async function hasPendingCreate(organizationId: string, item: RecentWorkItem): Promise<boolean> {
  const owner = captureOfflineOwner()
  const operations = await offlineOperations(owner.userId)
  owner.assertCurrent()
  const id = recentItemIdentity(item).resourceId
  return operations.some(
    (operation) =>
      operation.organizationId === organizationId &&
      ((operation.change.kind === 'photo-upload' && operation.change.photo.id === id) ||
        (operation.change.kind === 'preset-create' && operation.change.preset.id === id)),
  )
}

async function replayRecent(organizationId: string): Promise<void> {
  const owner = captureOfflineOwner()
  const pendingItems = await localItems(organizationId)
  for (const item of pendingItems) {
    owner.assertCurrent()
    const identity = recentItemIdentity(item)
    try {
      await sendNoContent(endpoint(organizationId), {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...identity, usedAt: item.usedAt }),
      })
    } catch (error) {
      owner.assertCurrent()
      if (
        !(error instanceof ApiRequestError) ||
        error.status !== HTTP_STATUS.notFound ||
        (await hasPendingCreate(organizationId, item))
      )
        throw error
      // The resource was deleted, not an offline creation waiting to upload.
    }
    owner.assertCurrent()
    await updateLocalItems(organizationId, (items) =>
      items.filter(
        (candidate) =>
          recentResourceKey(recentItemIdentity(candidate)) !== recentResourceKey(identity) ||
          candidate.usedAt !== item.usedAt,
      ),
    )
  }
}

async function syncRecent(organizationId: string): Promise<void> {
  if (!hasOfflineDatabase() || !navigator.onLine) return
  const owner = captureOfflineOwner()
  const key = offlineRecordKey(owner.userId, organizationId, LOCAL_RECENT)
  const existing = syncing.get(key)
  if (existing !== undefined) {
    await existing
    owner.assertCurrent()
    return
  }
  const pending = replayRecent(organizationId)
  syncing.set(key, pending)
  try {
    await pending
    owner.assertCurrent()
  } finally {
    if (syncing.get(key) === pending) syncing.delete(key)
  }
}

/** Record only an explicit open/save action, using the actual gallery/library DTO already loaded by the UI. */
export async function recordRecentWork(
  organizationId: string,
  resource: RecentResource,
  usedAt = new Date().toISOString(),
): Promise<void> {
  const owner = captureOfflineOwner()
  const item: RecentWorkItem = { ...resource, usedAt }
  if (itemOrganization(item) !== organizationId)
    throw new Error('Cannot record another workspace’s content.')
  if (hasOfflineDatabase()) {
    await updateLocalItems(organizationId, (items) => mergeRecentItems(items, [item]))
    owner.assertCurrent()
    notifyRecentWork()
    if (navigator.onLine) await syncRecent(organizationId)
  } else {
    await sendNoContent(endpoint(organizationId), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ ...recentItemIdentity(item), usedAt: item.usedAt }),
    })
  }
  owner.assertCurrent()
  clearRecentWorkProblem(organizationId)
  notifyRecentWork()
}

/** Recheck server access online; offline uses only this account's validated snapshot and pending actions. */
export function recentWorkQueryOptions(organizationId: string) {
  const owner = captureOfflineOwner()
  return queryOptions({
    queryKey: ['user', owner.userId, 'organization', organizationId, 'recent-work'],
    networkMode: 'always',
    queryFn: async () => {
      owner.assertCurrent()
      const pending = await localItems(organizationId)
      try {
        await syncRecent(organizationId)
      } catch (error) {
        if (
          !(error instanceof TypeError) &&
          (!(error instanceof ApiRequestError) || error.status !== HTTP_STATUS.notFound)
        )
          throw error
      }
      let remote: { items: RecentWorkItem[] }
      try {
        remote = await cachedWorkspaceJson(
          organizationId,
          endpoint(organizationId),
          recentWorkResponseSchema,
        )
      } catch (error) {
        if (
          pending.length === 0 ||
          !(error instanceof Error) ||
          !(error instanceof TypeError || error.cause instanceof TypeError)
        )
          throw error
        remote = { items: [] }
      }
      owner.assertCurrent()
      const remaining = await localItems(organizationId)
      const operations = hasOfflineDatabase() ? await offlineOperations(owner.userId) : []
      owner.assertCurrent()
      let items = mergeRecentItems(scopedItems(organizationId, remote.items), remaining).filter(
        (item) =>
          operations.every(
            (operation) =>
              !(
                operation.organizationId === organizationId &&
                ((item.kind === 'photo' &&
                  operation.change.kind === 'photo-delete' &&
                  operation.change.photoIds.includes(item.photo.id)) ||
                  (item.kind === 'preset' &&
                    operation.change.kind === 'preset-delete' &&
                    operation.change.presetId === item.preset.id))
              ),
          ),
      )
      const resourceStates: Record<string, 'pending' | 'blocked' | 'conflict'> = {}
      if (hasOfflineDatabase()) {
        const presets = await mergeLocalPresets(
          organizationId,
          items.flatMap((item) => (item.kind === 'preset' ? [item.preset] : [])),
          true,
        )
        const photos = await mergeLocalPhotos(
          organizationId,
          items.flatMap((item) => (item.kind === 'photo' ? [item.photo] : [])),
          true,
        )
        owner.assertCurrent()
        items = items.map((item) =>
          item.kind === 'preset'
            ? {
                ...item,
                preset: presets.find((preset) => preset.id === item.preset.id) ?? item.preset,
              }
            : { ...item, photo: photos.find((photo) => photo.id === item.photo.id) ?? item.photo },
        )
        for (const operation of operations) {
          if (operation.organizationId !== organizationId || operation.state === 'synced') continue
          const change = operation.change
          if (change.kind === 'preset-create' || change.kind === 'preset-update')
            resourceStates[`preset:${change.preset.id}`] = operation.state
          else if (change.kind === 'photo-upload')
            resourceStates[`photo:${change.photo.id}`] = operation.state
        }
      }
      if (pending.length > 0 && remaining.length === 0) clearRecentWorkProblem(organizationId)
      return {
        items: items.slice(0, RECENT_WORK_LIMIT),
        pendingKeys: remaining.map((item) => recentResourceKey(recentItemIdentity(item))),
        resourceStates,
      }
    },
  })
}

async function localView() {
  if (!hasOfflineDatabase()) return null
  const owner = captureOfflineOwner()
  const record = await readOfflineRecord(offlineRecordKey(owner.userId, '', LOCAL_VIEW))
  owner.assertCurrent()
  if (record === null) return null
  if (record.userId !== owner.userId || record.organizationId !== '')
    throw new Error('Recent view preference scope mismatch')
  return localRecentViewSchema.parse(record.value)
}

async function storeView(
  view: RecentView,
  isPending: boolean,
  expected?: Awaited<ReturnType<typeof localView>>,
): Promise<RecentView> {
  const owner = captureOfflineOwner()
  const key = offlineRecordKey(owner.userId, '', LOCAL_VIEW)
  let selected = view
  await updateOfflineRecord(key, (record) => {
    owner.assertCurrent()
    if (record !== null) {
      if (record.userId !== owner.userId || record.organizationId !== '')
        throw new Error('Recent view preference scope mismatch')
      const previous = localRecentViewSchema.parse(record.value)
      // An older request may finish after a newer selection. Only acknowledge
      // the snapshot it actually sent, leaving the newer pending choice intact.
      if (
        expected !== undefined &&
        (previous.view !== expected?.view || previous.pending !== expected.pending)
      ) {
        selected = previous.view
        return record
      }
    }
    return { key, userId: owner.userId, organizationId: '', value: { view, pending: isPending } }
  })
  owner.assertCurrent()
  return selected
}

export async function changeRecentView(view: RecentView): Promise<void> {
  const owner = captureOfflineOwner()
  if (hasOfflineDatabase()) await storeView(view, true)
  owner.assertCurrent()
  if (navigator.onLine) {
    try {
      await fetchJson('/api/me/recent-view', recentViewResponseSchema, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ view }),
      })
    } catch (error) {
      owner.assertCurrent()
      if (!(error instanceof TypeError) || !hasOfflineDatabase()) throw error
      // A connected Wi-Fi adapter does not guarantee Internet access. The
      // durable local selection remains pending until a later request succeeds.
      notifyRecentWork()
      return
    }
    owner.assertCurrent()
    if (hasOfflineDatabase()) await storeView(view, false, { view, pending: true })
  } else if (!hasOfflineDatabase())
    throw new Error('Device storage is needed to remember this view offline.')
  notifyRecentWork()
}

export function recentViewQueryOptions() {
  const owner = captureOfflineOwner()
  return queryOptions({
    queryKey: ['user', owner.userId, 'recent-work-view'],
    networkMode: 'always',
    queryFn: async () => {
      owner.assertCurrent()
      const local = await localView()
      if (!navigator.onLine) return local?.view ?? DEFAULT_RECENT_VIEW
      if (local?.pending === true) {
        await changeRecentView(local.view)
        owner.assertCurrent()
        const latest = await localView()
        owner.assertCurrent()
        return latest?.view ?? local.view
      }
      try {
        const remote = await fetchJson('/api/me/recent-view', recentViewResponseSchema)
        owner.assertCurrent()
        return hasOfflineDatabase() ? await storeView(remote.view, false, local) : remote.view
      } catch (error) {
        owner.assertCurrent()
        if (local !== null && error instanceof TypeError) return local.view
        throw error
      }
    },
  })
}

/** Mounted dashboard observers refresh history/preferences after actual activity or reconnection. */
export function subscribeRecentWork(onChange: () => void): () => void {
  window.addEventListener(RECENT_WORK_CHANGED_EVENT, onChange)
  window.addEventListener('online', onChange)
  window.addEventListener(ACCOUNT_CHANGED_EVENT, clearRecentMemory)
  return () => {
    window.removeEventListener(RECENT_WORK_CHANGED_EVENT, onChange)
    window.removeEventListener('online', onChange)
    window.removeEventListener(ACCOUNT_CHANGED_EVENT, clearRecentMemory)
  }
}

function clearRecentMemory(): void {
  clearRecentWorkProblem()
  syncing.clear()
}
