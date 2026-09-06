import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

const ALERT_STYLES = {
  info: {
    icon: Info,
    className:
      'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100',
  },
  success: {
    icon: CheckCircle2,
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100',
  },
  error: {
    icon: AlertTriangle,
    className:
      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-100',
  },
} as const

interface AlertProps {
  tone?: keyof typeof ALERT_STYLES
  title?: string
  children?: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { icon: Icon, className: toneClassName } = ALERT_STYLES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', toneClassName, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        {title === undefined ? null : <p className="font-medium">{title}</p>}
        {children === undefined ? null : <div>{children}</div>}
      </div>
    </div>
  )
}
