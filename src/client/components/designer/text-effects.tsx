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

const EFFECT_CHOICES: readonly Choice<TextEffect>[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'outline', label: 'Outline' },
  { value: 'emboss', label: 'Emboss' },
  { value: 'engrave', label: 'Engrave' },
]

function percent(value: number): string {
  const rounded = Math.round(value * PERCENT)
  return `${rounded > 0 ? '+' : ''}${String(rounded)}%`
}

/** Letter spacing, curve and paint effect for a text mark. */
export function TextEffects({ spec, onChange }: TextEffectsProps) {
  return (
    <div className="flex flex-col gap-4">
      <SliderField
        label="Letter spacing"
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
        label="Curve"
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
        <span className="text-sm font-medium">Effect</span>
        <ChoiceGroup
          label="Text effect"
          value={spec.effect}
          choices={EFFECT_CHOICES}
          onChange={(effect) => {
            onChange({ ...spec, effect: TEXT_EFFECTS.includes(effect) ? effect : 'solid' })
          }}
        />
      </div>
    </div>
  )
}
