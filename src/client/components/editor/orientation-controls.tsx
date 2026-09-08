import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  MAX_STRAIGHTEN_DEGREES,
  type Orientation,
  STRAIGHTEN_STEP_DEGREES,
} from '../../../shared/adjustments'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'

interface OrientationControlsProps {
  orientation: Orientation
  onChange: (orientation: Orientation) => void
  /** The straighten slider belongs to the editor's Crop tab, not the bulk section. */
  showStraighten?: boolean | undefined
}

const TURN_COUNT = 4

function turnBy(turns: Orientation['turns'], delta: number): Orientation['turns'] {
  const next = ((turns + delta) % TURN_COUNT) + TURN_COUNT
  return (next % TURN_COUNT) as Orientation['turns']
}

/** Rotate, flip and (optionally) straighten controls, shared by the editor and bulk. */
export function OrientationControls({
  orientation,
  onChange,
  showStraighten = false,
}: OrientationControlsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t('editor.orientation.rotateLeft')}
          onClick={() => {
            onChange({ ...orientation, turns: turnBy(orientation.turns, -1) })
          }}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t('editor.orientation.rotateRight')}
          onClick={() => {
            onChange({ ...orientation, turns: turnBy(orientation.turns, 1) })
          }}
        >
          <RotateCw aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant={orientation.flipX ? 'primary' : 'secondary'}
          size="icon"
          aria-label={t('editor.orientation.flipHorizontal')}
          aria-pressed={orientation.flipX}
          onClick={() => {
            onChange({ ...orientation, flipX: !orientation.flipX })
          }}
        >
          <FlipHorizontal2 aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant={orientation.flipY ? 'primary' : 'secondary'}
          size="icon"
          aria-label={t('editor.orientation.flipVertical')}
          aria-pressed={orientation.flipY}
          onClick={() => {
            onChange({ ...orientation, flipY: !orientation.flipY })
          }}
        >
          <FlipVertical2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {showStraighten ? (
        <SliderField
          label={t('editor.orientation.straighten')}
          value={orientation.straighten}
          min={-MAX_STRAIGHTEN_DEGREES}
          max={MAX_STRAIGHTEN_DEGREES}
          step={STRAIGHTEN_STEP_DEGREES}
          format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}°`}
          onChange={(value) => {
            onChange({ ...orientation, straighten: value })
          }}
        />
      ) : null}
    </div>
  )
}
