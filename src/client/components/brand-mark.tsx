import { Link } from '@tanstack/react-router'

import { APP_NAME } from '../../shared/constants'
import { cn } from '../lib/cn'

interface BrandMarkProps {
  className?: string
  /** Where the mark links to; authenticated areas point at the dashboard. */
  to?: '/' | '/app'
}

export function BrandMark({ className, to = '/' }: BrandMarkProps) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        className="size-9 shrink-0"
      />
      <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  )
}
