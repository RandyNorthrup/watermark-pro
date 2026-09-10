#!/usr/bin/env node
/** Render every supported landing locale from the canonical React component, without a server or credentials. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { JSDOM } from 'jsdom'

const OUTPUT_DIR = path.join('dist', 'client', 'landing')
const LOCALES_DIR = path.join('src', 'client', 'locales')
const CLIENT_ASSETS_DIR = path.join('dist', 'client', 'assets')
const INTER_FONT_PATTERN = /^inter-latin-wght-normal-[A-Za-z0-9_-]+\.woff2$/
const rendererPath = path.resolve('dist', 'prerender', 'entry.mjs')
const { locales, renderPublicPage } = await import(pathToFileURL(rendererPath).href)
const shell = await readFile(path.join('dist', 'client', 'index.html'), 'utf8')
const clientAssets = await readdir(CLIENT_ASSETS_DIR)
const interFonts = clientAssets.filter((name) => INTER_FONT_PATTERN.test(name))
if (interFonts.length !== 1 || interFonts[0] === undefined)
  throw new Error('Prerender requires exactly one built Inter variable font.')
const interFontUrl = `/assets/${interFonts[0]}`

const entries = await readdir(LOCALES_DIR, { withFileTypes: true })
const onDisk = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
const declared = new Set(locales.map((locale) => locale.code))
if (onDisk.difference(declared).size > 0 || declared.difference(onDisk).size > 0) {
  throw new Error('Prerender locale inventory does not match the shipped catalogues.')
}

function languageSwitcher(document, activeCode, label) {
  const details = document.createElement('details')
  details.className = 'relative'
  const summary = document.createElement('summary')
  summary.className =
    'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm'
  summary.setAttribute('aria-label', label)
  summary.textContent = locales.find((locale) => locale.code === activeCode).name
  details.append(summary)
  const list = document.createElement('ul')
  list.className =
    'absolute end-0 z-10 mt-2 min-w-48 rounded-lg border border-line bg-surface-raised p-2 shadow-card'
  for (const locale of locales) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `/?lang=${encodeURIComponent(locale.code)}`
    link.hreflang = locale.code
    link.className =
      'block min-h-11 rounded-md px-3 py-3 text-sm hover:bg-brand-50 dark:hover:bg-brand-900/40'
    if (locale.code === activeCode) link.setAttribute('aria-current', 'true')
    link.textContent = locale.name
    item.append(link)
    list.append(item)
  }
  details.append(list)
  return details
}

function staticHtml(content, locale, pathname) {
  const dom = new JSDOM(shell)
  const { document } = dom.window
  const root = document.querySelector('#root')
  if (root === null) throw new Error('Built document has no application root.')
  root.innerHTML = content.html
  for (const script of document.querySelectorAll('script[src]')) script.remove()
  for (const preload of document.querySelectorAll('link[rel="modulepreload"]')) preload.remove()
  for (const preload of document.querySelectorAll('[data-app-preload]')) preload.remove()
  const stylesheet = document.querySelector('link[rel="stylesheet"]')
  if (stylesheet === null) throw new Error('Built document has no application stylesheet.')
  const fontPreload = document.createElement('link')
  fontPreload.setAttribute('rel', 'preload')
  fontPreload.setAttribute('as', 'font')
  fontPreload.setAttribute('type', 'font/woff2')
  fontPreload.setAttribute('crossorigin', 'anonymous')
  fontPreload.setAttribute('href', interFontUrl)
  stylesheet.before(fontPreload)
  for (const style of document.querySelectorAll('style')) {
    if (style.textContent?.includes('wm-skeleton') === true) style.remove()
  }
  const menu = document.querySelector('[data-prerender="language-menu"]')
  if (menu === null && pathname === '/') throw new Error('Landing language control is missing.')
  menu?.replaceWith(
    languageSwitcher(
      document,
      locale.code,
      menu?.querySelector('button')?.getAttribute('aria-label') ?? '',
    ),
  )
  const theme = document.querySelector('[data-prerender="theme-toggle"]')
  if (theme === null) throw new Error('Landing theme control is missing.')
  theme.dataset.staticTheme = ''
  for (const name of ['system', 'light', 'dark']) {
    theme.setAttribute(`data-label-${name}`, content.labels[name])
    const template = document.createElement('template')
    template.dataset.themeIcon = name
    template.innerHTML = content.icons[name]
    document.body.append(template)
  }
  const controls = document.createElement('script')
  controls.src = '/landing-controls.js'
  controls.defer = true
  document.head.append(controls)
  delete document.documentElement.dataset.theme
  document.documentElement.lang = locale.code
  document.documentElement.dir = locale.dir
  if (
    document.querySelector('h1') === null ||
    (pathname === '/' && document.querySelector('#features-heading') === null)
  ) {
    throw new Error(`Landing did not render its content for ${locale.code}.`)
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}\n`
}

await mkdir(OUTPUT_DIR, { recursive: true })
for (const locale of locales) {
  for (const pathname of ['/', '/privacy', '/terms']) {
    const rendered = await renderPublicPage(locale.code, pathname)
    const html = staticHtml(rendered, locale, pathname)
    const name = pathname === '/' ? locale.code : `${pathname.slice(1)}-${locale.code}`
    await writeFile(path.join(OUTPUT_DIR, `${name}.html`), html)
    console.info(`prerendered ${name} (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`)
  }
}
console.info(`landing pages written to ${OUTPUT_DIR}`)
