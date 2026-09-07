import { X } from 'lucide-react'
import { Dialog as Radix } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export const Sheet = Radix.Root
export const SheetTrigger = Radix.Trigger

interface SheetContentProps extends ComponentProps<typeof Radix.Content> {
  /** Accessible name of the panel; rendered as its heading. */
  title: string
  /** One line under the title; visually hidden when `isDescriptionHidden`. */
  description: string
  isDescriptionHidden?: boolean
  children: ReactNode
}

/**
 * A panel that slides in from the leading edge on small screens: the
 * mobile navigation, for example. Built on Radix Dialog so focus, Escape
 * and the overlay behave like a modal.
 */
export function SheetContent({
  title,
  description,
  isDescriptionHidden = false,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <Radix.Portal>
      <Radix.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Radix.Content
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto border-r border-line bg-surface-raised p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between gap-3">
          <Radix.Title className="text-base font-semibold">{title}</Radix.Title>
          <Radix.Close
            className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:hover:bg-brand-900/40"
            aria-label="Close menu"
          >
            <X aria-hidden="true" className="size-5" />
          </Radix.Close>
        </div>
        <Radix.Description
          className={cn('text-sm text-ink-muted', isDescriptionHidden && 'sr-only')}
        >
          {description}
        </Radix.Description>
        {children}
      </Radix.Content>
    </Radix.Portal>
  )
}
