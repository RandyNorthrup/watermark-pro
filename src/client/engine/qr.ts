/**
 * QR code marks: the module matrix for a piece of content, from a
 * dependency-free encoder. Level M error correction (15 % recovery) is the
 * usual trade-off between density and resilience for a code printed over
 * a photograph.
 */
import qrcode from 'qrcode-generator'

/** Automatic version: the smallest that fits the content. */
const AUTO_VERSION = 0
const ERROR_CORRECTION = 'M'

// The encoder's default byte mapping stops at Latin-1; content is UTF-8.
qrcode.stringToBytes = (text: string) => [...new TextEncoder().encode(text)]

export interface QrMatrix {
  /** Modules per side. */
  size: number
  isDark(row: number, column: number): boolean
}

export function qrMatrix(content: string): QrMatrix {
  const code = qrcode(AUTO_VERSION, ERROR_CORRECTION)
  code.addData(content, 'Byte')
  code.make()
  return { size: code.getModuleCount(), isDark: (row, column) => code.isDark(row, column) }
}
