import { useTranslation } from 'react-i18next'

import {
  MAX_CURVE,
  MAX_LETTER_SPACING,
  MIN_LETTER_SPACING,
  TEXT_EFFECTS,
  type TextEffect,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { type Choice, ChoiceGroup } from '../ui/choice-group'
import { SliderField } from '../ui/slider-field'

type TextSpec = Extract<WatermarkSpec, { kind: 'text' }>

interface TextEffectsProps {
  spec: TextSpec
  onChange: (spec: TextSpec) => void
}

const PERCENT = 100
const SPACING_STEP = 0.01
const CURVE_STEP = 0.01

const EFFECT_CHOICES = [
  { value: 'solid', label: 'designer.effects.solid' },
  { value: 'outline', label: 'designer.effects.outline' },
  { value: 'emboss', label: 'designer.effects.emboss' },
  { value: 'engrave', label: 'designer.effects.engrave' },
] as const satisfies readonly Choice<TextEffect>[]

function percent(value: number): string {
  const rounded = Math.round(value * PERCENT)
  return `${rounded > 0 ? '+' : ''}${String(rounded)}%`
}

/** Letter spacing, curve and paint effect for a text mark. */
export function TextEffects({ spec, onChange }: TextEffectsProps) {
  const { t } = useTranslation()
  const effectChoices = EFFECT_CHOICES.map((choice) => ({ ...choice, label: t(choice.label) }))
  return (
    <div className="flex flex-col gap-4">
      <SliderField
        label={t('designer.effects.letterSpacing')}
        value={spec.letterSpacing}
        min={MIN_LETTER_SPACING}
        max={MAX_LETTER_SPACING}
        step={SPACING_STEP}
        format={percent}
        onChange={(letterSpacing) => {
          onChange({ ...spec, letterSpacing })
        }}
      />
      <SliderField
        label={t('designer.effects.curve')}
        value={spec.curve}
        min={-MAX_CURVE}
        max={MAX_CURVE}
        step={CURVE_STEP}
        format={percent}
        onChange={(curve) => {
          onChange({ ...spec, curve })
        }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('designer.effects.effect')}</span>
        <ChoiceGroup
          label={t('designer.effects.textEffect')}
          value={spec.effect}
          choices={effectChoices}
          onChange={(effect) => {
            onChange({ ...spec, effect: TEXT_EFFECTS.includes(effect) ? effect : 'solid' })
          }}
        />
      </div>
    </div>
  )
}
