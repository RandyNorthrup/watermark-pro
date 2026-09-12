import { useTranslation } from 'react-i18next'

import {
  MAX_LINE_ASPECT,
  MAX_SHAPE_ASPECT,
  MAX_STROKE_RATIO,
  MIN_LINE_ASPECT,
  MIN_SHAPE_ASPECT,
  type Shape,
  SHAPES,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { Select, type SelectOption } from '../ui/select'
import { SliderField } from '../ui/slider-field'
import { Switch } from '../ui/switch'

type ShapeSpec = Extract<WatermarkSpec, { kind: 'shape' }>

interface ShapePanelProps {
  spec: ShapeSpec
  onChange: (spec: ShapeSpec) => void
}

const PERCENT = 100
const ASPECT_STEP = 0.05
const STROKE_STEP = 0.005
const DEFAULT_SHAPE_COLOUR = '#c86b82'

const SHAPE_OPTIONS = [
  { value: 'rectangle', label: 'designer.shape.rectangle' },
  { value: 'rounded-rectangle', label: 'designer.shape.roundedRectangle' },
  { value: 'ellipse', label: 'designer.shape.ellipse' },
  { value: 'line', label: 'designer.shape.line' },
] as const satisfies readonly SelectOption<Shape>[]

function isShape(value: string): value is Shape {
  return (SHAPES as readonly string[]).includes(value)
}

/** Shape kind, proportions, fill and stroke for a shape mark. */
export function ShapePanel({ spec, onChange }: ShapePanelProps) {
  const { t } = useTranslation()
  const isLine = spec.shape === 'line'
  const shapeOptions = SHAPE_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('designer.shape.label')}</span>
        <Select
          aria-label={t('designer.shape.label')}
          value={spec.shape}
          options={shapeOptions}
          onChange={(shape) => {
            if (!isShape(shape)) {
              return
            }

            const aspect =
              shape === 'line' ? MIN_LINE_ASPECT : Math.min(spec.aspect, MAX_SHAPE_ASPECT)
            onChange({ ...spec, shape, aspect })
          }}
        />
      </div>
      <SliderField
        label={t(isLine ? 'designer.shape.length' : 'designer.shape.proportions')}
        value={spec.aspect}
        min={isLine ? MIN_LINE_ASPECT : MIN_SHAPE_ASPECT}
        max={isLine ? MAX_LINE_ASPECT : MAX_SHAPE_ASPECT}
        step={ASPECT_STEP}
        format={(value) => `${value.toFixed(2)}×`}
        onChange={(aspect) => {
          onChange({ ...spec, aspect })
        }}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{t('designer.shape.fill')}</span>
          <Switch
            aria-label={t('designer.shape.fillToggle')}
            isChecked={spec.fill.enabled}
            onCheckedChange={(isEnabled) => {
              onChange({ ...spec, fill: { ...spec.fill, enabled: isEnabled } })
            }}
          />
        </div>
        {spec.fill.enabled ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24">{t('designer.shape.fillColour')}</span>
              <input
                type="color"
                aria-label={t('designer.shape.fillColour')}
                value={spec.fill.colour}
                onChange={(event) => {
                  onChange({ ...spec, fill: { ...spec.fill, colour: event.currentTarget.value } })
                }}
              />
            </label>
            <SliderField
              label={t('designer.shape.fillOpacity')}
              value={spec.fill.opacity}
              min={0}
              max={1}
              step={0.01}
              format={(value) => `${String(Math.round(value * PERCENT))}%`}
              onChange={(opacity) => {
                onChange({ ...spec, fill: { ...spec.fill, opacity } })
              }}
            />
          </div>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <SliderField
          label={t('designer.shape.strokeWidth')}
          value={spec.stroke.width}
          min={0}
          max={MAX_STROKE_RATIO}
          step={STROKE_STEP}
          format={(value) => `${String(Math.round(value * PERCENT))}%`}
          onChange={(width) => {
            onChange({ ...spec, stroke: { ...spec.stroke, width } })
          }}
        />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>{t('designer.shape.customStrokeColour')}</span>
          <Switch
            aria-label={t('designer.shape.customStrokeColour')}
            isChecked={spec.stroke.colour !== null}
            onCheckedChange={(isEnabled) => {
              onChange({
                ...spec,
                stroke: {
                  ...spec.stroke,
                  colour: isEnabled ? DEFAULT_SHAPE_COLOUR : null,
                },
              })
            }}
          />
        </div>
        {spec.stroke.colour === null ? null : (
          <input
            type="color"
            aria-label={t('designer.shape.strokeColour')}
            value={spec.stroke.colour}
            onChange={(event) => {
              onChange({ ...spec, stroke: { ...spec.stroke, colour: event.currentTarget.value } })
            }}
          />
        )}
      </fieldset>
    </div>
  )
}
