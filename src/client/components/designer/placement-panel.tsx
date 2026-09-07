import {
  type Anchor,
  ANCHORS,
  DEFAULT_JITTER,
  MAX_JITTER,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { ChoiceGroup } from '../ui/choice-group'
import { SliderField } from '../ui/slider-field'

type Placement = WatermarkSpec['placement']

interface PlacementPanelProps {
  placement: Placement
  onChange: (placement: Placement) => void
}

const MODE_CHOICES = [
  {
    value: 'smart',
    label: 'Smart',
    description: 'Analyses each photo and picks the calmest corner',
  },
  { value: 'anchor', label: 'Corner', description: 'Fixed position relative to the edges' },
  { value: 'custom', label: 'Custom', description: 'Exact position as a fraction of the photo' },
  {
    value: 'random',
    label: 'Random',
    description: 'A different spot per photo; harder to auto-remove',
  },
] as const

const JITTER_STEP = 0.01

const ANCHOR_LABELS: Record<Anchor, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  center: 'Centre',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
}

const DEFAULT_ANCHOR: Anchor = 'bottom-right'
const CENTRE = 0.5
const PERCENT = 100
const FRACTION_STEP = 0.01

function percent(value: number): string {
  return `${String(Math.round(value * PERCENT))}%`
}

export function PlacementPanel({ placement, onChange }: PlacementPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceGroup
        label="Placement mode"
        value={placement.mode}
        choices={MODE_CHOICES}
        onChange={(mode) => {
          switch (mode) {
            case 'anchor': {
              onChange({ mode, anchor: DEFAULT_ANCHOR })
              break
            }
            case 'random': {
              onChange({ mode, jitter: DEFAULT_JITTER })
              break
            }
            case 'custom': {
              onChange({ mode, x: CENTRE, y: CENTRE })
              break
            }
            default: {
              onChange({ mode: 'smart' })
            }
          }
        }}
      />
      {placement.mode === 'smart' ? (
        <p className="text-sm text-ink-muted">
          The engine scores every corner and edge for detail, contrast and subject, then places the
          mark where it is legible and least intrusive.
        </p>
      ) : null}
      {placement.mode === 'random' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">
            Each photo gets a random corner, nudged by up to the jitter below. The same photo always
            lands in the same place.
          </p>
          <SliderField
            label="Jitter"
            value={placement.jitter}
            min={0}
            max={MAX_JITTER}
            step={JITTER_STEP}
            format={percent}
            onChange={(jitter) => {
              onChange({ mode: 'random', jitter })
            }}
          />
        </div>
      ) : null}
      {placement.mode === 'anchor' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Corner</legend>
          <div className="grid w-40 grid-cols-3 gap-1.5">
            {ANCHORS.map((anchor) => (
              <button
                key={anchor}
                type="button"
                aria-label={ANCHOR_LABELS[anchor]}
                aria-pressed={placement.anchor === anchor}
                onClick={() => {
                  onChange({ mode: 'anchor', anchor })
                }}
                className="flex h-10 items-center justify-center rounded-md border border-line bg-surface-raised hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none aria-pressed:border-brand-500 aria-pressed:bg-brand-600 aria-pressed:text-white dark:hover:bg-brand-900/40"
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-current" />
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {placement.mode === 'custom' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SliderField
            label="Horizontal"
            value={placement.x}
            min={0}
            max={1}
            step={FRACTION_STEP}
            format={percent}
            onChange={(x) => {
              onChange({ ...placement, x })
            }}
          />
          <SliderField
            label="Vertical"
            value={placement.y}
            min={0}
            max={1}
            step={FRACTION_STEP}
            format={percent}
            onChange={(y) => {
              onChange({ ...placement, y })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
