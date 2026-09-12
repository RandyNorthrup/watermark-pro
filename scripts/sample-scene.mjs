#!/usr/bin/env node
/**
 * Builds the editor-sized JPEG from the licensed coast photograph used on the
 * landing page. Keep one visual source while serving a small, widely decodable
 * first-paint asset to the editor and rendering worker.
 */
import sharpProcessor from 'sharp'

const SOURCE = 'public/photography/coast-1400.webp'
const OUTPUT = 'public/sample-scene.jpg'
const WIDTH = 960
const HEIGHT = 640
const JPEG_QUALITY = 82

const result = await sharpProcessor(SOURCE)
  .resize(WIDTH, HEIGHT, { fit: 'cover' })
  .jpeg({ quality: JPEG_QUALITY })
  .toFile(OUTPUT)

console.info(`${OUTPUT}: ${String(result.size)} bytes`)
