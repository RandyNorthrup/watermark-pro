import { Dialog as Radix } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import type { EditorDocument } from '../../editor/state'
import { Editor } from '../editor/editor'

interface OverrideDialogProps {
  organizationId: string
  organizationName: string
  /** The photo being adjusted and its display name. */
  file: File
  fileName: string
  /** The document to start from (the batch settings, or the photo's existing override). */
  document: EditorDocument
  hasOverride: boolean
  onApply: (document: EditorDocument) => void
  onApplyToAll: (document: EditorDocument) => void
  onRemove: () => void
  onClose: () => void
}

/** A full-screen dialog that edits one batch photo through the embedded editor. */
export function OverrideDialog({
  organizationId,
  organizationName,
  file,
  fileName,
  document,
  hasOverride,
  onApply,
  onApplyToAll,
  onRemove,
  onClose,
}: OverrideDialogProps) {
  const { t } = useTranslation()
  return (
    <Radix.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Radix.Content
          aria-describedby={undefined}
          className="fixed inset-2 z-50 flex flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-card outline-none sm:inset-6 lg:inset-12"
        >
          <Radix.Title className="text-base font-semibold">
            {t('bulk.adjustPhoto', { name: fileName })}
          </Radix.Title>
          <Editor
            organizationId={organizationId}
            organizationName={organizationName}
            embedded={{
              document,
              file,
              hasOverride,
              onApply,
              onApplyToAll,
              onRemove,
              onCancel: onClose,
            }}
          />
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
