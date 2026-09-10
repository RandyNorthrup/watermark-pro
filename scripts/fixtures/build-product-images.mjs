/** Derive responsive images from authentic, full-size product captures. */
import rasterize from 'sharp'

const OUTPUT = 'public/product'
const HERO_WIDTHS = [480, 720, 960, 1440]
const EXAMPLE_WIDTHS = [480, 720, 960]
const WEBP_QUALITY = 85

for (const [name, widths] of [
  ['editor-light', HERO_WIDTHS],
  ['editor-dark', HERO_WIDTHS],
  ...['fonts', 'stickers', 'qr', 'templates'].map((name) => [name, EXAMPLE_WIDTHS]),
]) {
  for (const width of widths) {
    await rasterize(`${OUTPUT}/${name}.webp`)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(`${OUTPUT}/${name}-${String(width)}.webp`)
  }
}
console.info('Generated responsive product images from current full-size captures.')
