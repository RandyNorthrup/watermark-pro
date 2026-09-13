import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TokenMenu } from './token-menu'
import { Button } from '../ui/button'

const SYMBOLS = ['©', '®', '™', '°', '•', '—', '±', '×'] as const

/** Common typographic marks, inserted as plain text at the existing caret. */
export function TextSymbolBar({ onInsert }: { onInsert: (symbol: string) => void }) {
  const { t } = useTranslation()
  const [focusIndex, setFocusIndex] = useState(0)
  return (
    <div
      role="toolbar"
      aria-label={t('designer.text.symbols')}
      className="grid grid-cols-9 gap-0.5 rounded-lg border border-line bg-surface-raised p-1"
      onKeyDown={(event) => {
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
        if (!(event.target instanceof HTMLButtonElement)) return
        const current = [...buttons].indexOf(event.target)
        const destinations: Record<string, number> = {
          ArrowRight: (current + 1) % buttons.length,
          ArrowLeft: (current + buttons.length - 1) % buttons.length,
          Home: 0,
          End: buttons.length - 1,
        }
        const next = destinations[event.key]
        if (next === undefined) return
        event.preventDefault()
        buttons[next]?.focus()
      }}
    >
      {SYMBOLS.map((symbol, index) => (
        <Button
          key={symbol}
          variant="ghost"
          size="icon"
          className="h-8 w-full min-w-0 rounded-md text-base"
          tabIndex={focusIndex === index ? 0 : -1}
          aria-label={t('designer.text.insertSymbol', { symbol })}
          title={t('designer.text.insertSymbol', { symbol })}
          onFocus={() => setFocusIndex(index)}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onInsert(symbol)}
        >
          {symbol}
        </Button>
      ))}
      <TokenMenu
        isCompact
        onInsert={onInsert}
        tabIndex={focusIndex === SYMBOLS.length ? 0 : -1}
        onFocus={() => setFocusIndex(SYMBOLS.length)}
      />
    </div>
  )
}
