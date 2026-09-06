import { RadioGroup } from 'radix-ui'

import { cn } from '../../lib/cn'

export interface Choice<T extends string> {
  value: T
  label: string
  description?: string
}

interface ChoiceGroupProps<T extends string> {
  label: string
  value: T
  choices: readonly Choice<T>[]
  onChange: (value: T) => void
  className?: string | undefined
}

/** Segmented radio group for small mutually exclusive settings. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  className,
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
      className={cn('inline-flex rounded-lg border border-line bg-surface-raised p-1', className)}
    >
      {choices.map((choice) => (
        <RadioGroup.Item
          key={choice.value}
          value={choice.value}
          title={choice.description}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=checked]:bg-brand-600 data-[state=checked]:text-white"
        >
          {choice.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
