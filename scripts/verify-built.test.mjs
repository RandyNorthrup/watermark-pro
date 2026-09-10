/** Post-build proof against actual public artifacts; no application Worker or credentials are required. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { unzipSync } from 'fflate'
import { JSDOM } from 'jsdom'

import { SUPPORTED_LOCALES } from '../src/shared/locales.ts'

const client = path.resolve(process.env.LUMAFOIL_CLIENT_DIR ?? 'dist/client')
const headers = readFileSync(path.join(client, '_headers'), 'utf8')
const controls = readFileSync(path.join(client, 'landing-controls.js'), 'utf8')

test('built app theme resolver preserves saved choices and system fallback when storage is denied', () => {
  const html = readFileSync(path.join(client, 'index.html'), 'utf8')
  for (const dark of [false, true]) {
    for (const stored of [null, 'light', 'dark', 'invalid', 'denied']) {
      const dom = new JSDOM(html, {
        url: 'https://lumafoil.example/app',
        runScripts: 'outside-only',
      })
      const script = [...dom.window.document.querySelectorAll('script:not([src])')].find((item) =>
        item.textContent.includes('watermark-pro.theme'),
      )?.textContent
      assert.equal(typeof script, 'string')
      const hash = createHash('sha256').update(script).digest('base64')
      assert.ok(headers.includes(`'sha256-${hash}'`), 'Theme CSP must cover the final code')
      dom.window.matchMedia = (query) => {
        assert.equal(query, '(prefers-color-scheme: dark)')
        return { matches: dark }
      }
      if (stored === 'denied')
        Object.defineProperty(dom.window, 'localStorage', {
          get() {
            throw new Error('Fixture blocks preference storage')
          },
        })
      else if (stored !== null) dom.window.localStorage.setItem('watermark-pro.theme', stored)
      dom.window.eval(script)
      const fallback = dark ? 'dark' : 'light'
      const expected = stored === 'light' || stored === 'dark' ? stored : fallback
      assert.equal(dom.window.document.documentElement.dataset.theme, expected)
      assert.equal(Object.hasOwn(dom.window, 'stored'), false, 'Theme variables stay scoped')
      dom.window.close()
    }
  }
})

test('built app route hints have a matching CSP hash and reference the real new-preset modules', () => {
  const html = readFileSync(path.join(client, 'index.html'), 'utf8')
  const dom = new JSDOM(html, {
    url: 'https://lumafoil.example/app/library/new',
    runScripts: 'outside-only',
  })
  const { document } = dom.window
  assert.equal(
    document.querySelector('link[rel="preload"][as="font"]'),
    null,
    'The application shell must not restore the removed global font preload',
  )
  const map = document.querySelector('template#app-route-preloads')
  const controller = document.querySelector('script[data-app-preload]')
  assert.ok(map, 'The application resource map must be emitted')
  assert.ok(controller, 'The application preload controller must be emitted')
  const stylesheet = document.querySelector('link[rel="stylesheet"]')
  assert.ok(stylesheet)
  assert.equal(
    controller.compareDocumentPosition(stylesheet),
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'App hints must execute before the blocking stylesheet',
  )
  const script = controller.textContent ?? ''
  const hash = createHash('sha256').update(script).digest('base64')
  assert.ok(headers.includes(`'sha256-${hash}'`), 'Hash must cover the final controller bytes')
  dom.window.eval(script)
  const hints = [...document.querySelectorAll('link[rel="modulepreload"]')].map(
    (link) => new URL(link.href).pathname,
  )
  const manifest = JSON.parse(readFileSync(path.join(client, '.vite', 'manifest.json'), 'utf8'))
  for (const source of [
    'src/client/lib/app-bootstrap.ts',
    'src/client/routes/app/library/new.tsx?tsr-split=component',
    'src/client/routes/app/library/new.tsx?tsr-split=loader',
  ])
    assert.ok(hints.includes('/' + manifest[source].file), `Missing required hint: ${source}`)
  const edit = manifest['src/client/routes/app/library/$watermarkId.tsx?tsr-split=component']
  assert.equal(hints.includes('/' + edit.file), false, 'The new route must not select the ID route')
  for (const hint of hints) {
    const file = path.join(client, hint.slice(1))
    assert.ok(readFileSync(file).length > 0)
  }
})

test('the resolved deployment disables persistent platform request metadata', () => {
  const redirectRoot = path.resolve('.wrangler/deploy')
  const redirect = JSON.parse(readFileSync(path.join(redirectRoot, 'config.json'), 'utf8'))
  assert.equal(typeof redirect.configPath, 'string')
  const generatedPath = path.resolve(redirectRoot, redirect.configPath)
  const relativeOutput = path.relative(path.dirname(client), generatedPath)
  assert.ok(
    relativeOutput !== '' && !relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput),
    'The deploy redirect must select the freshly built output tree',
  )
  const generated = JSON.parse(readFileSync(generatedPath, 'utf8'))
  assert.deepEqual(generated.observability, {
    enabled: false,
    redact_query_string: true,
    logs: { enabled: false, invocation_logs: false, persist: false },
    traces: { enabled: false, persist: false },
  })
})

test('bundled software ships its licenses and the pinned media source offer', () => {
  const notices = readFileSync(path.join(client, 'third-party-licenses.md'), 'utf8')
  assert.match(notices, /react/)
  assert.match(notices, /Meta Platforms/)
  assert.match(notices, /mediabunny/)
  assert.match(notices, /Mozilla Public License/)
  const entries = notices.matchAll(/^## (.+) - ([0-9][^\n]*)$/gm).toArray()
  for (const [index, entry] of entries.entries()) {
    const body = notices.slice(entry.index + entry[0].length, entries[index + 1]?.index).trim()
    assert.notEqual(body, '', `Bundled dependency lacks its license text: ${entry[1]}`)
  }
  const project = JSON.parse(readFileSync('package.json', 'utf8'))
  const filename = `mediabunny-${project.dependencies.mediabunny}-source.zip`
  const offer = readFileSync(path.join(client, 'open-source.md'), 'utf8')
  assert.ok(offer.includes(filename))
  const archive = readFileSync(path.join(client, 'open-source', filename))
  const files = unzipSync(archive)
  for (const name of ['LICENSE', 'src/index.ts']) {
    assert.ok(files[name], `The corresponding source archive is missing ${name}`)
    assert.deepEqual(
      Buffer.from(files[name]),
      readFileSync(path.join('node_modules/mediabunny', name)),
    )
  }
})
for (const locale of SUPPORTED_LOCALES) {
  for (const surface of ['landing', 'privacy', 'terms']) {
    test(`built ${locale.code} ${surface} has real content, controls, links, and a valid inline CSP hash`, () => {
      const filename = surface === 'landing' ? locale.code : `${surface}-${locale.code}`
      const html = readFileSync(path.join(client, 'landing', `${filename}.html`), 'utf8')
      const dom = new JSDOM(html, { url: 'https://lumafoil.example/', runScripts: 'outside-only' })
      const { document } = dom.window
      assert.equal(document.documentElement.lang, locale.code)
      assert.equal(document.documentElement.dir, locale.dir)
      assert.ok(document.querySelector('h1')?.textContent?.trim())
      if (surface === 'landing') {
        assert.ok(document.querySelector('#features-heading'))
        assert.equal(document.querySelectorAll('img[fetchpriority="high"]').length, 1)
        const hero = document.querySelector('picture img')
        assert.ok(hero?.getAttribute('srcset')?.includes('editor-light-480.webp 480w'))
        assert.ok(hero?.getAttribute('sizes')?.includes('100vw'))
      } else {
        assert.ok(document.querySelectorAll('main h2').length > 2)
        assert.ok(
          document.querySelector(surface === 'privacy' ? 'a[href="/terms"]' : 'a[href="/privacy"]'),
        )
      }
      assert.equal(document.querySelector('script[type="module"]'), null)
      assert.equal(document.querySelector('link[rel="modulepreload"]'), null)
      assert.equal(document.querySelector('[data-app-preload]'), null)
      const fontPreload = document.querySelector('link[rel="preload"][as="font"]')
      const stylesheet = document.querySelector('link[rel="stylesheet"]')
      assert.match(fontPreload?.getAttribute('href') ?? '', /inter-latin-wght-normal-.+\.woff2$/)
      assert.equal(fontPreload?.getAttribute('type'), 'font/woff2')
      assert.equal(fontPreload?.getAttribute('crossorigin'), 'anonymous')
      assert.equal(
        fontPreload?.compareDocumentPosition(stylesheet),
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'Public font discovery must precede the blocking stylesheet',
      )
      assert.ok(
        document.querySelector('footer a[href="https://github.com/RandyNorthrup/watermark-pro"]'),
      )
      if (surface === 'landing')
        assert.equal(
          document.querySelectorAll('details a[hreflang]').length,
          SUPPORTED_LOCALES.length,
        )
      for (const script of document.querySelectorAll('script:not([src])')) {
        const hash = createHash('sha256')
          .update(script.textContent ?? '')
          .digest('base64')
        assert.ok(
          headers.includes(`'sha256-${hash}'`),
          'Inline script hash must match the actual serialized HTML',
        )
      }
      const button = document.querySelector('[data-static-theme]')
      assert.ok(button)
      // Only the OS preference API is supplied; execute the shipped controller unchanged.
      dom.window.matchMedia = () => ({
        matches: false,
        addEventListener() {
          /* The OS preference stays fixed during this click test. */
        },
      })
      dom.window.eval(controls)
      button.click()
      assert.equal(dom.window.localStorage.getItem('watermark-pro.theme'), 'light')
      if (surface === 'landing')
        assert.equal(document.querySelector('source[data-theme-picture="dark"]')?.media, 'not all')
      button.click()
      assert.equal(document.documentElement.dataset.theme, 'dark')
      assert.equal(button.getAttribute('aria-label'), button.dataset.labelDark)
      assert.ok(button.querySelector('svg'))
      if (surface === 'landing')
        assert.equal(document.querySelector('source[data-theme-picture="dark"]')?.media, 'all')
      dom.window.close()
    })
  }
}
