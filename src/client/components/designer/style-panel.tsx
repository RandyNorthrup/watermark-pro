import { Switch } from 'radix-ui'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

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
  { value: 'auto', label: 'designer.style.auto', description: 'designer.style.autoDescription' },
  {
    value: 'manual',
    label: 'designer.style.manual',
    description: 'designer.style.manualDescription',
  },
  {
    value: 'colour',
    label: 'designer.style.colour',
    description: 'designer.style.colourDescription',
  },
] as const

/** A brand-ish default for the colour picker: the app's own accent. */
const DEFAULT_INK_COLOUR = '#6d4de6'

type InkKey = 'designer.style.inkLight' | 'designer.style.inkDark'

const VARIANT_CHOICES: readonly { value: ContrastVariant; label: InkKey }[] = CONTRAST_VARIANTS.map(
  (variant) => ({
    value: variant,
    label: variant === 'light' ? 'designer.style.inkLight' : 'designer.style.inkDark',
  }),
)

const DEFAULT_MANUAL_OUTLINE = 0.5
const SWITCH_CLASS =
  'relative h-6 w-11 rounded-full bg-line transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none data-[state=checked]:bg-brand-600'
const SWITCH_THUMB_CLASS =
  'block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]'
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

/** The contrast setting a mode switch starts from; the outline strength carries over. */
function contrastFor(
  mode: WatermarkSpec['contrast']['mode'],
  current: WatermarkSpec['contrast'],
): WatermarkSpec['contrast'] {
  const outline = current.mode === 'auto' ? DEFAULT_MANUAL_OUTLINE : current.outline
  switch (mode) {
    case 'auto': {
      return { mode }
    }
    case 'manual': {
      return { mode, variant: 'light', outline }
    }
    case 'colour': {
      return { mode, colour: DEFAULT_INK_COLOUR, outline }
    }
  }
}

export function StylePanel({ spec, onChange }: StylePanelProps) {
  const { t } = useTranslation()
  const tilingId = useId()
  const backdropId = useId()
  const { style, contrast } = spec
  const hasBackdrop = spec.kind === 'text' || spec.kind === 'symbol'
  const contrastChoices = CONTRAST_CHOICES.map((choice) => ({
    ...choice,
    label: t(choice.label),
    description: t(choice.description),
  }))
  const variantChoices = VARIANT_CHOICES.map((choice) => ({ ...choice, label: t(choice.label) }))
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="contrast-heading" className="flex flex-col gap-3">
        <h2 id="contrast-heading" className="text-sm font-semibold">
          {t('designer.style.contrast')}
        </h2>
        <ChoiceGroup
          label={t('designer.style.contrastMode')}
          value={contrast.mode}
          choices={contrastChoices}
          onChange={(mode) => {
            onChange(withContrast(spec, contrastFor(mode, contrast)))
          }}
        />
        {contrast.mode === 'auto' ? (
          <p className="text-sm text-ink-muted">{t('designer.style.autoHint')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {contrast.mode === 'manual' ? (
              <ChoiceGroup
                label={t('designer.style.ink')}
                value={contrast.variant}
                choices={variantChoices}
                onChange={(variant) => {
                  onChange(withContrast(spec, { ...contrast, variant }))
                }}
              />
            ) : (
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                {t('designer.style.inkColour')}
                <span className="flex items-center gap-2 font-mono text-xs text-ink-muted">
                  {contrast.colour}
                  <input
                    type="color"
                    value={contrast.colour}
                    onChange={(event) => {
                      onChange(withContrast(spec, { ...contrast, colour: event.target.value }))
                    }}
                    className="size-9 cursor-pointer rounded-lg border border-line bg-surface-raised p-1"
                  />
                </span>
              </label>
            )}
            <SliderField
              label={t('designer.style.outlineStrength')}
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
        )}
      </section>

      <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
        <h2 id="appearance-heading" className="text-sm font-semibold">
          {t('designer.style.appearance')}
        </h2>
        <SliderField
          label={t('designer.style.opacity')}
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
          label={t('designer.style.size')}
          value={style.scale}
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={FRACTION_STEP}
          format={(value) => t('designer.style.ofWidth', { percent: percent(value) })}
          onChange={(scale) => {
            onChange(withStyle(spec, { scale }))
          }}
        />
        <SliderField
          label={t('designer.style.rotation')}
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
          label={t('designer.style.margin')}
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

      {hasBackdrop ? (
        <section aria-labelledby="backdrop-heading" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 id="backdrop-heading" className="text-sm font-semibold">
              <label htmlFor={backdropId}>{t('designer.style.backdrop')}</label>
            </h2>
            <Switch.Root
              id={backdropId}
              checked={style.backdrop.enabled}
              onCheckedChange={(enabled) => {
                onChange(withStyle(spec, { backdrop: { enabled } }))
              }}
              className={SWITCH_CLASS}
            >
              <Switch.Thumb className={SWITCH_THUMB_CLASS} />
            </Switch.Root>
          </div>
          <SliderField
            label={t('designer.style.boxOpacity')}
            value={style.backdrop.opacity}
            min={0}
            max={1}
            step={FRACTION_STEP}
            format={percent}
            disabled={!style.backdrop.enabled}
            onChange={(opacity) => {
              onChange(withStyle(spec, { backdrop: { opacity } }))
            }}
          />
        </section>
      ) : null}

      <section aria-labelledby="tiling-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="tiling-heading" className="text-sm font-semibold">
            <label htmlFor={tilingId}>{t('designer.style.tiling')}</label>
          </h2>
          <Switch.Root
            id={tilingId}
            checked={style.tiling.enabled}
            onCheckedChange={(enabled) => {
              onChange(withStyle(spec, { tiling: { enabled } }))
            }}
            className={SWITCH_CLASS}
          >
            <Switch.Thumb className={SWITCH_THUMB_CLASS} />
          </Switch.Root>
        </div>
        <SliderField
          label={t('designer.style.spacing')}
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
