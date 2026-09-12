import { useTranslation } from 'react-i18next'

import { StickerPicker } from './sticker-picker'
import type { WatermarkSpec } from '../../../shared/watermark'
import { DEFAULT_FONT_FAMILY } from '../../fonts/catalogue'
import { EMOJI_FONT_STACK, GLYPH_GROUPS, ICON_CATALOGUE, iconToPath } from '../../symbols/catalogue'

type SymbolSource = Extract<WatermarkSpec, { kind: 'symbol' }>['symbol']

/**
 * The font a picked glyph keeps: emoji groups force the colour-emoji stack,
 * an existing text font carries over, and anything else falls back to the
 * default family.
 */
function glyphFontFamily(isEmoji: boolean, symbol: SymbolSource): string {
  if (isEmoji) {
    return EMOJI_FONT_STACK
  }
  if (symbol.type === 'glyph' && symbol.fontFamily !== EMOJI_FONT_STACK) {
    return symbol.fontFamily
  }
  return DEFAULT_FONT_FAMILY
}

interface SymbolPickerProps {
  symbol: SymbolSource
  onChange: (symbol: SymbolSource) => void
}

const ICON_VIEWBOX = 24

const tileClassName =
  'flex size-10 items-center justify-center rounded-lg border border-line bg-surface-raised text-xl hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none aria-pressed:border-brand-500 aria-pressed:bg-brand-50 aria-pressed:text-brand-800 dark:hover:bg-brand-900/40 dark:aria-pressed:bg-brand-900/50 dark:aria-pressed:text-brand-100'

/** Glyph groups and the icon catalogue as pressable tiles. */
export function SymbolPicker({ symbol, onChange }: SymbolPickerProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5">
      <StickerPicker
        selected={symbol.type === 'sticker' ? symbol.id : null}
        onChange={(id) => onChange({ type: 'sticker', id })}
      />
      {GLYPH_GROUPS.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{group.label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {group.glyphs.map((glyph) => (
              <button
                key={glyph}
                type="button"
                aria-label={t('designer.symbol.glyphLabel', { glyph })}
                aria-pressed={symbol.type === 'glyph' && symbol.glyph === glyph}
                className={tileClassName}
                onClick={() => {
                  const fontFamily = glyphFontFamily(group.isEmoji === true, symbol)
                  onChange({ type: 'glyph', glyph, fontFamily })
                }}
              >
                {glyph}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('designer.symbol.icons')}</legend>
        <a
          href="/stickers/ICON-LICENSE.txt"
          target="_blank"
          rel="noreferrer"
          className="self-start text-xs underline"
        >
          {t('designer.symbol.license')}
        </a>
        <div className="flex flex-wrap gap-1.5">
          {ICON_CATALOGUE.map((icon) => (
            <button
              key={icon.name}
              type="button"
              aria-label={t('designer.symbol.iconLabel', { label: icon.label })}
              title={icon.label}
              aria-pressed={symbol.type === 'icon' && symbol.name === icon.name}
              className={tileClassName}
              onClick={() => {
                onChange({ type: 'icon', name: icon.name })
              }}
            >
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${String(ICON_VIEWBOX)} ${String(ICON_VIEWBOX)}`}
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={iconToPath(icon.node)} />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
