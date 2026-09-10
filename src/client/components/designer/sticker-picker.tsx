import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { STICKER_CATALOGUE, STICKER_CATEGORIES } from '../../stickers/catalogue'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

/** Bound mounted art while keeping every catalogue entry reachable by search or paging. */
const STICKERS_PER_PAGE = 40

interface StickerPickerProps {
  selected: string | null
  onChange: (id: string) => void
}

/** Searchable, paged colour artwork with accessible selected-state buttons. */
export function StickerPicker({ selected, onChange }: StickerPickerProps) {
  const { t } = useTranslation()
  const searchId = useId()
  const categoryId = useId()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(0)
  const query = search.trim().toLocaleLowerCase()
  const matches = STICKER_CATALOGUE.filter(
    (sticker) =>
      (category === '' || sticker.category === category) &&
      [sticker.name, ...sticker.keywords].some((word) => word.toLocaleLowerCase().includes(query)),
  )
  const visible = matches.slice(page * STICKERS_PER_PAGE, (page + 1) * STICKERS_PER_PAGE)
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-sm font-medium">{t('designer.stickers.heading')}</legend>
      <p className="text-xs text-ink-muted">{t('designer.stickers.usage')}</p>
      <a
        href="/stickers/USAGE.txt"
        target="_blank"
        rel="noreferrer"
        className="self-start text-xs underline"
      >
        {t('designer.stickers.guide')}
      </a>
      <label htmlFor={searchId} className="text-sm">
        {t('designer.stickers.search')}
      </label>
      <Input
        id={searchId}
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value)
          setPage(0)
        }}
      />
      <label htmlFor={categoryId} className="text-sm">
        {t('designer.stickers.category')}
      </label>
      <select
        id={categoryId}
        value={category}
        className="h-10 min-w-0 rounded-lg border border-line bg-surface-raised px-3 text-sm"
        onChange={(event) => {
          setCategory(event.currentTarget.value)
          setPage(0)
        }}
      >
        <option value="">{t('designer.stickers.all')}</option>
        {STICKER_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <p role="status" className="text-xs text-ink-muted">
        {t('designer.stickers.results', { total: matches.length })}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
        {visible.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            aria-label={t('designer.stickers.choose', { name: sticker.name })}
            aria-pressed={selected === sticker.id}
            title={sticker.name}
            className="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface-raised p-2 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none aria-pressed:border-brand-600 aria-pressed:bg-brand-50 dark:hover:bg-brand-900/40 dark:aria-pressed:bg-brand-900/40"
            onClick={() => onChange(sticker.id)}
          >
            <img
              src={sticker.url}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              className="size-10"
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {t('designer.stickers.previous')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={(page + 1) * STICKERS_PER_PAGE >= matches.length}
          onClick={() => setPage(page + 1)}
        >
          {t('designer.stickers.next')}
        </Button>
      </div>
      <a
        href="/stickers/LICENSE.txt"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-ink-muted underline"
      >
        {t('designer.stickers.license')}
      </a>
    </fieldset>
  )
}
