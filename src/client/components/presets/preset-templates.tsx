import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WATERMARK_TEMPLATES, type WatermarkTemplate } from '../../../shared/watermark-templates'
import { ChoiceGroup } from '../ui/choice-group'
import { Input } from '../ui/input'

const CATEGORIES = [
  { value: 'all', label: 'templates.categories.all' },
  { value: 'documents', label: 'templates.categories.documents' },
  { value: 'review', label: 'templates.categories.review' },
  { value: 'photography', label: 'templates.categories.photography' },
] as const
type Category = (typeof CATEGORIES)[number]['value']

const PREVIEW_FONT_SIZE = 12
const PREVIEW_LINE_HEIGHT = 1.5
const PREVIEW_ADVANCE = 7
const PREVIEW_PADDING = 16
const HALF_TURN = 180

/** Intrinsic SVG bounds scale the complete rotated label uniformly inside any tile. */
function TemplatePreview({ template }: { template: WatermarkTemplate }) {
  const textWidth = template.spec.text.length * PREVIEW_ADVANCE
  const textHeight = PREVIEW_FONT_SIZE * PREVIEW_LINE_HEIGHT
  const angle = (template.spec.style.rotation * Math.PI) / HALF_TURN
  const width =
    Math.abs(Math.cos(angle)) * textWidth + Math.abs(Math.sin(angle)) * textHeight + PREVIEW_PADDING
  const height =
    Math.abs(Math.sin(angle)) * textWidth + Math.abs(Math.cos(angle)) * textHeight + PREVIEW_PADDING
  return (
    <svg
      aria-hidden="true"
      data-template-preview=""
      width={width}
      height={height}
      viewBox={`${String(-width / 2)} ${String(-height / 2)} ${String(width)} ${String(height)}`}
      className="text-ink-muted"
      style={{ maxWidth: '100%', maxHeight: '100%' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <text
        data-template-preview-text=""
        x="0"
        y="0"
        textAnchor="middle"
        dominantBaseline="central"
        textLength={textWidth}
        lengthAdjust="spacingAndGlyphs"
        fontSize={PREVIEW_FONT_SIZE}
        fontWeight="700"
        fill="currentColor"
        transform={`rotate(${String(-template.spec.style.rotation)})`}
      >
        {template.spec.text}
      </text>
    </svg>
  )
}

/** Searchable built-in templates stay available offline and are copied only when the user saves. */
export function PresetTemplates({ onChoose }: { onChoose: (template: WatermarkTemplate) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const needle = query.trim().toLocaleLowerCase()
  const matches = WATERMARK_TEMPLATES.filter(
    (template) =>
      (category === 'all' || template.category === category) &&
      `${t(template.label)} ${template.spec.text}`.toLocaleLowerCase().includes(needle),
  )
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t('templates.heading')}>
      <h2 className="text-sm font-semibold">{t('templates.heading')}</h2>
      <p className="text-xs text-ink-muted">{t('templates.hint')}</p>
      <Input
        type="search"
        aria-label={t('templates.search')}
        placeholder={t('templates.search')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ChoiceGroup
        label={t('templates.category')}
        value={category}
        choices={CATEGORIES.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
        onChange={setCategory}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
        {matches.map((template) => (
          <button
            key={template.id}
            type="button"
            aria-label={t('templates.use', { name: t(template.label) })}
            onClick={() => onChoose(template)}
            className="glass-control flex min-w-0 flex-col overflow-hidden rounded-xl border border-control-line text-ink hover:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="flex h-20 w-full items-center justify-center overflow-hidden bg-surface-raised px-1"
            >
              <TemplatePreview template={template} />
            </span>
            <span className="flex min-h-10 w-full items-center justify-center border-t border-line px-2 py-1 text-center text-xs font-medium">
              {t(template.label)}
            </span>
          </button>
        ))}
      </div>
      {matches.length === 0 ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('templates.empty')}
        </p>
      ) : null}
    </section>
  )
}
