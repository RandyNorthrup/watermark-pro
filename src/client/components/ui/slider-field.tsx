import { RotateCcw } from 'lucide-react'
import { type CSSProperties, useId } from 'react'

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
  const progress = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const rangeStyle: CSSProperties & { '--range-progress': string } = {
    '--range-progress': `${String(progress)}%`,
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex min-h-6 items-center justify-between gap-2 text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {resetValue === undefined || resetLabel === undefined || value === resetValue ? null : (
            <button
              type="button"
              aria-label={resetLabel}
              title={resetLabel}
              disabled={disabled ?? false}
              onClick={() => onChange(resetValue)}
              className="inline-flex size-6 items-center justify-center rounded-lg text-ink-muted hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none disabled:opacity-50 dark:hover:bg-brand-900/40 dark:hover:text-brand-200"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </button>
          )}
          <output
            htmlFor={id}
            className="min-w-10 text-end text-xs whitespace-nowrap text-ink-muted tabular-nums"
          >
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
        className="app-range"
        style={rangeStyle}
      />
    </div>
  )
}
