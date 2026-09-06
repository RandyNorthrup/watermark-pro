import { type ReactNode, useId } from 'react'

import { cn } from '../../lib/cn'

interface FieldProps {
  label: string
  /** Validation message; rendered in a live region and linked to the control. */
  error?: string | undefined
  hint?: string | undefined
  className?: string
  children: (controlProps: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
  }) => ReactNode
}

/** Label, control, hint and error wired together for assistive technology. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [hint === undefined ? null : hintId, error === undefined ? null : errorId]
      .filter((value) => value !== null)
      .join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error === undefined ? undefined : true,
      })}
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error === undefined ? (
        <p className="min-h-4" aria-hidden="true" />
      ) : (
        <p id={errorId} role="alert" className="min-h-4 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
