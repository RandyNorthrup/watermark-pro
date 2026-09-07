#!/usr/bin/env node
/**
 * Renders the built-in sample scene (src/client/lib/sample-photo.ts) to
 * public/sample-scene.jpg. The editor and designer show that file while the
 * engine renders its first frame, so the preview area paints with the page
 * (a canvas is not a largest-contentful-paint candidate; an image is).
 * `preview.browser.test.ts` checks the file still matches the drawing.
 *
 * Rerun after changing the scene: node scripts/sample-scene.mjs
 *
 * The drawing module is the real one: its types are stripped with Node's
 * own stripper and the result runs in a headless Chromium page, so there is
 * one definition of the scene.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

import { chromium } from '@playwright/test'

const SOURCE = 'src/client/lib/sample-photo.ts'
const OUTPUT = 'public/sample-scene.jpg'
const JPEG_QUALITY = 0.82

const source = stripTypeScriptTypes(readFileSync(SOURCE, 'utf8'))
// Plain script for the page: no module syntax, and the scene's exports
// become locals the snippet below can reach.
const script = source
  .replaceAll(/^import .*$/gm, '')
  .replaceAll(/^export (async )?function/gm, '$1function')
  .replaceAll(/^export const/gm, 'const')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  // Evaluated as a string so the browser-side code is not a Node closure.
  const dataUrl = await page.evaluate(`(() => {
    const canvas = document.createElement('canvas')
    ${script}
    canvas.width = SAMPLE_PHOTO_WIDTH
    canvas.height = SAMPLE_PHOTO_HEIGHT
    drawSamplePhoto(canvas.getContext('2d'), canvas)
    return canvas.toDataURL('image/jpeg', ${String(JPEG_QUALITY)})
  })()`)
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
  writeFileSync(OUTPUT, bytes)
  console.info(`${OUTPUT}: ${String(bytes.length)} bytes`)
} finally {
  await browser.close()
}
