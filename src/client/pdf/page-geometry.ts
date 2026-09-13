import type { PDFPage } from 'pdf-lib'

const FULL_TURN = 360
const QUARTER_TURN = 90
const THREE_QUARTER_TURN = 270

/** Matches the reader's visible CropBox and compensates the page's inherited rotation. */
export function pdfPageGeometry(page: PDFPage) {
  const media = page.getMediaBox()
  const crop = page.getCropBox()
  const x = Math.max(media.x, crop.x)
  const y = Math.max(media.y, crop.y)
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y
  const rotation = ((page.getRotation().angle % FULL_TURN) + FULL_TURN) % FULL_TURN
  if (
    !Number.isFinite(width + height + rotation) ||
    width <= 0 ||
    height <= 0 ||
    rotation % QUARTER_TURN !== 0
  )
    throw new RangeError('Invalid PDF page geometry.')
  const isQuarterTurn = rotation % (QUARTER_TURN * 2) !== 0
  return {
    width: isQuarterTurn ? height : width,
    height: isQuarterTurn ? width : height,
    x: rotation === QUARTER_TURN || rotation === QUARTER_TURN * 2 ? x + width : x,
    y: rotation === THREE_QUARTER_TURN || rotation === QUARTER_TURN * 2 ? y + height : y,
    rotation,
  }
}
