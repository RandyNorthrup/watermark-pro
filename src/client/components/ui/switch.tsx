import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'> {
  isChecked: boolean
  onCheckedChange: (isChecked: boolean) => void
}

/** Accessible two-state slide control styled with the application theme. */
export function Switch({ isChecked, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={isChecked}
      data-state={isChecked ? 'checked' : 'unchecked'}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border px-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        isChecked
          ? 'border-brand-600 bg-brand-600 dark:border-brand-400 dark:bg-brand-400'
          : 'border-control-line bg-surface-raised',
        className,
      )}
      onClick={() => onCheckedChange(!isChecked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform',
          isChecked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
