import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { WatermarkDto } from '../../../shared/api-watermark'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { Layer } from '../../editor/state'
import { watermarksQueryOptions } from '../../lib/library'
import { WatermarkDesigner } from '../designer/watermark-designer'
import { Button } from '../ui/button'

interface WatermarkPanelProps {
  organizationId: string
  canCreate: boolean
  draftSpec: WatermarkSpec
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  layers: readonly Layer[]
  activeLayerId: string | null
  onAddPreset: (preset: WatermarkDto) => void
  /** Replaces the active layer's spec. */
  onSpecChange: (spec: WatermarkSpec) => void
}

function isSameSpec(first: WatermarkSpec, second: WatermarkSpec): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

/** Edit the active watermark directly inside the Editor's Watermark section. */
export function WatermarkPanel({
  organizationId,
  canCreate,
  draftSpec,
  undo,
  redo,
  canUndo,
  canRedo,
  layers,
  activeLayerId,
  onAddPreset,
  onSpecChange,
}: WatermarkPanelProps) {
  const { t } = useTranslation()
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const active = layers.find((layer) => layer.id === activeLayerId)
  const initial = presets.data?.find((preset) => preset.id === active?.presetId)
  const isModified =
    active !== undefined && initial !== undefined && !isSameSpec(initial.spec, active.spec)

  if (!canCreate && active === undefined) {
    return <p className="text-sm text-ink-muted">{t('editor.watermark.emptyReadOnly')}</p>
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {isModified ? (
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span>{t('editor.watermark.adjusted')}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSpecChange(initial.spec)}
          >
            {t('editor.watermark.revert')}
          </Button>
        </div>
      ) : null}
      <WatermarkDesigner
        key={active?.id ?? 'draft'}
        organizationId={organizationId}
        initial={initial}
        canManage
        canSave={canCreate}
        canManageLogos={canCreate}
        submitLabel={t(
          initial === undefined ? 'editor.watermark.saveAndUse' : 'designer.saveChanges',
        )}
        inline={{
          spec: active?.spec ?? draftSpec,
          onChange: onSpecChange,
          undo,
          redo,
          canUndo,
          canRedo,
        }}
        onSaved={(saved) => {
          if (active === undefined) onAddPreset(saved)
          else onSpecChange(saved.spec)
        }}
      />
    </div>
  )
}
