import { useTranslation } from 'react-i18next'

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
    label: 'designer.placement.smart',
    description: 'designer.placement.smartDescription',
  },
  {
    value: 'anchor',
    label: 'designer.placement.corner',
    description: 'designer.placement.cornerDescription',
  },
  {
    value: 'custom',
    label: 'designer.placement.custom',
    description: 'designer.placement.customDescription',
  },
  {
    value: 'random',
    label: 'designer.placement.random',
    description: 'designer.placement.randomDescription',
  },
] as const

const JITTER_STEP = 0.01

const ANCHOR_LABELS = {
  'top-left': 'designer.placement.anchor.topLeft',
  'top-center': 'designer.placement.anchor.topCenter',
  'top-right': 'designer.placement.anchor.topRight',
  'middle-left': 'designer.placement.anchor.middleLeft',
  center: 'designer.placement.anchor.center',
  'middle-right': 'designer.placement.anchor.middleRight',
  'bottom-left': 'designer.placement.anchor.bottomLeft',
  'bottom-center': 'designer.placement.anchor.bottomCenter',
  'bottom-right': 'designer.placement.anchor.bottomRight',
} as const satisfies Record<Anchor, string>

const DEFAULT_ANCHOR: Anchor = 'bottom-right'
const CENTRE = 0.5
const PERCENT = 100
const FRACTION_STEP = 0.01

function percent(value: number): string {
  return `${String(Math.round(value * PERCENT))}%`
}

export function PlacementPanel({ placement, onChange }: PlacementPanelProps) {
  const { t } = useTranslation()
  const modeChoices = MODE_CHOICES.map((choice) => ({
    ...choice,
    label: t(choice.label),
    description: t(choice.description),
  }))
  return (
    <div className="flex flex-col gap-4">
      <ChoiceGroup
        label={t('designer.placement.mode')}
        value={placement.mode}
        choices={modeChoices}
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
        <p className="text-sm text-ink-muted">{t('designer.placement.smartHint')}</p>
      ) : null}
      {placement.mode === 'random' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t('designer.placement.randomHint')}</p>
          <SliderField
            label={t('designer.placement.jitter')}
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
          <legend className="text-sm font-medium">{t('designer.placement.cornerLegend')}</legend>
          <div className="grid w-40 grid-cols-3 gap-1.5">
            {ANCHORS.map((anchor) => (
              <button
                key={anchor}
                type="button"
                aria-label={t(ANCHOR_LABELS[anchor])}
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
            label={t('designer.placement.horizontal')}
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
            label={t('designer.placement.vertical')}
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
