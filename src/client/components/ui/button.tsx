import type { VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { buttonVariants } from './button-variants'
import { Spinner } from './spinner'
import { cn } from '../../lib/cn'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while an action is in flight. */
  isPending?: boolean
}

export function Button({
  className,
  variant,
  size,
  isPending = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled === true || isPending}
      aria-busy={isPending || undefined}
      {...props}
    >
      {isPending ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
}
