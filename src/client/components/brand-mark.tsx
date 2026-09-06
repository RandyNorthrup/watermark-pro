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
      <span
        aria-hidden="true"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-accent-500 text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7l3.2 10L12 10l4.8 7L20 7" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  )
}
