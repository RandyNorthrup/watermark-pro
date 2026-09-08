import { useId } from 'react'

import type { WatermarkDto } from '../../../shared/api'

interface PresetChecklistProps {
  /** The presets to list, already loaded. */
  presets: readonly WatermarkDto[]
  /** The ticked ids, in the order ticked; drives the order badge. */
  selectedIds: readonly string[]
  disabled: boolean
  onToggle: (id: string, isChecked: boolean) => void
  /** The sentence under the list explaining ordering, phrased per tool. */
  hint: string
}

/**
 * A checkbox list of library presets that records the order they were ticked,
 * shared by the tools that apply several presets at once (bulk, documents).
 * Later ticks paint over earlier ones, so the order badge matters.
 */
export function PresetChecklist({
  presets,
  selectedIds,
  disabled,
  onToggle,
  hint,
}: PresetChecklistProps) {
  const hintId = useId()
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="mb-1.5 text-sm font-medium">Presets</legend>
      <ul className="flex flex-col gap-1">
        {presets.map((candidate) => {
          const order = selectedIds.indexOf(candidate.id)
          return (
            <li key={candidate.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-brand-50/60 dark:hover:bg-brand-900/20">
                <input
                  type="checkbox"
                  checked={order !== -1}
                  disabled={disabled}
                  onChange={(event) => {
                    onToggle(candidate.id, event.currentTarget.checked)
                  }}
                  className="size-4 accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                {order === -1 ? null : (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-100">
                    {String(order + 1)}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
      <p id={hintId} className="text-xs text-ink-muted">
        {hint}
      </p>
    </fieldset>
  )
}
