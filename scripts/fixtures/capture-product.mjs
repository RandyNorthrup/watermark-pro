#!/usr/bin/env node
/** Capture authentic product screenshots using disposable local API fixtures and the real editor. */
import { mkdir } from 'node:fs/promises'

import { chromium, expect } from '@playwright/test'
import rasterize from 'sharp'

import { GUIDANCE_TOPICS } from '../../src/shared/guidance.ts'
import { waitForLink } from '../lib/dev-mailbox.mjs'

const ORIGIN = 'http://localhost:5273'
const OUTPUT = 'public/product'
const VIEWPORT = { width: 1920, height: 1200 }
const HERO_OUTPUT = { width: 1440, height: 900 }
const TEXT_STYLE = {
  opacity: 0.85,
  rotation: 0,
  scale: 0.3,
  margin: 0.04,
  tiling: { enabled: false, spacing: 1.5 },
  backdrop: { enabled: false, opacity: 0.6 },
}
const fixtureId = Date.now().toString(36)
const email = `product-${fixtureId}@example.test`
const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: 'en-US',
    colorScheme: 'light',
  })
  const page = await context.newPage()
  const display = await context.newCDPSession(page)
  async function setShowcaseTheme(theme) {
    // Marketing demonstrates glass mode; separate device audits retain the host's
    // reduced-transparency preference and verify its intentionally solid fallback.
    await display.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-transparency', value: 'no-preference' },
      ],
    })
    if (page.url().startsWith(ORIGIN))
      await page.waitForFunction(
        (resolved) => globalThis.document.documentElement.dataset.theme === resolved,
        theme,
      )
  }
  await setShowcaseTheme('light')
  async function captureTiles(choices, count, name) {
    const available = await choices.all()
    const tiles = available.slice(0, count)
    if (tiles.length !== count) throw new Error(`Missing ${name} capture tiles`)
    await tiles[0].scrollIntoViewIfNeeded()
    const bounds = await Promise.all(tiles.map((tile) => tile.boundingBox()))
    if (bounds.includes(null)) throw new Error(`Hidden ${name} capture tiles`)
    const x = Math.min(...bounds.map((box) => box.x))
    const y = Math.min(...bounds.map((box) => box.y))
    const right = Math.max(...bounds.map((box) => box.x + box.width))
    const bottom = Math.max(...bounds.map((box) => box.y + box.height))
    await rasterize(
      await page.screenshot({
        clip: { x, y, width: right - x, height: bottom - y },
        animations: 'disabled',
      }),
    )
      .resize(960, 720, { fit: 'contain', background: '#fbf9f7' })
      .webp({ quality: 90 })
      .toFile(`${OUTPUT}/${name}.webp`)
  }
  async function post(path, data) {
    const response = await context.request.post(`${ORIGIN}${path}`, {
      headers: { origin: ORIGIN },
      data,
    })
    if (!response.ok()) throw new Error(`Product fixture ${path} failed: ${response.status()}`)
    return await response.json()
  }
  await post('/api/auth/sign-up/email', {
    name: 'Lumafoil Studio',
    email,
    password: 'product screenshot fixture password',
    callbackURL: '/app',
  })
  const link = await waitForLink(
    async () => {
      const response = await context.request.get(`${ORIGIN}/api/dev/mailbox`)
      return await response.json()
    },
    email,
    '/api/auth/verify-email',
  )
  await page.goto(link)
  await page.waitForURL('**/app/editor')
  const workspace = await post('/api/me/workspace', {})
  const organization = { id: workspace.organizationId }
  for (const topic of GUIDANCE_TOPICS) await post('/api/me/guidance/claim', { topic })
  const preset = await post(`/api/orgs/${organization.id}/watermarks`, {
    name: 'Studio Signature',
    spec: {
      kind: 'text',
      text: 'Lumafoil Studio',
      fontFamily: 'Cormorant Garamond',
      fontWeight: 500,
      letterSpacing: 0,
      curve: 0,
      effect: 'solid',
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: TEXT_STYLE,
    },
  })
  await page.goto(`${ORIGIN}/app/editor?preset=${preset.id}`)
  // Wait for the selected saved design before opening its showcase photo.
  // Navigation becoming interactive does not mean its saved designs have arrived.
  await page.getByRole('group', { name: /Watermark position/ }).waitFor()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open Photo$/i }).click()
  const chooser = await chooserPromise
  await chooser.setFiles('public/photography/coast-1400.webp')
  await page.getByRole('group', { name: /Watermark position/ }).waitFor()
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('region', { name: 'Offline work', exact: true }).getByRole('status'),
  ).toHaveAttribute('title', /App files are ready for offline use\.$/, { timeout: 90_000 })
  await mkdir(OUTPUT, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await setShowcaseTheme(theme)
    await page.getByRole('img', { name: 'Photo with the watermark applied' }).waitFor()
    const screenshot = await page.screenshot({ animations: 'disabled' })
    await rasterize(screenshot)
      .resize(HERO_OUTPUT.width, HERO_OUTPUT.height)
      .webp({ quality: 88 })
      .toFile(`${OUTPUT}/editor-${theme}.webp`)
  }
  await setShowcaseTheme('light')
  await page.getByRole('tab', { name: /^Watermark$/i }).click()
  await page.getByRole('combobox', { name: /^Font$/i }).click()
  const fontMenu = page.getByRole('dialog', { name: /^Font$/i })
  await fontMenu.waitFor()
  await fontMenu.getByRole('searchbox', { name: /^Search Fonts$/i }).fill('Cormorant Garamond')
  await fontMenu.getByRole('option', { name: 'Cormorant Garamond', exact: true }).click()
  await page.getByRole('combobox', { name: /^Font$/i }).click()
  await fontMenu.waitFor()
  await fontMenu.getByRole('searchbox', { name: /^Search Fonts$/i }).fill('')
  await page.waitForFunction(() => {
    const menu = globalThis.document.querySelector('[role="dialog"]')
    if (menu === null) return false
    const menuBounds = menu.getBoundingClientRect()
    return [...menu.querySelectorAll('[data-font-preview]')]
      .filter((option) => option.getBoundingClientRect().top < menuBounds.bottom)
      .every((option) =>
        [...globalThis.document.fonts].some(
          (face) =>
            face.family.replaceAll(/['"]/g, '') === option.dataset.fontFamily &&
            face.status === 'loaded',
        ),
      )
  })
  await rasterize(await fontMenu.screenshot({ animations: 'disabled' }))
    .resize(960, 720, { fit: 'contain', background: '#fbf9f7' })
    .webp({ quality: 90 })
    .toFile(`${OUTPUT}/fonts.webp`)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /^Symbol$/i }).click()
  const stickers = page.getByRole('group', { name: /^Color Stickers$/i })
  await stickers
    .getByRole('button', { name: /^Choose /i })
    .first()
    .waitFor()
  await page.waitForLoadState('networkidle')
  await captureTiles(stickers.getByRole('button', { name: /^Choose /i }), 20, 'stickers')
  const qr = await post(`/api/orgs/${organization.id}/watermarks`, {
    name: 'Website QR',
    spec: {
      kind: 'qr',
      content: 'https://lumafoil.com',
      placement: { mode: 'anchor', anchor: 'bottom-right' },
      contrast: { mode: 'auto' },
      style: { ...TEXT_STYLE, opacity: 1 },
    },
  })
  await post(`/api/orgs/${organization.id}/watermarks`, {
    name: 'Brand name',
    spec: {
      kind: 'text',
      text: 'LUMAFOIL',
      fontFamily: 'Inter Variable',
      fontWeight: 600,
      letterSpacing: 0.04,
      curve: 0,
      effect: 'solid',
      placement: { mode: 'anchor', anchor: 'bottom-right' },
      contrast: { mode: 'auto' },
      style: TEXT_STYLE,
    },
  })
  await setShowcaseTheme('light')
  await page.goto(`${ORIGIN}/app/editor?preset=${qr.id}`)
  await page.getByRole('group', { name: /Watermark position/ }).waitFor()
  const qrChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Open Photo$/i }).click()
  const qrChooser = await qrChooserPromise
  await qrChooser.setFiles('public/photography/coast-1400.webp')
  const renderedQr = page.getByRole('img', {
    name: 'Photo with the watermark applied',
    exact: true,
  })
  await renderedQr.waitFor()
  await page.waitForLoadState('networkidle')
  await rasterize(await renderedQr.screenshot({ animations: 'disabled' }))
    .resize(960, 720, { fit: 'contain', background: '#fbf9f7' })
    .webp({ quality: 95 })
    .toFile(`${OUTPUT}/qr.webp`)
  await page.getByRole('tab', { name: /^Presets$/i }).click()
  const templates = page.getByRole('region', { name: 'Presets', exact: true })
  await templates.waitFor()
  await page.waitForLoadState('networkidle')
  await captureTiles(templates.getByRole('button', { name: /^Use / }), 6, 'templates')
  await import('./build-product-images.mjs')
  console.info(
    'Captured the current Image editor, font picker, sticker browser, QR photo and templates.',
  )
} finally {
  await browser.close()
}
