import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { didEraseRemovedAccountData } from '../lib/offline-account'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'

/** A confirmed deletion's generic device notice survives private-route locking and navigation. */
export function AccountCleanupNotice() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { accountCleanup } = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  if (accountCleanup === null) return null
  return (
    <aside
      aria-label={t('accountRemoval.cleanupHeading')}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl bg-surface-raised shadow-card"
    >
      <Alert
        tone={accountCleanup.error === null ? 'info' : 'error'}
        title={t('accountRemoval.cleanupHeading')}
      >
        <p>
          {t(
            accountCleanup.pending
              ? 'accountRemoval.cleanupPending'
              : 'accountRemoval.cleanupFailed',
          )}
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          isPending={accountCleanup.pending}
          onClick={() => void didEraseRemovedAccountData(queryClient)}
        >
          {t('accountRemoval.cleanupRetry')}
        </Button>
      </Alert>
    </aside>
  )
}
