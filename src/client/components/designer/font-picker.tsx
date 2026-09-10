import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover as Radix } from 'radix-ui'
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
  'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

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
 * Searchable family dropdown and weight selection over the bundled catalogue.
 * The family list opens on demand so the 500+ choices do not crowd the editor.
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
  const listId = useId()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const weightId = useId()
  const font = findFont(family)
  const availableWeights = font?.weights ?? []
  const query = search.trim().toLocaleLowerCase()
  const matches = FONT_CATALOGUE.filter((candidate) =>
    candidate.family.toLocaleLowerCase().includes(query),
  )
  return (
    <div
      className={cn('grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]', className)}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={familyId} className="text-sm font-medium">
          {t('designer.font.family')}
        </label>
        <Radix.Root
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen)
            if (!nextOpen) setSearch('')
          }}
        >
          <Radix.Trigger
            id={familyId}
            role="combobox"
            aria-controls={listId}
            aria-expanded={open}
            className="glass-control flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-control-line bg-surface-raised px-3 text-start shadow-xs transition-colors hover:border-brand-400 focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{family}</span>
              <span
                className="block truncate text-base text-ink-muted"
                style={{ fontFamily: `"${family}"` }}
                aria-hidden="true"
              >
                {t('designer.font.specimen')}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
            />
          </Radix.Trigger>
          <Radix.Portal>
            <Radix.Content
              align="start"
              sideOffset={8}
              className="glass-popover z-50 w-(--radix-popover-trigger-width) min-w-72 rounded-2xl border border-line bg-surface-raised p-2 shadow-card"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                />
                <Input
                  id={searchId}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  aria-label={t('designer.font.search')}
                  aria-controls={listId}
                  className="ps-9"
                />
              </div>
              <p role="status" className="px-2 pt-2 pb-1 text-xs text-ink-muted">
                {t('designer.font.resultCount', { count: matches.length })}
              </p>
              <div
                id={listId}
                role="listbox"
                aria-label={t('designer.font.family')}
                className="max-h-72 overflow-y-auto overscroll-contain p-1"
              >
                {FONT_CATEGORIES.map((category) => {
                  const categoryMatches = matches.filter(
                    (candidate) => candidate.category === category,
                  )
                  if (categoryMatches.length === 0) return null
                  return (
                    <section key={category} aria-label={FONT_CATEGORY_LABELS[category]}>
                      <p className="sticky top-0 bg-surface-raised/95 px-2 py-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase backdrop-blur-sm">
                        {FONT_CATEGORY_LABELS[category]}
                      </p>
                      {categoryMatches.map((candidate) => {
                        const isSelected = candidate.family === family
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-sm hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none dark:hover:bg-brand-900/40 dark:focus-visible:bg-brand-900/40"
                            onClick={() => {
                              const nearest = nearestWeight(candidate, weight ?? REGULAR_WEIGHT)
                              onFamilyChange(
                                candidate.family,
                                isFontWeight(nearest) ? nearest : undefined,
                              )
                              setOpen(false)
                            }}
                          >
                            <span className="truncate">{candidate.family}</span>
                            {isSelected ? (
                              <Check
                                aria-hidden="true"
                                className="size-4 shrink-0 text-brand-600"
                              />
                            ) : null}
                          </button>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
            </Radix.Content>
          </Radix.Portal>
        </Radix.Root>
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
