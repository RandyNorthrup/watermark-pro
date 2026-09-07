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

type ShapeSpec = Extract<WatermarkSpec, { kind: 'shape' }>

interface ShapePanelProps {
  spec: ShapeSpec
  onChange: (spec: ShapeSpec) => void
}

const PERCENT = 100
const ASPECT_STEP = 0.05
const STROKE_STEP = 0.005
const DEFAULT_FILL_COLOUR = '#6d4de6'

const SHAPE_OPTIONS: readonly SelectOption<Shape>[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded-rectangle', label: 'Rounded rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'line', label: 'Line' },
]

function isShape(value: string): value is Shape {
  return (SHAPES as readonly string[]).includes(value)
}

const SWITCH_CLASS =
  'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line transition-colors data-[state=checked]:bg-brand-600'

/** Shape kind, proportions, fill and stroke for a shape mark. */
export function ShapePanel({ spec, onChange }: ShapePanelProps) {
  const isLine = spec.shape === 'line'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Shape</span>
        <Select
          aria-label="Shape"
          value={spec.shape}
          options={SHAPE_OPTIONS}
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
        label={isLine ? 'Length' : 'Proportions'}
        value={spec.aspect}
        min={isLine ? MIN_LINE_ASPECT : MIN_SHAPE_ASPECT}
        max={isLine ? MAX_LINE_ASPECT : MAX_SHAPE_ASPECT}
        step={ASPECT_STEP}
        format={(value) => `${value.toFixed(2)}×`}
        onChange={(aspect) => {
          onChange({ ...spec, aspect })
        }}
      />

      <fieldset className="flex flex-col gap-2">
        <label className="flex items-center justify-between text-sm font-medium">
          Fill
          <input
            type="checkbox"
            className={SWITCH_CLASS}
            role="switch"
            aria-label="Fill the shape"
            checked={spec.fill.enabled}
            onChange={(event) => {
              onChange({ ...spec, fill: { ...spec.fill, enabled: event.currentTarget.checked } })
            }}
          />
        </label>
        {spec.fill.enabled ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24">Fill colour</span>
              <input
                type="color"
                aria-label="Fill colour"
                value={spec.fill.colour}
                onChange={(event) => {
                  onChange({ ...spec, fill: { ...spec.fill, colour: event.currentTarget.value } })
                }}
              />
            </label>
            <SliderField
              label="Fill opacity"
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
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <SliderField
          label="Stroke width"
          value={spec.stroke.width}
          min={0}
          max={MAX_STROKE_RATIO}
          step={STROKE_STEP}
          format={(value) => `${String(Math.round(value * PERCENT))}%`}
          onChange={(width) => {
            onChange({ ...spec, stroke: { ...spec.stroke, width } })
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={spec.stroke.colour !== null}
            onChange={(event) => {
              onChange({
                ...spec,
                stroke: {
                  ...spec.stroke,
                  colour: event.currentTarget.checked ? DEFAULT_FILL_COLOUR : null,
                },
              })
            }}
            className="size-4 accent-brand-600"
          />
          Custom stroke colour
        </label>
        {spec.stroke.colour === null ? null : (
          <input
            type="color"
            aria-label="Stroke colour"
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
