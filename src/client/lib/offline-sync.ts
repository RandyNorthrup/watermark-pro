/** Replay durable saves while this app is open. Every operation is authenticated again by the server. */
import type { QueryClient } from '@tanstack/react-query'

import { ApiRequestError, fetchJson, sendNoContent } from './api'
import { authClient } from './auth-client'
import {
  captureOfflineOwner,
  currentOfflineUser,
  hasOfflineDatabase,
  offlineUserId,
} from './offline-context'
import { pendingOperations, updatePendingOperation } from './offline-database'
import type { OfflineChange, PendingOperation } from './offline-model'
import { updateOfflineStatus } from './offline-status'
import { assetDtoSchema, photoDeleteResponseSchema, photoDtoSchema } from '../../shared/api'
import { type WatermarkDto, watermarkDtoSchema } from '../../shared/api-watermark'
import { HTTP_STATUS } from '../../shared/constants'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'

const RETRY_DELAY_MS = 30_000
const LOCK_NAME = 'watermark-pro-offline-sync'
const syncState: { current: Promise<void> | null } = { current: null }
function isConnected(): boolean {
  return navigator.onLine
}

async function replay(
  operation: PendingOperation,
  assertCurrent: () => void,
): Promise<OfflineChange> {
  const root = `/api/orgs/${operation.organizationId}`
  const headers = { 'content-type': 'application/json', [SYNC_OPERATION_HEADER]: operation.id }
  const { change } = operation
  switch (change.kind) {
    case 'preset-create':
    case 'preset-update': {
      const isCreate = change.kind === 'preset-create'
      const path = isCreate ? `${root}/watermarks` : `${root}/watermarks/${change.preset.id}`
      const body =
        change.kind === 'preset-create'
          ? { name: change.preset.name, spec: change.preset.spec }
          : change.body
      const saved = await fetchJson(path, watermarkDtoSchema, {
        method: isCreate ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      assertCurrent()
      assertSavedEntity(saved, change.preset)
      await rebaseFollowingEdits(operation, change.preset, saved)
      return { ...change, preset: saved }
    }
    case 'preset-delete':
    case 'logo-delete': {
      const path =
        change.kind === 'preset-delete'
          ? `${root}/watermarks/${change.presetId}`
          : `${root}/assets/${change.assetId}`
      try {
        await sendNoContent(path, { method: 'DELETE', headers })
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== HTTP_STATUS.notFound) {
          throw error
        }
      }
      return change
    }
    case 'logo-upload': {
      const form = new FormData()
      form.append('file', change.blob, change.asset.name)
      form.append('name', change.asset.name)
      form.append('width', String(change.asset.width))
      form.append('height', String(change.asset.height))
      const asset = await fetchJson(`${root}/assets`, assetDtoSchema, {
        method: 'POST',
        headers: { [SYNC_OPERATION_HEADER]: operation.id },
        body: form,
      })
      assertCurrent()
      assertSavedEntity(asset, change.asset)
      return { ...change, asset }
    }
    case 'photo-upload': {
      const form = new FormData()
      form.append('file', change.blob, change.photo.name)
      form.append('thumbnail', change.thumbnail, 'thumbnail.jpg')
      form.append('name', change.photo.name)
      form.append('width', String(change.photo.width))
      form.append('height', String(change.photo.height))
      if (change.photo.presetId !== null) {
        form.append('presetId', change.photo.presetId)
      }
      const photo = await fetchJson(`${root}/photos`, photoDtoSchema, {
        method: 'POST',
        headers: { [SYNC_OPERATION_HEADER]: operation.id },
        body: form,
      })
      assertCurrent()
      assertSavedEntity(photo, change.photo)
      return { ...change, photo }
    }
    case 'photo-delete': {
      await fetchJson(`${root}/photos/delete`, photoDeleteResponseSchema, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: change.photoIds }),
      })
      return change
    }
  }
}

/** A syntactically valid response must still identify the same tenant and saved item. */
function assertSavedEntity(
  saved: { id: string; organizationId: string },
  expected: { id: string; organizationId: string },
): void {
  if (saved.id !== expected.id || saved.organizationId !== expected.organizationId) {
    throw new Error('The server acknowledged a different saved item. Local work was retained.')
  }
}

/** A later local edit is based on this local version, which now has a server timestamp. */
async function rebaseFollowingEdits(
  operation: PendingOperation,
  previous: WatermarkDto,
  saved: WatermarkDto,
): Promise<void> {
  const followingOperations = await pendingOperations(operation.userId)
  for (const following of followingOperations) {
    if (
      following.sequence <= operation.sequence ||
      following.organizationId !== operation.organizationId ||
      following.change.kind !== 'preset-update' ||
      following.change.preset.id !== saved.id ||
      following.change.body.expectedUpdatedAt !== previous.updatedAt
    ) {
      continue
    }
    await updatePendingOperation({
      ...following,
      change: {
        ...following.change,
        body: { ...following.change.body, expectedUpdatedAt: saved.updatedAt },
      },
    })
  }
}

/** Refresh the status even when offline, so restored work is visible before a network request. */
export async function refreshOfflineStatus(): Promise<number> {
  const owner = captureOfflineOwner()
  const operations = await pendingOperations(owner.userId)
  owner.assertCurrent()
  updateOfflineStatus({
    pending: operations.length,
    blocked: operations.filter((op) => op.state !== 'pending').length,
  })
  return operations.length
}

async function drain(queryClient: QueryClient): Promise<void> {
  const owner = captureOfflineOwner()
  const { userId } = owner
  const pendingCount = await refreshOfflineStatus()
  if (!isConnected()) {
    return
  }
  const session = await authClient.getSession()
  owner.assertCurrent()
  if (session.error !== null || session.data?.user.id !== userId) {
    updateOfflineStatus({ problem: 'Sign in with the same account to synchronize saved work.' })
    return
  }
  if (pendingCount === 0) return
  updateOfflineStatus({ syncing: true, problem: null })
  const blockedOrganizations = new Set<string>()
  let didSynchronize = false
  try {
    for (;;) {
      if (!isConnected() || offlineUserId() !== userId) {
        return
      }
      const operations = await pendingOperations(userId)
      owner.assertCurrent()
      for (const operation of operations) {
        if (operation.state !== 'pending') {
          blockedOrganizations.add(operation.organizationId)
        }
      }
      const next = operations.find(
        (operation) => !blockedOrganizations.has(operation.organizationId),
      )
      if (next === undefined) {
        return
      }
      try {
        const change = await replay(next, owner.assertCurrent)
        owner.assertCurrent()
        await updatePendingOperation({
          ...next,
          state: 'synced',
          error: null,
          change,
        })
        didSynchronize = true
        void queryClient.invalidateQueries({ queryKey: ['organization', next.organizationId] })
      } catch (error) {
        owner.assertCurrent()
        if (
          !(error instanceof ApiRequestError) ||
          error.status >= HTTP_STATUS.internalServerError ||
          error.status === HTTP_STATUS.tooManyRequests
        ) {
          updateOfflineStatus({
            problem:
              'Saved on this device. Synchronization will retry when the connection is available.',
          })
          return
        }
        await updatePendingOperation({
          ...next,
          state: error.status === HTTP_STATUS.conflict ? 'conflict' : 'blocked',
          error: error.message,
        })
        blockedOrganizations.add(next.organizationId)
      }
      await refreshOfflineStatus()
    }
  } finally {
    if (currentOfflineUser() === userId) {
      updateOfflineStatus({ syncing: false })
      await refreshOfflineStatus()
      if (didSynchronize && isConnected()) {
        void queryClient.invalidateQueries({ queryKey: ['organization'] })
        void queryClient.invalidateQueries({ queryKey: ['offline-preparation', userId] })
      }
    }
  }
}

/** One drain per app, and one per browser origin when Web Locks is supported. */
export async function synchronizeOfflineWork(queryClient: QueryClient): Promise<void> {
  updateOfflineStatus({ isOnline: navigator.onLine })
  if (!hasOfflineDatabase()) {
    return
  }
  const userId = currentOfflineUser()
  if (userId === null) {
    return
  }
  if (syncState.current !== null) {
    await syncState.current
    return
  }
  syncState.current = (async () => {
    try {
      if ('locks' in navigator) {
        await navigator.locks.request(LOCK_NAME, async () => {
          await drain(queryClient)
        })
      } else {
        await drain(queryClient)
      }
    } catch (error) {
      if (currentOfflineUser() === userId) {
        updateOfflineStatus({
          syncing: false,
          problem: error instanceof Error ? error.message : 'Synchronization could not start.',
        })
      }
    }
  })()
  try {
    await syncState.current
  } finally {
    syncState.current = null
  }
}

/** Reconnect/reopen works in every target browser; it does not rely on Background Sync support. */
export function installOfflineSync(queryClient: QueryClient): () => void {
  let isDisposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const trigger = () => {
    updateOfflineStatus({ isOnline: navigator.onLine })
    void synchronizeOfflineWork(queryClient)
  }
  async function tick(): Promise<void> {
    updateOfflineStatus({ isOnline: navigator.onLine })
    await synchronizeOfflineWork(queryClient)
    if (!isDisposed) {
      timer = setTimeout(() => {
        void tick()
      }, RETRY_DELAY_MS)
    }
  }
  window.addEventListener('online', trigger)
  window.addEventListener('offline', trigger)
  window.addEventListener('focus', trigger)
  window.addEventListener('watermark-pro:offline-change', trigger)
  void tick()
  return () => {
    isDisposed = true
    clearTimeout(timer)
    window.removeEventListener('online', trigger)
    window.removeEventListener('offline', trigger)
    window.removeEventListener('focus', trigger)
    window.removeEventListener('watermark-pro:offline-change', trigger)
  }
}
