import { Switch } from 'radix-ui'
import { useId } from 'react'

import {
  CONTRAST_VARIANTS,
  type ContrastVariant,
  MAX_MARGIN,
  MAX_ROTATION_DEGREES,
  MAX_SCALE,
  MAX_TILE_SPACING,
  MIN_SCALE,
  MIN_TILE_SPACING,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { withContrast, withStyle } from '../../lib/spec-edit'
import { ChoiceGroup } from '../ui/choice-group'
import { SliderField } from '../ui/slider-field'

interface StylePanelProps {
  spec: WatermarkSpec
  onChange: (spec: WatermarkSpec) => void
}

const CONTRAST_CHOICES = [
  { value: 'auto', label: 'Auto', description: 'Light or dark ink chosen per photo' },
  { value: 'manual', label: 'Manual', description: 'Fixed ink and outline strength' },
] as const

const VARIANT_CHOICES: readonly { value: ContrastVariant; label: string }[] = CONTRAST_VARIANTS.map(
  (variant) => ({ value: variant, label: variant === 'light' ? 'Light ink' : 'Dark ink' }),
)

const DEFAULT_MANUAL_OUTLINE = 0.5
const PERCENT = 100
const FRACTION_STEP = 0.01
const ROTATION_STEP = 1
const SPACING_STEP = 0.1

function percent(value: number): string {
  return `${String(Math.round(value * PERCENT))}%`
}

function degrees(value: number): string {
  return `${String(Math.round(value))}°`
}

function multiple(value: number): string {
  return `${value.toFixed(1)}×`
}

export function StylePanel({ spec, onChange }: StylePanelProps) {
  const tilingId = useId()
  const { style, contrast } = spec
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="contrast-heading" className="flex flex-col gap-3">
        <h2 id="contrast-heading" className="text-sm font-semibold">
          Contrast
        </h2>
        <ChoiceGroup
          label="Contrast mode"
          value={contrast.mode}
          choices={CONTRAST_CHOICES}
          onChange={(mode) => {
            onChange(
              withContrast(
                spec,
                mode === 'auto'
                  ? { mode }
                  : { mode, variant: 'light', outline: DEFAULT_MANUAL_OUTLINE },
              ),
            )
          }}
        />
        {contrast.mode === 'manual' ? (
          <div className="flex flex-col gap-4">
            <ChoiceGroup
              label="Ink"
              value={contrast.variant}
              choices={VARIANT_CHOICES}
              onChange={(variant) => {
                onChange(withContrast(spec, { ...contrast, variant }))
              }}
            />
            <SliderField
              label="Outline strength"
              value={contrast.outline}
              min={0}
              max={1}
              step={FRACTION_STEP}
              format={percent}
              onChange={(outline) => {
                onChange(withContrast(spec, { ...contrast, outline }))
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Ink switches between light and dark to suit the area under the mark, and an outline is
            added only when the background is too close in tone.
          </p>
        )}
      </section>

      <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
        <h2 id="appearance-heading" className="text-sm font-semibold">
          Appearance
        </h2>
        <SliderField
          label="Opacity"
          value={style.opacity}
          min={0}
          max={1}
          step={FRACTION_STEP}
          format={percent}
          onChange={(opacity) => {
            onChange(withStyle(spec, { opacity }))
          }}
        />
        <SliderField
          label="Size"
          value={style.scale}
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={FRACTION_STEP}
          format={(value) => `${percent(value)} of width`}
          onChange={(scale) => {
            onChange(withStyle(spec, { scale }))
          }}
        />
        <SliderField
          label="Rotation"
          value={style.rotation}
          min={-MAX_ROTATION_DEGREES}
          max={MAX_ROTATION_DEGREES}
          step={ROTATION_STEP}
          format={degrees}
          onChange={(rotation) => {
            onChange(withStyle(spec, { rotation }))
          }}
        />
        <SliderField
          label="Margin"
          value={style.margin}
          min={0}
          max={MAX_MARGIN}
          step={FRACTION_STEP}
          format={percent}
          disabled={style.tiling.enabled}
          onChange={(margin) => {
            onChange(withStyle(spec, { margin }))
          }}
        />
      </section>

      <section aria-labelledby="tiling-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="tiling-heading" className="text-sm font-semibold">
            <label htmlFor={tilingId}>Repeat across the photo</label>
          </h2>
          <Switch.Root
            id={tilingId}
            checked={style.tiling.enabled}
            onCheckedChange={(enabled) => {
              onChange(withStyle(spec, { tiling: { enabled } }))
            }}
            className="relative h-6 w-11 rounded-full bg-line transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none data-[state=checked]:bg-brand-600"
          >
            <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>
        <SliderField
          label="Spacing"
          value={style.tiling.spacing}
          min={MIN_TILE_SPACING}
          max={MAX_TILE_SPACING}
          step={SPACING_STEP}
          format={multiple}
          disabled={!style.tiling.enabled}
          onChange={(spacing) => {
            onChange(withStyle(spec, { tiling: { spacing } }))
          }}
        />
      </section>
    </div>
  )
}
