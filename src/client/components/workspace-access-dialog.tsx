import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { Button } from './ui/button'
import { WorkspaceAccess } from './workspace-access'
import type { ShellOrganization } from '../../shared/shell-cache'

/** Focus-contained access management without leaving the user's current tool. */
export function WorkspaceAccessDialog({
  organization,
  userId,
  onClose,
}: {
  organization: ShellOrganization
  userId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="glass-popover fixed inset-x-3 top-[max(1rem,8dvh)] z-50 mx-auto flex max-h-[84dvh] w-auto max-w-xl flex-col overflow-hidden rounded-2xl border border-line shadow-card focus:outline-none">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-5">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold">
                {t('shell.manageAccess')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-sm text-ink-muted">
                {organization.name}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('gallery.close')}>
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </header>
          <div className="overflow-y-auto overscroll-contain p-5">
            <WorkspaceAccess organization={organization} userId={userId} isCompact />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
