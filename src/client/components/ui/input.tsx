import type { InputHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-lg border border-control-line bg-surface-raised px-3 text-sm text-ink shadow-xs transition-colors placeholder:text-ink-muted',
        'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none',
        'aria-invalid:border-rose-500 aria-invalid:ring-rose-500/30',
        className,
      )}
      {...props}
    />
  )
}
