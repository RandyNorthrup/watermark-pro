/** Representative final-build layout and composited contrast proof, confined to an isolated local gate. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

import { AxeBuilder } from '@axe-core/playwright'
import { chromium, devices, expect } from '@playwright/test'
import rasterize from 'sharp'

import { auditOrigin, createAuditAccount, fixtureJson } from './audit-accounts.mjs'
import { GUIDANCE_TOPICS } from '../../src/shared/guidance.ts'

const ORIGIN = auditOrigin(process.env.APP_URL ?? 'http://localhost:5273')
const OUTPUT = 'temp/ui-layout-qa'
const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 } },
  phone: devices['Pixel 7'],
}
const TEXT_MINIMUM = 4.5
const CONTROL_MINIMUM = 3
// Sample the immediately adjacent paint. Four pixels can cross the toolbar
// gap and sample the neighboring Export button instead of this control's surface.
const OUTSIDE_SAMPLE_PX = 1
const reports = []

// WCAG 2.2 relative luminance: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
function luminance(rgb) {
  const linear = rgb.slice(0, 3).map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function contrast(first, second) {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function composite(foreground, background) {
  const alpha = foreground[3] / 255
  return foreground
    .slice(0, 3)
    .map((value, index) => value * alpha + background[index] * (1 - alpha))
}

async function pixels(page) {
  const { data, info } = await rasterize(
    await page.screenshot({ scale: 'css', animations: 'disabled' }),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return (x, y) => {
    const px = Math.floor(x)
    const py = Math.floor(y)
    assert.ok(
      px >= 0 && px < info.width && py >= 0 && py < info.height,
      'Contrast sample stays in viewport',
    )
    const offset = (py * info.width + px) * info.channels
    return [...data.subarray(offset, offset + 3)]
  }
}

async function center(locator) {
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
  )
}

/** Parse computed CSS colors through the browser, including color(srgb)/OKLCH colors. */
async function colors(locator, properties) {
  return await locator.evaluate((element, properties) => {
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('Native color conversion is unavailable')
    const style = globalThis.getComputedStyle(element)
    return Object.fromEntries(
      properties.map((property) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = style.getPropertyValue(property)
        ctx.fillRect(0, 0, 1, 1)
        return [property, [...ctx.getImageData(0, 0, 1, 1).data]]
      }),
    )
  }, properties)
}

/** Hide only foreground paint; keep every box/background/gradient/shadow in its real location. */
async function textContrast(page, locator, name) {
  await center(locator)
  const foregroundColors = await colors(locator, ['color'])
  const foreground = foregroundColors.color
  const mask = await locator.evaluate((element) => {
    const rects = []
    const walker = globalThis.document.createTreeWalker(element, globalThis.NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode()) !== null) {
      if (node.textContent.trim() === '' || node.parentElement?.closest('svg') !== null) continue
      const range = globalThis.document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects())
        if (rect.width > 0 && rect.height > 0)
          rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    for (let ancestor = element; ancestor !== null; ancestor = ancestor.parentElement)
      if (Number(globalThis.getComputedStyle(ancestor).opacity) !== 1)
        throw new Error(
          'This text sample has group opacity; it needs a dedicated compositing model',
        )
    const nodes = [element, ...element.querySelectorAll('*')]
    const styles = nodes.map((node) => node.getAttribute('style'))
    for (const node of nodes) {
      node.style.setProperty('color', 'transparent', 'important')
      node.style.setProperty('text-shadow', 'none', 'important')
      if (node instanceof globalThis.SVGElement)
        node.style.setProperty('visibility', 'hidden', 'important')
    }
    return { rects, styles }
  })
  let result
  try {
    assert.ok(mask.rects.length > 0, `${name}: visible text is required`)
    const at = await pixels(page)
    let minimum = Infinity
    let background
    let samples = 0
    for (const rect of mask.rects)
      for (let y = Math.ceil(rect.y + 1); y < rect.y + rect.height - 1; y += 2)
        for (let x = Math.ceil(rect.x + 1); x < rect.x + rect.width - 1; x += 2) {
          const behind = at(x, y)
          const ratio = contrast(composite(foreground, behind), behind)
          samples += 1
          if (ratio < minimum) {
            minimum = ratio
            background = behind
          }
        }
    assert.ok(samples > 0, `${name}: background samples are required`)
    result = {
      name,
      minimum,
      foreground,
      background,
      samples,
      required: TEXT_MINIMUM,
      pass: minimum >= TEXT_MINIMUM,
    }
  } finally {
    await locator.evaluate((element, styles) => {
      const nodes = [element, ...element.querySelectorAll('*')]
      if (nodes.length !== styles.length) throw new Error('Text changed during contrast sampling')
      for (const [index, node] of nodes.entries()) {
        node.toggleAttribute('style', styles[index] !== null)
        if (styles[index] !== null) node.setAttribute('style', styles[index])
      }
    }, mask.styles)
  }
  return result
}

/** Opaque required borders are compared with the real adjacent composited page pixels. */
async function controlEdge(page, locator, name) {
  await center(locator)
  const box = await locator.boundingBox()
  assert.ok(box)
  const edgeColors = await colors(locator, ['border-top-color'])
  const border = edgeColors['border-top-color']
  assert.equal(border[3], 255, `${name}: transparent borders need a separate paint-layer model`)
  const at = await pixels(page)
  const backgrounds = [
    at(box.x + box.width / 2, box.y - OUTSIDE_SAMPLE_PX),
    at(box.x + box.width / 2, box.y + box.height + OUTSIDE_SAMPLE_PX),
    at(box.x - OUTSIDE_SAMPLE_PX, box.y + box.height / 2),
    at(box.x + box.width + OUTSIDE_SAMPLE_PX, box.y + box.height / 2),
  ]
  const minimum = Math.min(...backgrounds.map((background) => contrast(border, background)))
  return {
    name,
    minimum,
    border,
    backgrounds,
    required: CONTROL_MINIMUM,
    pass: minimum >= CONTROL_MINIMUM,
  }
}

async function switchContrast(page, control, checked) {
  await control.setChecked(checked)
  await expect(control).toHaveAttribute('aria-checked', String(checked))
  await center(control)
  await control.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    )
  })
  const track = await control.boundingBox()
  const knob = await control.locator('span').boundingBox()
  assert.ok(track && knob)
  const at = await pixels(page)
  const thumb = at(knob.x + knob.width / 2, knob.y + knob.height / 2)
  const trackColor = at(
    knob.x + knob.width / 2 > track.x + track.width / 2 ? track.x + 8 : track.x + track.width - 8,
    track.y + track.height / 2,
  )
  const minimum = contrast(thumb, trackColor)
  return [
    {
      name: `switch-${checked ? 'on' : 'off'}-knob`,
      minimum,
      thumb,
      trackColor,
      required: CONTROL_MINIMUM,
      pass: minimum >= CONTROL_MINIMUM,
    },
    await controlEdge(page, control, `switch-${checked ? 'on' : 'off'}-edge`),
  ]
}

async function layout(page, profile) {
  const header = page.locator('header.glass-chrome')
  await page.evaluate(() => globalThis.scrollTo({ top: 0, behavior: 'instant' }))
  const before = await header.boundingBox()
  await page.evaluate(() => globalThis.scrollBy({ top: 180, behavior: 'instant' }))
  const after = await header.boundingBox()
  const scroll = await page.evaluate(() => globalThis.scrollY)
  assert.ok(before && after && scroll > 100, 'Fixture must scroll the actual page')
  assert.ok(Math.abs(before.y - after.y - scroll) < 1, 'Header must move with the page')

  const canvas = page.getByRole('region', { name: 'Canvas', exact: true })
  const tools = page.locator('[data-toolbox-scroll]')
  async function heights() {
    return await tools.evaluate((toolbox) => {
      const stage = globalThis.document.querySelector('[aria-label="Canvas"][role="region"]')
      if (stage === null) throw new Error('Canvas missing')
      let common = stage.parentElement
      while (common !== null && !common.contains(toolbox)) common = common.parentElement
      if (common === null) throw new Error('Independent editor columns missing')
      const canvas = [...common.children].find((child) => child.contains(stage))
      const tool = [...common.children].find((child) => child.contains(toolbox))
      if (canvas === undefined || tool === undefined || canvas === tool)
        throw new Error('Canvas and tools are not separate columns')
      return {
        canvas: canvas.getBoundingClientRect().height,
        tools: tool.getBoundingClientRect().height,
      }
    })
  }
  await expect(canvas).toBeVisible()
  const full = await heights()
  await page.getByRole('tab', { name: 'Resize', exact: true }).click()
  const short = await heights()
  assert.ok(
    Math.abs(full.tools - short.tools) > 10,
    'Tool content must change its own container height',
  )
  assert.ok(
    Math.abs(full.canvas - short.canvas) < 1,
    `Tool content must not stretch the canvas container: ${JSON.stringify({ full, short })}`,
  )
  await page.getByRole('tab', { name: 'Watermark', exact: true }).click()
  const text = page.getByRole('textbox', { name: 'Text', exact: true })
  const attached = await text.evaluate(
    (element) => element.parentElement?.querySelector('[role="toolbar"]') !== null,
  )
  assert.ok(attached, 'Symbols toolbar belongs to the textbox container')
  await expect(text).toHaveAccessibleDescription('Up to 120 characters.')
  const controls = page.getByRole('group', { name: 'Canvas view', exact: true })
  const geometry = await controls.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const parent = element.parentElement.getBoundingClientRect()
    return { width: box.width, offset: box.x + box.width / 2 - parent.x - parent.width / 2 }
  })
  assert.ok(
    geometry.width <= 768 && Math.abs(geometry.offset) <= 1,
    'Zoom/grid group must stay compact and centered',
  )
  if (profile === 'phone') await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const status = page.getByRole('region', { name: 'Offline work', exact: true }).getByRole('status')
  await expect(status).toHaveCSS('white-space', 'nowrap')
  const oneLine = await status.evaluate(
    (element) =>
      element.getBoundingClientRect().height <=
      Number(globalThis.getComputedStyle(element).lineHeight.slice(0, -2)) + 1,
  )
  assert.ok(oneLine, 'Synchronization information must occupy one line')
  if (profile === 'phone')
    await page.getByRole('button', { name: 'Close menu', exact: true }).click()
  return {
    headerScroll: scroll,
    full,
    short,
    zoomGrid: geometry,
    attachedToolbar: true,
    oneLineSync: true,
  }
}

async function runProfile(browser, profile, theme) {
  const actor = await createAuditAccount(ORIGIN, 'Layout Contrast QA')
  let context
  let page
  try {
    for (const topic of GUIDANCE_TOPICS)
      await fixtureJson(await actor.context.post('/api/me/guidance/claim', { data: { topic } }))
    context = await browser.newContext({
      baseURL: ORIGIN,
      colorScheme: theme,
      ...PROFILES[profile],
      storageState: await actor.context.storageState(),
    })
    page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    await page.goto('/app/editor')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Studio Signature')
    const preview = page.getByRole('img', { name: 'Photo with the watermark applied', exact: true })
    await expect(preview).toBeVisible()
    await expect.poll(() => preview.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByRole('status', { name: 'Rendering preview' })).toHaveCount(0)
    await page.evaluate(() => globalThis.document.fonts.ready)
    const record = { profile, theme, layout: await layout(page, profile), contrast: [], errors }
    reports.push(record)
    const samples = [
      ['primary-export', page.getByRole('button', { name: 'Save Image', exact: true })],
      ['secondary-new', page.getByRole('button', { name: 'New', exact: true })],
      ['selected-watermark', page.getByRole('tab', { name: 'Watermark', exact: true })],
      ['unselected-saved', page.getByRole('tab', { name: 'Saved', exact: true })],
      ['helper-limit', page.locator('.watermark-text-field > p:visible')],
    ]
    for (const [name, locator] of samples)
      record.contrast.push(await textContrast(page, locator, name))
    record.contrast.push(
      await controlEdge(page, samples[1][1], 'secondary-new-edge'),
      await controlEdge(page, page.locator('.watermark-text-input'), 'text-input-edge'),
    )
    const grid = page.getByRole('switch', { name: 'Grid', exact: true })
    record.contrast.push(
      ...(await switchContrast(page, grid, false)),
      ...(await switchContrast(page, grid, true)),
    )
    await grid.setChecked(false)

    const primary = samples[0][1]
    const original = await primary.getAttribute('style')
    try {
      await primary.evaluate((element) => {
        element.style.setProperty('color', '#ffffff', 'important')
        element.style.setProperty('background', 'linear-gradient(#e1a6b7, #c86b82)', 'important')
      })
      const negative = await textContrast(page, primary, 'old-pale-gradient-negative-control')
      assert.ok(!negative.pass, 'The known low-contrast old gradient must be rejected')
      record.negativeControl = negative
    } finally {
      await primary.evaluate((element, original) => {
        element.toggleAttribute('style', original !== null)
        if (original !== null) element.setAttribute('style', original)
      }, original)
    }
    assert.equal(
      await primary.getAttribute('style'),
      original,
      'Negative control must restore the exact original element style',
    )
    record.contrast.push(await textContrast(page, primary, 'primary-export-restored'))
    await page.evaluate(() => globalThis.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `${OUTPUT}/${profile}-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await center(page.getByRole('tab', { name: 'Watermark', exact: true }))
    await page.screenshot({
      path: `${OUTPUT}/${profile}-${theme}-tools.png`,
      animations: 'disabled',
    })
    const axe = await new AxeBuilder({ page }).analyze()
    record.axe = axe.violations.map(({ id, impact }) => ({ id, impact }))
    record.horizontalOverflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    )
    record.pass =
      record.contrast.every((item) => item.pass) &&
      record.axe.length === 0 &&
      errors.length === 0 &&
      record.horizontalOverflow <= 0
  } catch (error) {
    if (page !== undefined)
      await page.screenshot({
        path: `${OUTPUT}/${profile}-${theme}-failed.png`,
        fullPage: true,
        animations: 'disabled',
      })
    throw error
  } finally {
    await context?.close()
    await actor.context.dispose()
  }
}

await mkdir(OUTPUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const profile of Object.keys(PROFILES))
    for (const theme of ['light', 'dark']) {
      try {
        await runProfile(browser, profile, theme)
      } catch (error) {
        reports.push({ profile, theme, pass: false, failure: error.message })
      }
    }
} finally {
  await browser.close()
  await writeFile(
    `${OUTPUT}/report.json`,
    JSON.stringify(
      {
        method:
          'Computed foreground colors over PNG-sampled real composited backgrounds with text paint temporarily hidden; no antialiased glyph colors used. Opaque required edges compare with actual adjacent backgrounds. Switch knob/track use interior painted pixels. Four representative theme/device states, not a whole-app WCAG certification. Artwork, disabled controls, forced colors and group-opacity text require separate review. Every temporary style mutation is restored before axe.',
        reports,
      },
      null,
      2,
    ),
  )
}
assert.ok(
  reports.length === 4 && reports.every((record) => record.pass),
  `Final UI layout/contrast checks failed; inspect ${OUTPUT}/report.json`,
)
console.info('Four final UI layout, contrast, negative-control and axe states passed.')
