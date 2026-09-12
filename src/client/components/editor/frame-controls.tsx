import { useTranslation } from 'react-i18next'

import { type Border, MAX_BORDER_RATIO } from '../../engine/pipeline'
import { SliderField } from '../ui/slider-field'
import { Switch } from '../ui/switch'

interface FrameControlsProps {
  border: Border | null
  onChange: (border: Border | null) => void
}

const PERCENT = 100
const WIDTH_STEP = 0.005
const DEFAULT_WIDTH = 0.03
const DEFAULT_COLOUR = '#ffffff'

/** An optional matte frame around the photo; shared by the editor and bulk. */
export function FrameControls({ border, onChange }: FrameControlsProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{t('editor.frame.label')}</span>
        <Switch
          aria-label={t('editor.frame.add')}
          isChecked={border !== null}
          onCheckedChange={(checked) => {
            onChange(checked ? { width: DEFAULT_WIDTH, colour: DEFAULT_COLOUR } : null)
          }}
        />
      </div>
      {border === null ? null : (
        <div className="flex flex-col gap-2">
          <SliderField
            label={t('editor.frame.width')}
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
            <span className="w-24">{t('editor.frame.colour')}</span>
            <input
              type="color"
              aria-label={t('editor.frame.colour')}
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
