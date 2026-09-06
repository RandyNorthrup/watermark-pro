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
}: SliderFieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <output htmlFor={id} className="text-xs text-ink-muted tabular-nums">
          {format(value)}
        </output>
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
