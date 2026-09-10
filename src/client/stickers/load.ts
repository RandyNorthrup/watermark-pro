import { findSticker } from './catalogue'

/** Vector artwork is rasterized at export quality, independently of its 32px design grid. */
const STICKER_RASTER_SIDE = 2048

/** Decode trusted same-origin art into a fresh transferable bitmap. */
export async function loadSticker(id: string): Promise<ImageBitmap> {
  const sticker = findSticker(id)
  if (sticker === undefined) throw new Error('Unknown sticker')
  const image = new Image()
  image.src = sticker.url
  await image.decode()
  const canvas = new OffscreenCanvas(STICKER_RASTER_SIDE, STICKER_RASTER_SIDE)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Sticker rendering is unavailable')
  context.drawImage(image, 0, 0, STICKER_RASTER_SIDE, STICKER_RASTER_SIDE)
  return canvas.transferToImageBitmap()
}
