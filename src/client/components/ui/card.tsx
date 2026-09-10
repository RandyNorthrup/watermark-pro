import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'glass-panel rounded-card border border-line bg-surface-raised p-6 shadow-card',
        className,
      )}
      {...props}
    />
  )
}
