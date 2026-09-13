import { RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

const THREE_COLUMN_CHOICE_COUNT = 3

export interface Choice<T extends string> {
  value: T
  label: string
  description?: string
  preview?: ReactNode
}

interface ChoiceGroupProps<T extends string> {
  label: string
  value: T
  choices: readonly Choice<T>[]
  onChange: (value: T) => void
  className?: string | undefined
  presentation?: 'segmented' | 'tiles'
}

/** Shared keyboard-accessible choices, presented as segments or visual tiles. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  className,
  presentation = 'segmented',
}: ChoiceGroupProps<T>) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const match = choices.find((choice) => choice.value === next)
        if (match !== undefined) {
          onChange(match.value)
        }
      }}
      // Radix's off-screen form inputs otherwise extend the RTL scroll area.
      // The visible radio buttons keep their focus and keyboard semantics.
      className={cn(
        '[&>input[type=radio][aria-hidden=true]]:hidden',
        presentation === 'tiles'
          ? 'grid grid-cols-3 gap-2'
          : 'grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-raised p-1',
        presentation === 'segmented' &&
          choices.length === THREE_COLUMN_CHOICE_COUNT &&
          'grid-cols-3',
        className,
      )}
    >
      {choices.map((choice) => (
        <RadioGroup.Item
          key={choice.value}
          value={choice.value}
          title={choice.description}
          className={cn(
            'text-sm font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
            presentation === 'tiles'
              ? 'glass-control flex h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs leading-4 transition-colors hover:border-brand-500/60 data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600 data-[state=checked]:text-white'
              : 'flex min-h-9 min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-center data-[state=checked]:bg-brand-600 data-[state=checked]:text-white',
          )}
        >
          {choice.preview}
          {choice.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
