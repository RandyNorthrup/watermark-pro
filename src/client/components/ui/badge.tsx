import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800 capitalize dark:bg-brand-900/50 dark:text-brand-100',
        className,
      )}
      {...props}
    />
  )
}
