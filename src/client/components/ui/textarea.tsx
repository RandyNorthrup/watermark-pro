import type { TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

/** The `Input` look for multi-line text. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink shadow-xs transition-colors placeholder:text-ink-muted',
        'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none',
        'aria-invalid:border-rose-500 aria-invalid:ring-rose-500/30',
        className,
      )}
      {...props}
    />
  )
}
