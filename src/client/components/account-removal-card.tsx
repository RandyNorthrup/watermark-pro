import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertDialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Field } from './ui/field'
import { Input } from './ui/input'
import { AUTH_ACCOUNT_REMOVAL_CONFIRMED } from '../../shared/constants'
import { ApiRequestError } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { describeError } from '../lib/errors'
import { didEraseRemovedAccountData } from '../lib/offline-account'
import { captureOfflineOwner } from '../lib/offline-context'
import { updateOfflineStatus } from '../lib/offline-status'

/** Self removal uses the existing account-bound API; confirmation grants no server authority. */
export function AccountRemovalCard({
  userId,
  email,
  isProtectedOwner,
  onRemoved,
}: {
  userId: string
  email: string
  isProtectedOwner: boolean
  onRemoved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const removal = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const owner = captureOfflineOwner()
      owner.assertCurrent()
      if (isProtectedOwner || confirmation !== email || owner.userId !== userId)
        throw new Error(t('accountRemoval.confirmHint'))
      const result = await authClient.deleteUser({})
      owner.assertCurrent()
      if (result.error !== null)
        throw new ApiRequestError(
          '/api/auth/delete-user',
          result.error.status,
          result.error.message,
        )
      if (!result.data.success || result.data.message !== AUTH_ACCOUNT_REMOVAL_CONFIRMED)
        throw new Error(t('accountRemoval.unconfirmed'))
      setIsConfirmed(true)
      updateOfflineStatus({ accountCleanup: { userId, pending: false, error: null } })
      await didEraseRemovedAccountData(queryClient)
      await onRemoved()
    },
  })
  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="text-xl font-semibold">{t('accountRemoval.heading')}</h2>
      <p className="text-sm leading-relaxed text-ink-muted">
        {t(isProtectedOwner ? 'accountRemoval.ownerProtected' : 'accountRemoval.description')}
      </p>
      {isProtectedOwner ? null : (
        <AlertDialog.Root
          open={open}
          onOpenChange={(value) => {
            if (removal.isPending) return
            setOpen(value)
            setConfirmation('')
            removal.reset()
          }}
        >
          <div>
            <AlertDialog.Trigger asChild>
              <Button variant="danger" disabled={isConfirmed}>
                {t('accountRemoval.action')}
              </Button>
            </AlertDialog.Trigger>
          </div>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
            <AlertDialog.Content className="fixed inset-x-4 top-[max(1rem,12dvh)] z-50 mx-auto flex max-h-[80dvh] max-w-md flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-surface-raised p-6 shadow-card focus:outline-none">
              <AlertDialog.Title className="text-lg font-semibold">
                {t('accountRemoval.title')}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm leading-relaxed text-ink-muted">
                {t('accountRemoval.consequences')}
              </AlertDialog.Description>
              <Field
                label={t('accountRemoval.confirmLabel')}
                hint={t('accountRemoval.confirmHint')}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    value={confirmation}
                    autoComplete="off"
                    disabled={removal.isPending}
                    placeholder={email}
                    onChange={(event) => setConfirmation(event.currentTarget.value)}
                  />
                )}
              </Field>
              {removal.isError ? <Alert tone="error">{describeError(removal.error)}</Alert> : null}
              <div className="flex flex-wrap justify-end gap-3">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary" disabled={removal.isPending}>
                    {t('admin.cancel')}
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  variant="danger"
                  disabled={confirmation !== email || isConfirmed}
                  isPending={removal.isPending}
                  onClick={() => removal.mutate()}
                >
                  {t('accountRemoval.confirm')}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </Card>
  )
}
