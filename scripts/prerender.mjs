#!/usr/bin/env node
/**
 * Prerender the landing page to static, per-locale HTML (PLAN.md §5.5 §1). The
 * landing is the front door and is translated into every shipped language, so a
 * plain SPA paints nothing until ~190 kB of JS runs. Here it is rendered once
 * per locale in a real browser, the application bundle is stripped, and the
 * result is written as a static page that paints instantly and ships almost no
 * JavaScript — while the Worker (src/worker/routes/landing.ts) serves the right
 * language from the `watermark-pro-locale` cookie or `Accept-Language`.
 *
 * The two interactive controls degrade to no-JS equivalents: the theme toggle
 * is dropped (the inline theme script still applies the stored/system theme),
 * and the language menu becomes a native `<details>` disclosure whose links
 * (`/?lang=xx`) the Worker honours. The React landing stays the single source
 * of the markup, so the static pages can never drift from it.
 *
 * Run against a preview that is already listening on APP_URL:
 *   npm run build && npm run db:migrate:local && npm run preview
 * then, in another terminal:
 *   node scripts/prerender.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'
import { JSDOM } from 'jsdom'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5273'
const OUTPUT_DIR = path.join('dist', 'client', 'landing')
const LOCALES_DIR = path.join('src', 'client', 'locales')

/**
 * Mirrors SUPPORTED_LOCALES in src/shared/locales.ts (a `.mjs` script cannot
 * import the `.ts` source). Checked against the catalogue directories below, so
 * adding a language without updating this table fails the run loudly.
 */
const LOCALES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'pt-BR', name: 'Português (Brasil)', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'zh-Hans', name: '简体中文', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
]

async function assertLocalesMatchCatalogues() {
  const entries = await readdir(LOCALES_DIR, { withFileTypes: true })
  const onDisk = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  const declared = new Set(LOCALES.map((locale) => locale.code))
  const missing = [...onDisk.difference(declared)]
  const extra = [...declared.difference(onDisk)]
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `prerender LOCALES out of sync with ${LOCALES_DIR}: missing ${missing.join(', ') || '—'}; extra ${extra.join(', ') || '—'}`,
    )
  }
}

/** Builds the no-JS `<details>` language switcher that replaces the React menu. */
function buildLanguageSwitcher(document, activeCode) {
  const details = document.createElement('details')
  details.className = 'wm-lang'
  details.setAttribute('style', 'position:relative')
  const summary = document.createElement('summary')
  summary.setAttribute(
    'style',
    'list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;padding:.5rem .75rem;border:1px solid var(--color-line);border-radius:.5rem',
  )
  const active = LOCALES.find((locale) => locale.code === activeCode) ?? LOCALES[0]
  summary.textContent = `🌐 ${active.name}`
  details.append(summary)
  const list = document.createElement('ul')
  list.setAttribute(
    'style',
    'position:absolute;inset-inline-end:0;margin-top:.35rem;padding:.35rem;list-style:none;background:var(--color-surface-raised);border:1px solid var(--color-line);border-radius:.5rem;box-shadow:var(--shadow-card);z-index:10;min-width:11rem',
  )
  for (const locale of LOCALES) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.setAttribute('href', `/?lang=${encodeURIComponent(locale.code)}`)
    link.setAttribute('hreflang', locale.code)
    link.setAttribute(
      'style',
      'display:block;padding:.4rem .6rem;border-radius:.35rem;color:inherit',
    )
    if (locale.code === activeCode) {
      link.setAttribute('aria-current', 'true')
    }
    link.textContent = locale.name
    item.append(link)
    list.append(item)
  }
  details.append(list)
  return details
}

/** Turns the rendered SPA HTML into a static, near-JS-free landing page. */
function toStaticHtml(html, locale) {
  const dom = new JSDOM(html)
  const { document } = dom.window

  for (const script of document.querySelectorAll('script[src]')) {
    script.remove()
  }
  for (const preload of document.querySelectorAll('link[rel="modulepreload"]')) {
    preload.remove()
  }
  for (const style of document.querySelectorAll('style')) {
    if (style.textContent?.includes('wm-skeleton') === true) {
      style.remove()
    }
  }
  // The static landing has no JavaScript, so the React theme toggle can't work;
  // replace it with the no-JS `<details>` language switcher (the inline theme
  // script still applies the stored or system theme). The toggle sits in the
  // landing header, which is exactly where the switcher belongs.
  for (const toggle of document.querySelectorAll('[data-prerender="theme-toggle"]')) {
    toggle.replaceWith(buildLanguageSwitcher(document, locale.code))
  }
  // The inline theme script is the sole authority for the resolved theme on the
  // client; drop the value the prerender browser happened to resolve.
  delete document.documentElement.dataset.theme
  document.documentElement.setAttribute('lang', locale.code)
  document.documentElement.setAttribute('dir', locale.dir)
  return `<!doctype html>\n${document.documentElement.outerHTML}\n`
}

async function prerender() {
  await assertLocalesMatchCatalogues()
  await mkdir(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const locale of LOCALES) {
      const context = await browser.newContext()
      await context.addInitScript((code) => {
        try {
          localStorage.setItem('watermark-pro:locale', code)
        } catch {
          /* storage may be unavailable */
        }
      }, locale.code)
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
      // The landing has rendered once its features heading is present.
      await page.locator('#features-heading').waitFor()
      const html = await page.content()
      await context.close()
      const staticHtml = toStaticHtml(html, locale)
      await writeFile(path.join(OUTPUT_DIR, `${locale.code}.html`), staticHtml)
      console.info(`prerendered ${locale.code} (${(staticHtml.length / 1024).toFixed(1)} kB)`)
    }
  } finally {
    await browser.close()
  }
  console.info(`landing pages written to ${OUTPUT_DIR}`)
}

await prerender()
