import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderPlus } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  FOLDER_POLICY,
  folderNameSchema,
  type FolderDto,
  type FolderKind,
} from '../../../shared/folders'
import { describeError } from '../../lib/errors'
import { createFolder } from '../../lib/folders'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

/** Creation uses the chosen parent and never silently changes the save destination. */
export function NewFolderDialog({
  organizationId,
  kind,
  parentId,
  onCreated,
}: {
  organizationId: string
  kind: FolderKind
  parentId: string | null
  onCreated?: (folder: FolderDto) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [account] = useState(captureOfflineOwner)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | undefined>()
  const create = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      account.assertCurrent()
      const folder = await createFolder(organizationId, kind, name, parentId)
      account.assertCurrent()
      return folder
    },
    onSuccess: async (folder) => {
      await queryClient.invalidateQueries({ queryKey: ['organization', organizationId] })
      account.assertCurrent()
      await onCreated?.(folder)
      account.assertCurrent()
      setOpen(false)
      setName('')
    },
  })
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm">
          <FolderPlus aria-hidden="true" className="size-4" />
          {t('folders.new')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="glass-popover fixed inset-x-4 top-[min(20dvh,8rem)] z-50 mx-auto max-h-[80dvh] w-auto max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface-raised p-5 shadow-card"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))
              event.stopPropagation()
          }}
        >
          <Dialog.Title className="text-lg font-semibold">{t('folders.new')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            {t('folders.newHint')}
          </Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const parsed = folderNameSchema.safeParse(name)
              setValidation(parsed.success ? undefined : t('folders.invalidName'))
              if (parsed.success) create.mutate()
            }}
          >
            <Field label={t('folders.name')} error={validation}>
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  maxLength={FOLDER_POLICY.nameLength}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              )}
            </Field>
            {create.error === null ? null : (
              <Alert tone="error">{describeError(create.error)}</Alert>
            )}
            <div className="flex justify-center gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={create.isPending}>
                  {t('folders.cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" isPending={create.isPending}>
                {t('folders.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
