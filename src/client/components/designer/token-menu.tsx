import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TEXT_TOKENS, type TextToken } from '../../../shared/watermark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface TokenMenuProps {
  onInsert: (token: TextToken) => void
}

/** Catalogue keys for each placeholder's plain name; the raw token is shown beside it. */
const TOKEN_LABELS = {
  '{date}': 'designer.tokens.date',
  '{time}': 'designer.tokens.time',
  '{taken}': 'designer.tokens.taken',
  '{filename}': 'designer.tokens.filename',
  '{camera}': 'designer.tokens.camera',
  '{lens}': 'designer.tokens.lens',
  '{iso}': 'designer.tokens.iso',
  '{aperture}': 'designer.tokens.aperture',
  '{shutter}': 'designer.tokens.shutter',
  '{focal}': 'designer.tokens.focal',
  '{location}': 'designer.tokens.location',
  '{index}': 'designer.tokens.index',
  '{count}': 'designer.tokens.count',
  '{width}': 'designer.tokens.width',
  '{height}': 'designer.tokens.height',
} as const satisfies Record<TextToken, string>

/** A menu that inserts a text token (camera field, date, batch position) at the caret. */
export function TokenMenu({ onInsert }: TokenMenuProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 self-start rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-muted hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none dark:hover:bg-brand-900/40"
        >
          {t('designer.tokens.menu')}
          <ChevronDown aria-hidden="true" className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{t('designer.tokens.heading')}</DropdownMenuLabel>
        {TEXT_TOKENS.map((token) => (
          <DropdownMenuItem
            key={token}
            onSelect={() => {
              onInsert(token)
            }}
          >
            <span className="flex-1">{t(TOKEN_LABELS[token])}</span>
            <code className="text-xs text-ink-muted">{token}</code>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
