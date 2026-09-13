import { Dialog } from 'radix-ui'
import { useTranslation } from 'react-i18next'

import { MAX_PRESET_NAME_LENGTH } from '../../../shared/constants'
import { FolderPicker } from '../folders/folder-picker'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

interface PresetNameDialogProps {
  organizationId?: string
  folderId?: string | null
  onFolderChange?: (folderId: string | null) => void
  isOpen: boolean
  name: string
  error: string | null
  saveError: string | null
  isSaving: boolean
  onOpenChange: (isOpen: boolean) => void
  onNameChange: (name: string) => void
  onSave: () => void
}

/** Naming stays a small confirmation step; editing remains on the main canvas. */
export function PresetNameDialog({
  organizationId,
  folderId = null,
  onFolderChange,
  isOpen,
  name,
  error,
  saveError,
  isSaving,
  onOpenChange,
  onNameChange,
  onSave,
}: PresetNameDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="glass-popover fixed inset-x-4 top-[min(15dvh,6rem)] z-50 mx-auto max-h-[85dvh] w-auto max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface-raised p-5 shadow-card"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))
              event.stopPropagation()
          }}
        >
          <Dialog.Title className="text-lg font-semibold">{t('designer.savePreset')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            {t('designer.saveNameHint')}
          </Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSave()
            }}
          >
            <Field label={t('designer.presetName')} error={error ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  maxLength={MAX_PRESET_NAME_LENGTH}
                  onChange={(event) => onNameChange(event.currentTarget.value)}
                />
              )}
            </Field>
            {organizationId !== undefined && onFolderChange !== undefined ? (
              <FolderPicker
                key={organizationId}
                organizationId={organizationId}
                kind="preset"
                value={folderId}
                onChange={onFolderChange}
                label={t('folders.saveLocation')}
                disabled={isSaving}
                canCreate
              />
            ) : null}
            {saveError === null ? null : <Alert tone="error">{saveError}</Alert>}
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>
                {t('editor.cancel')}
              </Button>
              <Button type="submit" isPending={isSaving}>
                {t('editor.watermark.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
