import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { cn } from '../../lib/cn'

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Renders the readout beside the label; defaults to the raw value. */
  format?: (value: number) => string
  disabled?: boolean | undefined
  className?: string | undefined
  /** When present, shows an accessible one-click return to the control's default. */
  resetValue?: number | undefined
  resetLabel?: string | undefined
}

/** Labelled range input with a live readout; the native control keeps keyboard and screen-reader semantics. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = String,
  disabled,
  className,
  resetValue,
  resetLabel,
}: SliderFieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {resetValue === undefined || resetLabel === undefined || value === resetValue ? null : (
            <button
              type="button"
              aria-label={resetLabel}
              title={resetLabel}
              disabled={disabled ?? false}
              onClick={() => onChange(resetValue)}
              className="inline-flex size-7 items-center justify-center rounded-lg text-ink-muted hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none disabled:opacity-50 dark:hover:bg-brand-900/40 dark:hover:text-brand-200"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </button>
          )}
          <output htmlFor={id} className="text-xs text-ink-muted tabular-nums">
            {format(value)}
          </output>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled ?? false}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value))
        }}
        className="accent-brand-600 disabled:opacity-50"
      />
    </div>
  )
}
