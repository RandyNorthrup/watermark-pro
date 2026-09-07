import { ChevronDown } from 'lucide-react'

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

/** Plain names for each placeholder; the raw token is shown beside it. */
const TOKEN_LABELS: Record<TextToken, string> = {
  '{date}': 'Date',
  '{time}': 'Time',
  '{taken}': 'Capture date and time',
  '{filename}': 'File name',
  '{camera}': 'Camera',
  '{lens}': 'Lens',
  '{iso}': 'ISO',
  '{aperture}': 'Aperture',
  '{shutter}': 'Shutter speed',
  '{focal}': 'Focal length',
  '{location}': 'Location (GPS)',
  '{index}': 'Photo number',
  '{count}': 'Photo count',
  '{width}': 'Width',
  '{height}': 'Height',
}

/** A menu that inserts a text token (camera field, date, batch position) at the caret. */
export function TokenMenu({ onInsert }: TokenMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 self-start rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-muted hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none dark:hover:bg-brand-900/40"
        >
          Insert detail
          <ChevronDown aria-hidden="true" className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Photo details</DropdownMenuLabel>
        {TEXT_TOKENS.map((token) => (
          <DropdownMenuItem
            key={token}
            onSelect={() => {
              onInsert(token)
            }}
          >
            <span className="flex-1">{TOKEN_LABELS[token]}</span>
            <code className="text-xs text-ink-muted">{token}</code>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
