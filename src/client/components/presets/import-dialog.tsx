import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { collisionRename, type PresetFile, type PresetFileEntry } from '../../../shared/preset-file'
import { describeError } from '../../lib/errors'
import { libraryQueryKey } from '../../lib/library'
import { importPresetFile, parsePresetFile } from '../../lib/preset-file'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'

interface ImportDialogProps {
  organizationId: string
  /** Preset names already in the library, so clashes can be renamed on import. */
  existingNames: readonly string[]
  trigger: ReactNode
}

const PRESET_FILE_ACCEPT = '.wmp.json,application/json'

/** Human label for a preset entry's mark kind. */
function kindLabel(entry: PresetFileEntry): string {
  return entry.spec.kind === 'image' ? 'logo' : entry.spec.kind
}

/**
 * Reads a portable preset bundle and imports the chosen presets into the
 * organization. Names that clash with the current library are renamed with a
 * numeric suffix before importing, and the clash is flagged in the list.
 */
export function ImportDialog({ organizationId, existingNames, trigger }: ImportDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [parsed, setParsed] = useState<PresetFile | null>(null)
  const [selected, setSelected] = useState<boolean[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  function reset() {
    setParsed(null)
    setSelected([])
    setParseError(null)
    importMutation.reset()
  }

  async function readFile(file: File) {
    setParseError(null)
    try {
      const result = await parsePresetFile(file)
      setParsed(result)
      setSelected(result.presets.map(() => true))
    } catch (error) {
      setParsed(null)
      setSelected([])
      setParseError(describeError(error))
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (parsed === null) {
        return
      }
      const taken = [...existingNames]
      const selection: PresetFileEntry[] = []
      for (const [index, entry] of parsed.presets.entries()) {
        if (selected[index] !== true) {
          continue
        }
        const name = collisionRename(entry.name, taken)
        taken.push(name)
        selection.push({ ...entry, name })
      }
      await importPresetFile(organizationId, selection)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: libraryQueryKey(organizationId) })
      setIsOpen(false)
    },
  })

  function toggle(index: number, isChecked: boolean) {
    setSelected((previous) =>
      previous.map((value, position) => (position === index ? isChecked : value)),
    )
  }

  const selectedCount = selected.filter(Boolean).length

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        reset()
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface-raised p-6 shadow-card">
          <div>
            <Dialog.Title className="text-lg font-semibold">
              {t('presets.importTitle')}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              {t('presets.importDescription')}
            </Dialog.Description>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              {t('presets.presetFileLabel')}
            </label>
            <input
              id={inputId}
              type="file"
              accept={PRESET_FILE_ACCEPT}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file !== undefined) {
                  void readFile(file)
                }
                event.currentTarget.value = ''
              }}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>

          {parseError === null ? null : <Alert tone="error">{parseError}</Alert>}

          {parsed !== null && parsed.presets.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('presets.noPresets')}</p>
          ) : null}

          {parsed !== null && parsed.presets.length > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">
                {t('presets.fileCount', { count: parsed.presets.length })}
              </legend>
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {parsed.presets.map((entry, index) => {
                  const finalName = collisionRename(entry.name, existingNames)
                  const isRenamed = finalName !== entry.name
                  return (
                    <li key={`${entry.name}:${String(index)}`}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected[index] === true}
                          onChange={(event) => {
                            toggle(index, event.currentTarget.checked)
                          }}
                          className="mt-0.5 size-4 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{entry.name}</span>
                            <span className="shrink-0 text-xs text-ink-muted">
                              {kindLabel(entry)}
                            </span>
                          </span>
                          {isRenamed ? (
                            <span className="block text-xs text-amber-600">
                              {t('presets.renamed', { name: entry.name, finalName })}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ) : null}

          {importMutation.isError ? (
            <Alert tone="error" title="Could not import the presets">
              {describeError(importMutation.error)}
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                {t('presets.cancel')}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              isPending={importMutation.isPending}
              disabled={selectedCount === 0}
              onClick={() => {
                importMutation.mutate()
              }}
            >
              <FileUp aria-hidden="true" className="size-4" />
              {t('presets.importButton', { count: selectedCount })}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
