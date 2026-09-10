/** Rasterize the canonical brand artwork and package the portable brand kit. */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { zipSync } from 'fflate'
import rasterize from 'sharp'

const BRAND_DIR = 'public/brand'
const ICON_SIZES = [64, 120, 192, 256, 512, 1024]
const brandFiles = await readdir(BRAND_DIR)
for (const file of brandFiles) {
  if (file.endsWith('.svg')) {
    await rasterize(path.join(BRAND_DIR, file))
      .png()
      .toFile(path.join(BRAND_DIR, file.replace('.svg', '.png')))
  }
}
for (const size of ICON_SIZES) {
  await rasterize('public/favicon.svg')
    .resize(size, size)
    .png()
    .toFile(path.join(BRAND_DIR, `icon-${String(size)}.png`))
}
for (const size of [192, 512]) {
  await rasterize('public/favicon.svg')
    .resize(size, size)
    .png()
    .toFile(`public/icon-${String(size)}.png`)
}
await rasterize(path.join(BRAND_DIR, 'mark-maskable.svg'))
  .resize(512, 512)
  .png()
  .toFile('public/icon-maskable-512.png')
await rasterize(path.join(BRAND_DIR, 'mark-maskable.svg'))
  .resize(180, 180)
  .png()
  .toFile('public/apple-touch-icon.png')
console.info('Rasterized canonical Lumafoil marks, logos, social artwork and app icons.')

const kitFiles = await readdir(BRAND_DIR, { withFileTypes: true })
const kit = {}
for (const file of kitFiles) {
  if (file.isFile() && !file.name.endsWith('.zip')) {
    kit[file.name] = await readFile(path.join(BRAND_DIR, file.name))
  }
}
await writeFile(path.join(BRAND_DIR, 'lumafoil-brand-kit.zip'), zipSync(kit, { level: 9 }))
console.info(`Packaged ${String(Object.keys(kit).length)} brand files with font license and guide.`)
