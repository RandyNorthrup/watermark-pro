/** Pending local work stays visible until the server confirms it; conflicts require an explicit choice. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertDialog } from 'radix-ui'
import { useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { captureOfflineOwner } from '../lib/offline-context'
import {
  discardOfflineOperation,
  pendingOperations,
  updatePendingOperation,
} from '../lib/offline-database'
import type { PendingOperation } from '../lib/offline-model'
import { prepareWorkspaceOffline } from '../lib/offline-preparation'
import {
  applyOfflineUpdate,
  registerOfflineWorker,
  retryOfflineWorker,
} from '../lib/offline-registration'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'
import {
  installOfflineSync,
  refreshOfflineStatus,
  synchronizeOfflineWork,
} from '../lib/offline-sync'
import { savePresetLocally } from '../lib/offline-workspace'
import { Alert } from './ui/alert'
import { Button } from './ui/button'

/** Status is polite and controls wrap at narrow widths; no work blocks the main editing path. */
export function OfflinePanel({
  userId,
  organizationId,
  shouldManageSync = true,
}: {
  userId: string
  organizationId?: string | undefined
  /** The persistent sidebar owns synchronization; the phone sheet shares its state and controls. */
  shouldManageSync?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const preparation = useQuery({
    queryKey: ['offline-preparation', userId, organizationId],
    queryFn: async () => {
      if (organizationId !== undefined) {
        await prepareWorkspaceOffline(organizationId)
      }
      return true
    },
    enabled: organizationId !== undefined,
    networkMode: 'always',
    staleTime: Infinity,
    refetchOnReconnect: 'always',
  })
  const operations = useQuery({
    queryKey: ['offline-operations', userId],
    queryFn: () => pendingOperations(userId),
    networkMode: 'always',
  })
  useEffect(() => {
    if (!shouldManageSync) return
    if (document.querySelector('meta[name="offline-build"]') !== null) {
      void registerOfflineWorker()
    }
    return installOfflineSync(queryClient)
  }, [queryClient, userId, shouldManageSync])
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['offline-operations', userId] })
  }, [queryClient, userId, status.pending, status.blocked])

  const resolve = useMutation({
    networkMode: 'always',
    mutationFn: async ({
      operation,
      action,
    }: {
      operation: PendingOperation
      action: 'retry' | 'copy' | 'discard'
    }) => {
      const owner = captureOfflineOwner()
      if (operation.userId !== owner.userId) {
        throw new Error('This saved change belongs to a different account.')
      }
      if (action === 'retry') {
        await updatePendingOperation({ ...operation, state: 'pending', error: null })
      } else {
        const { change } = operation
        if (
          action === 'copy' &&
          (change.kind === 'preset-create' || change.kind === 'preset-update')
        ) {
          await savePresetLocally(operation.organizationId, {
            name: change.preset.name,
            spec: change.preset.spec,
          })
          owner.assertCurrent()
        }
        await discardOfflineOperation(operation.sequence)
      }
      owner.assertCurrent()
      await refreshOfflineStatus()
      void queryClient.invalidateQueries({ queryKey: ['organization', operation.organizationId] })
      await synchronizeOfflineWork(queryClient)
    },
  })

  function operationTitle(operation: PendingOperation): string {
    const { change } = operation
    if ('preset' in change) {
      return change.preset.name
    }
    if (change.kind === 'photo-upload') {
      return change.photo.name
    }
    if (change.kind === 'logo-upload') {
      return change.asset.name
    }
    return t('offline.deletion')
  }

  function statusMessage(): string {
    if (status.syncing) {
      return t('offline.syncing')
    }
    if (!status.isOnline) {
      return t('offline.disconnected')
    }
    if (status.pending > 0) {
      return t('offline.pending', { count: status.pending })
    }
    return t('offline.upToDate')
  }

  return (
    <section
      aria-label={t('offline.label')}
      className="min-w-0 rounded-xl border border-line bg-surface-raised/50 px-3 py-2 text-sm wrap-anywhere"
    >
      <div className="flex min-w-0 flex-col items-start gap-2">
        <div className="min-w-0">
          <p role="status">{statusMessage()}</p>
          <p className="mt-0.5 text-xs leading-4 text-ink-muted">
            {t(status.isReady && preparation.isSuccess ? 'offline.ready' : 'offline.preparing')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={status.syncing || !status.isOnline}
          onClick={() => {
            void synchronizeOfflineWork(queryClient)
            if (!status.isReady) {
              void retryOfflineWorker()
            }
            if (organizationId !== undefined && !preparation.isSuccess) {
              void preparation.refetch()
            }
          }}
        >
          {t('offline.syncNow')}
        </Button>
      </div>
      {preparation.error === null ? null : (
        <p className="mt-2 text-ink-muted">{preparation.error.message}</p>
      )}
      {status.hasUpdate ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p>{t('offline.updateAvailable')}</p>
          <Button variant="secondary" size="sm" onClick={applyOfflineUpdate}>
            {t('offline.reload')}
          </Button>
        </div>
      ) : null}
      {status.problem === null ? null : <p className="mt-2 text-ink-muted">{status.problem}</p>}
      {resolve.error === null ? null : <Alert tone="error">{resolve.error.message}</Alert>}
      {status.pending === 0 ? null : (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            {t('offline.review', { count: status.pending })}
          </summary>
          <ul className="flex flex-col gap-3">
            {operations.data?.map((operation) => (
              <li key={operation.id} className="rounded-md border border-line p-3">
                <p className="font-medium break-words">{operationTitle(operation)}</p>
                <p className="my-2 text-ink-muted">
                  {operation.state === 'conflict'
                    ? t('offline.conflict')
                    : (operation.error ?? t('offline.savedHere'))}
                </p>
                <div className="flex flex-wrap gap-2">
                  {operation.state === 'blocked' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ operation, action: 'retry' })}
                    >
                      {t('offline.retry')}
                    </Button>
                  ) : null}
                  {operation.state === 'conflict' && 'preset' in operation.change ? (
                    <Button
                      size="sm"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ operation, action: 'copy' })}
                    >
                      {t('offline.keepBoth')}
                    </Button>
                  ) : null}
                  <AlertDialog.Root>
                    <AlertDialog.Trigger asChild>
                      <Button variant="secondary" size="sm" disabled={resolve.isPending}>
                        {t('offline.discard')}
                      </Button>
                    </AlertDialog.Trigger>
                    <AlertDialog.Portal>
                      <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
                      <AlertDialog.Content className="fixed inset-x-4 top-1/3 z-50 mx-auto flex max-w-md flex-col gap-4 rounded-xl bg-surface-raised p-6 shadow-xl">
                        <AlertDialog.Title className="text-lg font-semibold">
                          {t('offline.discardTitle')}
                        </AlertDialog.Title>
                        <AlertDialog.Description>
                          {t('offline.discardBody')}
                        </AlertDialog.Description>
                        <div className="flex flex-wrap justify-end gap-2">
                          <AlertDialog.Cancel asChild>
                            <Button variant="secondary">{t('offline.cancel')}</Button>
                          </AlertDialog.Cancel>
                          <AlertDialog.Action asChild>
                            <Button
                              onClick={() => resolve.mutate({ operation, action: 'discard' })}
                            >
                              {t('offline.discard')}
                            </Button>
                          </AlertDialog.Action>
                        </div>
                      </AlertDialog.Content>
                    </AlertDialog.Portal>
                  </AlertDialog.Root>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
