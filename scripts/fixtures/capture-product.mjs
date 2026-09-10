#!/usr/bin/env node
/** Capture authentic product screenshots using disposable local API fixtures and the real editor. */
import { mkdir } from 'node:fs/promises'

import { chromium } from '@playwright/test'
import rasterize from 'sharp'

import { waitForLink } from '../lib/dev-mailbox.mjs'

const ORIGIN = 'http://localhost:5273'
const OUTPUT = 'public/product'
const VIEWPORT = { width: 1440, height: 980 }
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
  }
  await setShowcaseTheme('light')
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
  await page.waitForURL('**/app')
  const workspace = await post('/api/me/workspace', {})
  const organization = { id: workspace.organizationId }
  const preset = await post(`/api/orgs/${organization.id}/watermarks`, {
    name: 'Studio signature',
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
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open photo', exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles('public/photography/coast-1400.webp')
  await page.getByRole('group', { name: /Watermark position/ }).waitFor()
  await page.waitForLoadState('networkidle')
  await page
    .getByText('App files are ready for offline use.', { exact: true })
    .waitFor({ timeout: 90_000 })
  await mkdir(OUTPUT, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await setShowcaseTheme(theme)
    await page.getByRole('img', { name: 'Photo with the watermark applied' }).waitFor()
    const screenshot = await page.screenshot({ animations: 'disabled' })
    await rasterize(screenshot).webp({ quality: 88 }).toFile(`${OUTPUT}/editor-${theme}.webp`)
  }
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
  const qrChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open photo', exact: true }).click()
  const qrChooser = await qrChooserPromise
  await qrChooser.setFiles('public/photography/coast-1400.webp')
  const renderedQr = page.getByRole('img', {
    name: 'Photo with the watermark applied',
    exact: true,
  })
  await renderedQr.waitFor()
  await rasterize(await renderedQr.screenshot())
    .resize(960, 720, { fit: 'contain', background: '#fbf9f7' })
    .webp({ quality: 95 })
    .toFile(`${OUTPUT}/qr.webp`)
  await page.goto(`${ORIGIN}/app/library`)
  await page.getByRole('heading', { name: 'Watermark library', exact: true }).waitFor()
  await page.getByText('Website QR', { exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  await rasterize(await page.getByRole('main').screenshot())
    .resize(960, 720, { fit: 'contain', background: '#fbf9f7' })
    .webp({ quality: 90 })
    .toFile(`${OUTPUT}/templates.webp`)
  await import('./build-product-images.mjs')
  console.info('Captured real Lumafoil editor, QR photo and saved-preset library.')
} finally {
  await browser.close()
}
