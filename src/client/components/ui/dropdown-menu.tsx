import { DropdownMenu as Radix } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export const DropdownMenu = Radix.Root
export const DropdownMenuTrigger = Radix.Trigger

export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={6}
        align="end"
        className={cn(
          'z-50 min-w-48 rounded-lg border border-line bg-surface-raised p-1 text-sm shadow-card',
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Radix.Item>) {
  return (
    <Radix.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none focus:bg-brand-50 data-[disabled]:opacity-50 dark:focus:bg-brand-900/40',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn('px-2 py-1.5 text-xs text-ink-muted', className)} {...props} />
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
}
