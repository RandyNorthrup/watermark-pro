import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react'

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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Rotate left"
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
          aria-label="Rotate right"
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
          aria-label="Flip horizontally"
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
          aria-label="Flip vertically"
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
          label="Straighten"
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
