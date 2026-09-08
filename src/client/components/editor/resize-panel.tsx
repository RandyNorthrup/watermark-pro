import { Switch } from 'radix-ui'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LONG_EDGE_PRESETS, SCALE_PRESETS } from '../../editor/constants'
import {
  fitLongestSide,
  isSameSize,
  MAX_OUTPUT_SIDE,
  MIN_OUTPUT_SIDE,
  resizeFree,
  resizeLocked,
  scaleSize,
} from '../../editor/geometry'
import type { Size } from '../../engine/layout'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface ResizePanelProps {
  /** Size after cropping, before any resize. */
  base: Size
  resize: Size | null
  onResizeChange: (resize: Size | null) => void
}

const PERCENT = 100
const DIMENSION_LABELS = {
  width: 'editor.dimensions.width',
  height: 'editor.dimensions.height',
} as const satisfies Record<keyof Size, string>

/** Output dimensions with an aspect lock, percentage and long-edge shortcuts. */
export function ResizePanel({ base, resize, onResizeChange }: ResizePanelProps) {
  const { t } = useTranslation()
  const id = useId()
  const [isLocked, setIsLocked] = useState(true)
  const current = resize ?? base

  function apply(next: Size) {
    onResizeChange(isSameSize(next, base) ? null : next)
  }

  function change(dimension: keyof Size, raw: string) {
    const value = Number(raw)
    if (raw === '' || !Number.isFinite(value)) {
      return
    }
    const next = isLocked
      ? resizeLocked(base, dimension === 'width' ? { width: value } : { height: value })
      : resizeFree(current, { [dimension]: value })
    apply(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {(['width', 'height'] as const).map((dimension) => (
          <div key={dimension} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${dimension}`} className="text-xs font-medium text-ink-muted">
              {t('editor.dimensions.pxField', { label: t(DIMENSION_LABELS[dimension]) })}
            </label>
            <Input
              id={`${id}-${dimension}`}
              type="number"
              inputMode="numeric"
              min={MIN_OUTPUT_SIDE}
              max={MAX_OUTPUT_SIDE}
              value={current[dimension]}
              onChange={(event) => {
                change(dimension, event.currentTarget.value)
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor={`${id}-lock`} className="text-sm font-medium">
          {t('editor.resize.keepProportions')}
        </label>
        <Switch.Root
          id={`${id}-lock`}
          checked={isLocked}
          onCheckedChange={setIsLocked}
          className="relative h-6 w-11 rounded-full bg-line focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none data-[state=checked]:bg-brand-600"
        >
          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-ink-muted">
          {t('editor.resize.shortcuts')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {SCALE_PRESETS.map((factor) => (
            <Button
              key={factor}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                apply(scaleSize(base, factor))
              }}
            >
              {String(Math.round(factor * PERCENT))}%
            </Button>
          ))}
          {LONG_EDGE_PRESETS.map((side) => (
            <Button
              key={side}
              type="button"
              variant="secondary"
              size="sm"
              disabled={Math.max(base.width, base.height) <= side}
              onClick={() => {
                apply(fitLongestSide(base, side))
              }}
            >
              {t('editor.resize.fit', { side })}
            </Button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted">
        {resize === null
          ? t('editor.resize.outputUnchanged', { width: current.width, height: current.height })
          : t('editor.resize.outputChanged', {
              width: current.width,
              height: current.height,
              baseWidth: base.width,
              baseHeight: base.height,
            })}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={resize === null}
        onClick={() => {
          onResizeChange(null)
        }}
      >
        {t('editor.resize.resetSize')}
      </Button>
    </div>
  )
}
