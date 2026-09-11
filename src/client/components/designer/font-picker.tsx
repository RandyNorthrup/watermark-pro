import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover as Radix } from 'radix-ui'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FONT_WEIGHTS } from '../../../shared/constants'
import {
  findFont,
  FONT_CATALOGUE,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  type FontFamily,
  nearestWeight,
} from '../../fonts/catalogue'
import { previewFont } from '../../fonts/preview'
import { cn } from '../../lib/cn'
import { captureOfflineOwner } from '../../lib/offline-context'
import { Input } from '../ui/input'

const selectClassName =
  'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

type FontWeight = (typeof FONT_WEIGHTS)[number]
const REGULAR_WEIGHT = 400
const MAX_RECENT_FONTS = 8
const RECENT_FONT_STORAGE_PREFIX = 'lumafoil.recent-fonts.'

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

function recentFontKey(userId: string): string {
  return `${RECENT_FONT_STORAGE_PREFIX}${userId}`
}

function readRecentFonts(userId: string): FontFamily[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentFontKey(userId)) ?? '[]')
    if (!Array.isArray(stored)) return []
    const families = stored.filter(
      (candidate): candidate is string => typeof candidate === 'string',
    )
    return families
      .map((candidate) => findFont(candidate))
      .filter((candidate): candidate is FontFamily => candidate !== undefined)
      .slice(0, MAX_RECENT_FONTS)
  } catch {
    return []
  }
}

function saveRecentFont(userId: string, family: string): FontFamily[] {
  const next = [family, ...readRecentFonts(userId).map((candidate) => candidate.family)]
    .filter((candidate, index, values) => values.indexOf(candidate) === index)
    .slice(0, MAX_RECENT_FONTS)
  try {
    localStorage.setItem(recentFontKey(userId), JSON.stringify(next))
  } catch {
    // Font selection still works when browser storage is unavailable.
  }
  return next
    .map((candidate) => findFont(candidate))
    .filter((candidate): candidate is FontFamily => candidate !== undefined)
}

function FontOption({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: FontFamily
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      data-font-preview=""
      data-font-family={candidate.family}
      data-font-weight={nearestWeight(candidate, REGULAR_WEIGHT)}
      aria-selected={isSelected}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start text-base hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none dark:hover:bg-brand-900/40 dark:focus-visible:bg-brand-900/40"
      onClick={onSelect}
    >
      <span className="truncate" style={{ fontFamily: `"${candidate.family}"` }}>
        {candidate.family}
      </span>
      {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-brand-600" /> : null}
    </button>
  )
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
  const [menuOwner, setMenuOwner] = useState<ReturnType<typeof captureOfflineOwner> | null>(null)
  const [recentFonts, setRecentFonts] = useState<FontFamily[]>([])
  const list = useRef<HTMLDivElement>(null)
  const weightId = useId()
  const font = findFont(family)
  const availableWeights = font?.weights ?? []
  const query = search.trim().toLocaleLowerCase()
  const matches = useMemo(
    () =>
      FONT_CATALOGUE.filter((candidate) => candidate.family.toLocaleLowerCase().includes(query)),
    [query],
  )
  const recentMatches = recentFonts.filter((candidate) =>
    candidate.family.toLocaleLowerCase().includes(query),
  )
  const recentKey = recentFonts.map((candidate) => candidate.id).join(',')
  useEffect(() => {
    if (font === undefined) return
    const controller = new AbortController()
    void previewFont(
      family,
      nearestWeight(font, weight ?? REGULAR_WEIGHT),
      controller.signal,
    ).catch(() => false)
    return () => controller.abort()
  }, [family, font, weight])
  useEffect(() => {
    if (!open || typeof IntersectionObserver === 'undefined') return
    const root = list.current
    if (root === null) return
    const controller = new AbortController()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLButtonElement)) continue
          observer.unobserve(entry.target)
          const familyName = entry.target.dataset['fontFamily']
          const fontWeight = Number(entry.target.dataset['fontWeight'])
          if (familyName === undefined || !Number.isFinite(fontWeight)) continue
          void previewFont(familyName, fontWeight, controller.signal).catch(() => false)
        }
      },
      { root },
    )
    for (const option of root.querySelectorAll<HTMLButtonElement>('[data-font-preview]')) {
      observer.observe(option)
    }
    return () => {
      controller.abort()
      observer.disconnect()
    }
  }, [open, query, recentKey])

  function selectFont(candidate: FontFamily): void {
    if (menuOwner === null) return
    try {
      menuOwner.assertCurrent()
    } catch {
      setOpen(false)
      return
    }
    const nearest = nearestWeight(candidate, weight ?? REGULAR_WEIGHT)
    setRecentFonts(saveRecentFont(menuOwner.userId, candidate.family))
    onFamilyChange(candidate.family, isFontWeight(nearest) ? nearest : undefined)
    setOpen(false)
  }
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
            if (nextOpen) {
              try {
                const owner = captureOfflineOwner()
                setMenuOwner(owner)
                setRecentFonts(readRecentFonts(owner.userId))
              } catch {
                setMenuOwner(null)
                setRecentFonts([])
              }
            } else {
              setSearch('')
              setMenuOwner(null)
            }
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
              <span
                className="block truncate text-sm font-medium"
                style={{ fontFamily: `"${family}"` }}
              >
                {family}
              </span>
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
          <Radix.Content
            align="start"
            sideOffset={8}
            className="glass-popover z-50 w-(--radix-popover-trigger-width) min-w-72 overflow-hidden rounded-2xl border border-line bg-surface-raised p-2 shadow-card"
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="relative z-30 bg-surface-raised">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              />
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown') return
                  event.preventDefault()
                  list.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()
                }}
                aria-label={t('designer.font.search')}
                aria-controls={listId}
                className="ps-9"
              />
            </div>
            <p
              role="status"
              className="relative z-30 bg-surface-raised px-2 pt-2 pb-1 text-xs text-ink-muted"
            >
              {t('designer.font.resultCount', { count: matches.length })}
            </p>
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={t('designer.font.family')}
              className="max-h-[min(18rem,calc(100dvh-14rem))] touch-pan-y [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto overscroll-contain p-1"
              onWheel={(event) => event.stopPropagation()}
            >
              {recentMatches.length === 0 ? null : (
                <section role="group" aria-label={t('designer.font.recent')}>
                  <p className="sticky top-0 z-20 bg-surface-raised px-2 py-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    {t('designer.font.recent')}
                  </p>
                  {recentMatches.map((candidate) => (
                    <FontOption
                      key={`recent-${candidate.id}`}
                      candidate={candidate}
                      isSelected={candidate.family === family}
                      onSelect={() => selectFont(candidate)}
                    />
                  ))}
                </section>
              )}
              <p className="sticky top-0 z-20 bg-surface-raised px-2 py-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t('designer.font.all')}
              </p>
              {FONT_CATEGORIES.map((category) => {
                const categoryMatches = matches.filter(
                  (candidate) => candidate.category === category,
                )
                if (categoryMatches.length === 0) return null
                return (
                  <section key={category} aria-label={FONT_CATEGORY_LABELS[category]}>
                    <p className="sticky top-0 z-20 bg-surface-raised px-2 py-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      {FONT_CATEGORY_LABELS[category]}
                    </p>
                    {categoryMatches.map((candidate) => {
                      const isSelected = candidate.family === family
                      return (
                        <FontOption
                          key={candidate.id}
                          candidate={candidate}
                          isSelected={isSelected}
                          onSelect={() => selectFont(candidate)}
                        />
                      )
                    })}
                  </section>
                )
              })}
            </div>
          </Radix.Content>
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
