import type { OutputFormat } from '../../engine/encode'
import type { SelectOption } from '../ui/select'

export const FORMAT_OPTIONS: readonly SelectOption<OutputFormat>[] = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
]

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
