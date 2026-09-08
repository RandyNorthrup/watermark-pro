import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { FONT_WEIGHTS } from '../../../shared/constants'
import {
  findFont,
  FONT_CATALOGUE,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
} from '../../fonts/catalogue'
import { cn } from '../../lib/cn'

const selectClassName =
  'h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

type FontWeight = (typeof FONT_WEIGHTS)[number]

interface FontPickerProps {
  family: string
  onFamilyChange: (family: string) => void
  /** Omit to hide the weight control (glyph symbols always use regular). */
  weight?: FontWeight | undefined
  onWeightChange?: ((weight: FontWeight) => void) | undefined
  className?: string | undefined
}

function isFontWeight(value: number): value is FontWeight {
  return (FONT_WEIGHTS as readonly number[]).includes(value)
}

/**
 * Family and weight selection over the bundled catalogue. A native select
 * with option groups is the most accessible way to present fifty families.
 */
export function FontPicker({
  family,
  onFamilyChange,
  weight,
  onWeightChange,
  className,
}: FontPickerProps) {
  const { t } = useTranslation()
  const familyId = useId()
  const weightId = useId()
  const font = findFont(family)
  const availableWeights = font?.weights ?? []
  return (
    <div className={cn('grid gap-4 sm:grid-cols-[1fr_auto]', className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={familyId} className="text-sm font-medium">
          {t('designer.font.family')}
        </label>
        <select
          id={familyId}
          value={family}
          onChange={(event) => {
            onFamilyChange(event.currentTarget.value)
          }}
          className={selectClassName}
        >
          {FONT_CATEGORIES.map((category) => (
            <optgroup key={category} label={FONT_CATEGORY_LABELS[category]}>
              {FONT_CATALOGUE.filter((candidate) => candidate.category === category).map(
                (candidate) => (
                  <option key={candidate.id} value={candidate.family}>
                    {candidate.family}
                  </option>
                ),
              )}
            </optgroup>
          ))}
        </select>
        <p className="truncate text-lg" style={{ fontFamily: `"${family}"` }} aria-hidden="true">
          {t('designer.font.specimen')}
        </p>
      </div>
      {weight === undefined || onWeightChange === undefined ? null : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={weightId} className="text-sm font-medium">
            {t('designer.font.weight')}
          </label>
          <select
            id={weightId}
            value={weight}
            onChange={(event) => {
              const next = Number(event.currentTarget.value)
              if (isFontWeight(next)) {
                onWeightChange(next)
              }
            }}
            className={cn(selectClassName, 'min-w-28')}
          >
            {FONT_WEIGHTS.map((candidate) => (
              <option
                key={candidate}
                value={candidate}
                disabled={availableWeights.length > 0 && !availableWeights.includes(candidate)}
              >
                {candidate}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
