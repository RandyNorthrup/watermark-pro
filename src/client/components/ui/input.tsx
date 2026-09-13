import type { InputHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'glass-control h-10 w-full min-w-0 rounded-xl border border-control-line bg-surface-raised px-3 text-base text-ink shadow-xs transition-colors placeholder:text-ink-muted sm:text-sm',
        'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none',
        'aria-invalid:border-rose-500 aria-invalid:ring-rose-500/30',
        className,
      )}
      {...props}
    />
  )
}
