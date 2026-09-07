import { type Border, MAX_BORDER_RATIO } from '../../engine/pipeline'
import { SliderField } from '../ui/slider-field'

interface FrameControlsProps {
  border: Border | null
  onChange: (border: Border | null) => void
}

const PERCENT = 100
const WIDTH_STEP = 0.005
const DEFAULT_WIDTH = 0.03
const DEFAULT_COLOUR = '#ffffff'

const SWITCH_CLASS =
  'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line transition-colors data-[state=checked]:bg-brand-600'

/** An optional matte frame around the photo; shared by the editor and bulk. */
export function FrameControls({ border, onChange }: FrameControlsProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <label className="flex items-center justify-between text-sm font-medium">
        Frame
        <input
          type="checkbox"
          role="switch"
          aria-label="Add a frame"
          className={SWITCH_CLASS}
          checked={border !== null}
          onChange={(event) => {
            onChange(
              event.currentTarget.checked ? { width: DEFAULT_WIDTH, colour: DEFAULT_COLOUR } : null,
            )
          }}
        />
      </label>
      {border === null ? null : (
        <div className="flex flex-col gap-2">
          <SliderField
            label="Frame width"
            value={border.width}
            min={0}
            max={MAX_BORDER_RATIO}
            step={WIDTH_STEP}
            format={(value) => `${String(Math.round(value * PERCENT))}%`}
            onChange={(width) => {
              onChange({ ...border, width })
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24">Frame colour</span>
            <input
              type="color"
              aria-label="Frame colour"
              value={border.colour}
              onChange={(event) => {
                onChange({ ...border, colour: event.currentTarget.value })
              }}
            />
          </label>
        </div>
      )}
    </fieldset>
  )
}
