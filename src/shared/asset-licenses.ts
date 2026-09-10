/** Notices apply only to bundled artwork, never to the user's original content. */
import iconLicense from './icon-license.json' with { type: 'json' }
import fluentLicense from './sticker-license.json' with { type: 'json' }
import type { WatermarkSpec } from './watermark'

export const ARTWORK_NOTICE_FILE = 'Lumafoil-artwork-licenses.txt'
export const FLUENT_STICKER_NOTICE = [
  'Lumafoil sticker artwork notice',
  "This notice applies only to Microsoft Fluent Emoji sticker artwork included in this file. It does not claim any rights in the user's original photograph, video, document, logo or text.",
  'Source: https://github.com/microsoft/fluentui-emoji/tree/1ffb34c752ecf5d402f04cfb4b392c77f57c54bc',
  fluentLicense,
].join('\n\n')

const LUCIDE_ICON_NOTICE = [
  'Lumafoil icon artwork notice',
  "This notice applies only to bundled Lucide/Feather icon artwork included in this file. It does not claim any rights in the user's original photograph, video, document, logo or text.",
  'Source: https://lucide.dev/license',
  iconLicense,
].join('\n\n')

/** Return the full applicable notice only when a bundled Fluent sticker is actually selected. */
export function artworkLicenseNotice(specs: readonly WatermarkSpec[]): string | null {
  const notices: string[] = []
  if (specs.some((spec) => spec.kind === 'symbol' && spec.symbol.type === 'sticker'))
    notices.push(FLUENT_STICKER_NOTICE)
  if (specs.some((spec) => spec.kind === 'symbol' && spec.symbol.type === 'icon'))
    notices.push(LUCIDE_ICON_NOTICE)
  return notices.length === 0 ? null : notices.join('\n\n')
}
