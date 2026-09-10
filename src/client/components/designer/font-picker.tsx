import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FONT_WEIGHTS } from '../../../shared/constants'
import {
  findFont,
  FONT_CATALOGUE,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  nearestWeight,
} from '../../fonts/catalogue'
import { cn } from '../../lib/cn'
import { Input } from '../ui/input'

const selectClassName =
  'h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

type FontWeight = (typeof FONT_WEIGHTS)[number]
const REGULAR_WEIGHT = 400

interface FontPickerProps {
  family: string
  onFamilyChange: (family: string, weight: FontWeight | undefined) => void
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
 * with option groups keeps the full searchable catalogue keyboard accessible.
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
  const searchId = useId()
  const [search, setSearch] = useState('')
  const weightId = useId()
  const font = findFont(family)
  const availableWeights = font?.weights ?? []
  const query = search.trim().toLocaleLowerCase()
  const matches = FONT_CATALOGUE.filter((candidate) =>
    candidate.family.toLocaleLowerCase().includes(query),
  )
  const visible = FONT_CATALOGUE.filter(
    (candidate) => candidate.family === family || matches.includes(candidate),
  )
  return (
    <div className={cn('grid gap-4 sm:grid-cols-[1fr_auto]', className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          {t('designer.font.search')}
        </label>
        <Input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <p role="status" className="text-xs text-ink-muted">
          {t('designer.font.resultCount', { count: matches.length })}
        </p>
        <label htmlFor={familyId} className="text-sm font-medium">
          {t('designer.font.family')}
        </label>
        <select
          id={familyId}
          value={family}
          onChange={(event) => {
            const nextFamily = event.currentTarget.value
            const nextFont = findFont(nextFamily)
            const nearest =
              nextFont === undefined
                ? REGULAR_WEIGHT
                : nearestWeight(nextFont, weight ?? REGULAR_WEIGHT)
            onFamilyChange(nextFamily, isFontWeight(nearest) ? nearest : undefined)
          }}
          className={selectClassName}
        >
          {FONT_CATEGORIES.map((category) => (
            <optgroup key={category} label={FONT_CATEGORY_LABELS[category]}>
              {visible
                .filter((candidate) => candidate.category === category)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.family}>
                    {candidate.family}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <p className="truncate text-lg" style={{ fontFamily: `"${family}"` }} aria-hidden="true">
          {t('designer.font.specimen')}
        </p>
        {font?.licensePath === undefined ? null : (
          <a
            href={font.licensePath}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-muted underline"
          >
            {t('designer.font.license')}
          </a>
        )}
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
