import type { InputHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

/** Consistent swatch size and theme; the native picker retains keyboard and touch support. */
export function ColorInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <input
      {...props}
      type="color"
      className={cn(
        'glass-control size-10 shrink-0 cursor-pointer rounded-lg border border-control-line bg-surface-raised p-1 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}
