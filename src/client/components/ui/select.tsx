import { Check, ChevronDown } from 'lucide-react'
import { Select as Radix } from 'radix-ui'

import { cn } from '../../lib/cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string> {
  id?: string | undefined
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean | undefined
  'aria-label'?: string | undefined
  className?: string | undefined
}

/** Accessible single select built on Radix; typed to the option union. */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  className,
  ...aria
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value)
  return (
    <Radix.Root
      value={value}
      onValueChange={(next) => {
        const match = options.find((option) => option.value === next)
        if (match !== undefined) {
          onChange(match.value)
        }
      }}
      disabled={disabled ?? false}
    >
      <Radix.Trigger
        id={id}
        aria-label={aria['aria-label']}
        className={cn(
          'glass-control inline-flex h-10 min-w-32 items-center justify-between gap-2 rounded-xl border border-line bg-surface-raised px-3 text-sm shadow-xs',
          'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none disabled:opacity-50',
          className,
        )}
      >
        <Radix.Value>{selected?.label}</Radix.Value>
        <Radix.Icon>
          <ChevronDown aria-hidden="true" className="size-4 opacity-60" />
        </Radix.Icon>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          position="popper"
          sideOffset={6}
          className="glass-popover z-50 min-w-(--radix-select-trigger-width) rounded-xl border border-line bg-surface-raised p-1 text-sm shadow-card"
        >
          <Radix.Viewport>
            {options.map((option) => (
              <Radix.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 outline-none select-none focus:bg-brand-50 dark:focus:bg-brand-900/40"
              >
                <Radix.ItemText>{option.label}</Radix.ItemText>
                <Radix.ItemIndicator>
                  <Check aria-hidden="true" className="size-4" />
                </Radix.ItemIndicator>
              </Radix.Item>
            ))}
          </Radix.Viewport>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
