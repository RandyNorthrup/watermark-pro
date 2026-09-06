import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'

import type { WatermarkDto } from '../../../shared/api'
import type { WatermarkSpec } from '../../../shared/watermark'
import { describeError } from '../../lib/errors'
import { watermarksQueryOptions } from '../../lib/library'
import { withPlacement } from '../../lib/spec-edit'
import { PlacementPanel } from '../designer/placement-panel'
import { StylePanel } from '../designer/style-panel'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

interface WatermarkPanelProps {
  organizationId: string
  presetId: string | null
  spec: WatermarkSpec | null
  onPresetChange: (preset: WatermarkDto) => void
  onSpecChange: (spec: WatermarkSpec) => void
}

const selectClassName =
  'h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

function isSameSpec(a: WatermarkSpec, b: WatermarkSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Choose a library preset, then adjust placement and style for this photo only. */
export function WatermarkPanel({
  organizationId,
  presetId,
  spec,
  onPresetChange,
  onSpecChange,
}: WatermarkPanelProps) {
  const selectId = useId()
  const presets = useQuery(watermarksQueryOptions(organizationId))

  if (presets.isPending) {
    return <Spinner className="size-5" label="Loading presets" />
  }
  if (presets.isError) {
    return (
      <Alert tone="error" title="Could not load presets">
        {describeError(presets.error)}
      </Alert>
    )
  }
  if (presets.data.length === 0) {
    return (
      <Alert tone="info" title="No presets yet">
        <Link to="/app/library/new" className="font-medium underline">
          Create a preset in the library
        </Link>{' '}
        to apply it here.
      </Alert>
    )
  }
  const preset = presets.data.find((candidate) => candidate.id === presetId)
  const isModified = preset !== undefined && spec !== null && !isSameSpec(preset.spec, spec)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium">
          Preset
        </label>
        <select
          id={selectId}
          value={presetId ?? ''}
          onChange={(event) => {
            const { value } = event.currentTarget
            const chosen = presets.data.find((candidate) => candidate.id === value)
            if (chosen !== undefined) {
              onPresetChange(chosen)
            }
          }}
          className={selectClassName}
        >
          <option value="" disabled>
            Choose a preset
          </option>
          {presets.data.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        {isModified ? (
          <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
            <span>Adjusted for this photo; the library preset is unchanged.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onPresetChange(preset)
              }}
            >
              Revert
            </Button>
          </div>
        ) : null}
      </div>
      {spec === null ? null : (
        <>
          <section aria-labelledby="editor-placement-heading" className="flex flex-col gap-3">
            <h2 id="editor-placement-heading" className="text-sm font-semibold">
              Placement
            </h2>
            <PlacementPanel
              placement={spec.placement}
              onChange={(placement) => {
                onSpecChange(withPlacement(spec, placement))
              }}
            />
          </section>
          <StylePanel spec={spec} onChange={onSpecChange} />
        </>
      )}
    </div>
  )
}
