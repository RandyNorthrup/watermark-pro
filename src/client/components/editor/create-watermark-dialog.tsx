import { Dialog } from 'radix-ui'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WatermarkDto } from '../../../shared/api-watermark'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

const Designer = lazy(async () => {
  const module = await import('../designer/watermark-designer')
  return { default: module.WatermarkDesigner }
})

interface CreateWatermarkDialogProps {
  organizationId: string
  photo?: File | undefined
  disabled: boolean
  onCreated: (preset: WatermarkDto) => void
}

/** Reuse the real designer without leaving the photo or inventing a temporary preset. */
export function CreateWatermarkDialog({
  organizationId,
  photo,
  disabled,
  onCreated,
}: CreateWatermarkDialogProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>
          {t('editor.watermark.create')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          // physical: geometry: centering pairs left-1/2 with an equal negative translation.
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,72rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">
                {t('editor.watermark.create')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {t('editor.watermark.createHint')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                {t('editor.watermark.cancelCreate')}
              </Button>
            </Dialog.Close>
          </div>
          <Suspense fallback={<Spinner label={t('presets.loading')} />}>
            <Designer
              organizationId={organizationId}
              canManage
              canManageLogos
              previewPhoto={photo}
              submitLabel={t('editor.watermark.saveAndUse')}
              onSaved={(preset) => {
                onCreated(preset)
                setIsOpen(false)
              }}
            />
          </Suspense>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
